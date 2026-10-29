/**
 * lib/catalog/programs.ts
 *
 * One managed module for programs, campaigns and causes: a Causes row (kind "project" | "campaign" | "cause": identity,
 * lifecycle, target, image, fundraising) + a Program_Content row with the same id (presentation). One id, one lifecycle, no second catalog.
 *
 * Saving order: the content is validated and written FIRST, the cause (which decides visibility) second. If the second step
 * fails the program is not public yet (or keeps its old state), the call reports a partial failure, and saving again with
 * the same id completes it (both steps are idempotent). A save is never reported as successful unless both rows are stored.
 */
import { causeRepository, type Cause } from "../repositories/causeRepository";
import { saveCause, prepareCause, newCauseId, CatalogError, isSelectableCause, type CauseInput } from "./causes";
import { loadFunding, toCatalogItem, type CatalogItem } from "./public";
import { imagesByProgram } from "./programImages";
import { toImageView, type ProgramImageView } from "./programImagesSchema";
import { domainOf } from "./programDomains";
import { serverNow } from "./clock";
import { DEFAULT_CONTENT, prepareProgramContent, programContentRepository, type ProgramContent, type ProgramContentInput } from "./programContent";

export interface ProgramView extends CatalogItem {
  content: ProgramContent;
  /** Ordered gallery (detail page). */
  images: ProgramImageView[];
  /** Card cover: the selected cover image, else the first gallery image, else the cause's own image. */
  coverUrl: string;
}

export class PartialSaveError extends Error {
  constructor(message: string, public readonly causeId: string, public readonly contentSaved: boolean) {
    super(message);
  }
}

const byOrder = (a: ProgramView, b: ProgramView) => a.content.sortOrder - b.content.sortOrder || String(a.id).localeCompare(String(b.id));

async function build(filter: (c: Cause) => boolean): Promise<ProgramView[]> {
  const [all, contents, gallery] = await Promise.all([causeRepository.getAll(), programContentRepository.getAll(), imagesByProgram()]);
  const funding = await loadFunding(all);
  const byId = new Map(contents.map((c) => [c.id, c]));
  return all
    .filter(filter)
    .map((c) => {
      const item = toCatalogItem(c, funding);
      const images = (gallery.get(c.id) ?? []).map(toImageView);
      const cover = images.find((i) => i.isCover); // none selected: the card shows no picture
      return { ...item, content: byId.get(c.id) ?? DEFAULT_CONTENT(c.id), images, // The legacy single image is only a fallback for programs that have no gallery; once a gallery exists the card shows the
        // selected cover or no picture at all.
        coverUrl: cover?.url ?? (images.length ? "" : item.imageUrl) };
    })
    .sort(byOrder);
}

/** Every program, any status (administrators). */
export const getAdminPrograms = () => build(() => true);

let cache: { at: number; items: ProgramView[] } | null = null;
let inflight: Promise<ProgramView[]> | null = null;
const TTL_MS = 10_000;

/** Open programs only (Active, Urgent), in the administrator's order. Throws when Sheets cannot be read. */
export async function getPublicPrograms(now = Date.now()): Promise<ProgramView[]> {
  if (cache && now - cache.at < TTL_MS) return cache.items;
  if (inflight) return inflight;
  const load = build(isSelectableCause).then((items) => {
    cache = { at: Date.now(), items };
    return items;
  });
  inflight = load;
  try {
    return await load;
  } finally {
    if (inflight === load) inflight = null;
  }
}

export function invalidatePublicPrograms() {
  cache = null;
}

export interface ProgramInput extends CauseInput {
  content?: ProgramContentInput;
}

const MANAGED_KINDS = ["project", "campaign", "cause"] as const;

// One save at a time per server instance: a double-click or repeated submission of the same id is then an update, never a second row.
let saveChain: Promise<unknown> = Promise.resolve();

/** Validates everything, then stores content and cause. Throws CatalogError (invalid) or PartialSaveError (one half stored). */
export function saveProgram(input: ProgramInput, actorEmail: string): Promise<{ cause: Cause; content: ProgramContent; created: boolean }> {
  const run = saveChain.then(() => saveProgramNow(input, actorEmail));
  saveChain = run.catch(() => undefined);
  return run;
}

async function saveProgramNow(input: ProgramInput, actorEmail: string): Promise<{ cause: Cause; content: ProgramContent; created: boolean }> {
  const id = String(input.id ?? "").trim();
  if (!id) throw new CatalogError("A program needs an id (it is the permanent cause id).");
  const content = prepareProgramContent(id, input.content);
  // The verified-update timestamp is server-controlled: kept from the stored row, and only refreshed by an explicit record-update request.
  const stored = (await programContentRepository.getAll(true)).find((c) => c.id === id);
  content.lastUpdateAt = stored?.lastUpdateAt || "";
  content.holdClearedAt = stored?.holdClearedAt || "";
  content.holdClearedBy = stored?.holdClearedBy || "";
  if (input.content?.recordUpdate) {
    if (domainOf(content.template) !== "masjid") throw new CatalogError("Update tracking applies to Masjid Infrastructure projects only.");
    content.lastUpdateAt = serverNow().toISOString();
  }
  if (!input.content?.recordUpdate && stored && input.content?.updateNote === undefined) content.updateNote = stored.updateNote;

  // Validate the cause half WITHOUT writing, so an invalid program stores nothing at all.
  const kind = (MANAGED_KINDS as readonly string[]).includes(String(input.kind)) ? String(input.kind) : "project";
  prepareCause({ ...input, kind }, await causeRepository.getAll(true), newCauseId);

  try {
    await programContentRepository.save(content);
    programContentRepository.invalidateCache();
  } catch (err: any) {
    console.error(`[Programs] content for ${id} could not be stored:`, err?.message);
    throw new PartialSaveError("The program page content could not be stored in Google Sheets. Nothing was published.", id, false);
  }
  try {
    const { cause, created } = await saveCause({ ...input, kind }, actorEmail);
    return { cause, content, created };
  } catch (err: any) {
    if (err instanceof CatalogError) throw err;
    console.error(`[Programs] cause ${id} could not be stored:`, err?.message);
    throw new PartialSaveError("The page content was stored but the program record could not be saved, so its public state did not change. Save again to complete it.", id, true);
  }
}
