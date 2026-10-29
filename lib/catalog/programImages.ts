/**
 * lib/catalog/programImages.ts
 *
 * Ordered image gallery of a program (or campaign/cause): one Program_Images row per image, keyed by the permanent program id.
 * Binaries live in Google Drive (private; the media route serves them publicly only while the program is open); Sheets holds
 * only the file id and metadata. Removal is a soft removal (removedAt) so history is never lost; the Drive file is deleted
 * separately and only after the metadata change was stored.
 */
import { BaseRepository } from "../repositories/baseRepository";
import { CatalogError } from "./errors";

import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_PROGRAM, imageUrl, toImageView, validateImageFile, type ProgramImage, type ProgramImageView } from "./programImagesSchema";
export { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES_PER_PROGRAM, imageUrl, toImageView, validateImageFile };
export type { ProgramImage, ProgramImageView };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const HEADERS = ["id", "programId", "fileId", "caption", "alt", "sortOrder", "isCover", "mimeType", "createdAt", "removedAt"];

export class ProgramImageRepository extends BaseRepository<ProgramImage> {
  constructor() {
    super("Program_Images", HEADERS);
  }
  protected mapRowToEntity(row: Record<string, any>): ProgramImage {
    return {
      id: String(row.id || ""),
      programId: String(row.programId || ""),
      fileId: String(row.fileId || ""),
      caption: String(row.caption || ""),
      alt: String(row.alt || ""),
      sortOrder: Number(row.sortOrder || 0),
      isCover: String(row.isCover).toLowerCase() === "true",
      mimeType: String(row.mimeType || ""),
      createdAt: String(row.createdAt || ""),
      removedAt: String(row.removedAt || ""),
    };
  }
  protected mapEntityToRow(i: ProgramImage): Record<string, any> {
    return { ...i, isCover: i.isCover ? "true" : "false" };
  }
}
export const programImageRepository = new ProgramImageRepository();

/** Active images of one program, in display order. `fresh` re-reads Sheets (used before every write). */
export async function listImages(programId: string, fresh = false): Promise<ProgramImage[]> {
  const all = await programImageRepository.getAll(fresh);
  return all.filter((i) => i.programId === programId && !i.removedAt).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

/** All active images by program (one Sheets read), for building public/admin lists. */
export async function imagesByProgram(): Promise<Map<string, ProgramImage[]>> {
  const map = new Map<string, ProgramImage[]>();
  for (const i of (await programImageRepository.getAll()).filter((x) => !x.removedAt).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))) {
    (map.get(i.programId) ?? map.set(i.programId, []).get(i.programId)!).push(i);
  }
  return map;
}

let chain: Promise<unknown> = Promise.resolve();
/** Gallery writes run one at a time per server instance so order and the single cover stay consistent. */
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => undefined);
  return run;
}

const newId = () => `IMG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

/** Appends one image (after its file is safely in Drive). The first image of a program becomes its cover. */
export function addImage(programId: string, fileId: string, mimeType: string, meta: { caption?: string; alt?: string } = {}): Promise<ProgramImage> {
  return serialized(async () => {
    const existing = await listImages(programId, true);
    if (existing.length >= MAX_IMAGES_PER_PROGRAM) throw new CatalogError(`A program can have at most ${MAX_IMAGES_PER_PROGRAM} images.`);
    const image: ProgramImage = {
      id: newId(), programId, fileId, caption: clean(meta.caption, 200), alt: clean(meta.alt, 200), sortOrder: existing.length ? existing[existing.length - 1].sortOrder + 1 : 0,
      isCover: existing.length === 0, mimeType, createdAt: new Date().toISOString(), removedAt: "",
    };
    await programImageRepository.save(image);
    programImageRepository.invalidateCache();
    return image;
  });
}

export interface GalleryEdit {
  /** Image ids in the desired display order (must be exactly the program's active images). */
  order: string[];
  /** undefined keeps the current cover; null removes the card image (the card then shows no picture); an id selects it. */
  coverId?: string | null;
  items?: { id: string; caption?: string; alt?: string }[];
}

/** Reorders, sets captions/alt text and the cover in one validated update. */
export function updateGallery(programId: string, edit: GalleryEdit): Promise<ProgramImage[]> {
  return serialized(async () => {
    const current = await listImages(programId, true);
    const ids = new Set(current.map((i) => i.id));
    if (edit.order.length !== current.length || edit.order.some((id) => !ids.has(id)) || new Set(edit.order).size !== edit.order.length) {
      throw new CatalogError("The gallery changed or the order is incomplete. Reload the program and try again.", 409);
    }
    if (typeof edit.coverId === "string" && edit.coverId && !ids.has(edit.coverId)) throw new CatalogError("The cover image is not part of this program's gallery.", 400);
    const meta = new Map((edit.items || []).map((m) => [m.id, m]));
    for (const m of meta.keys()) if (!ids.has(m)) throw new CatalogError("An image to edit is not part of this program's gallery.", 400);
    const byId = new Map(current.map((i) => [i.id, i]));
    const cover = edit.coverId === null ? "" : edit.coverId || current.find((i) => i.isCover)?.id || "";
    const next = edit.order.map((id, index) => {
      const i = byId.get(id)!;
      const m = meta.get(id);
      return { ...i, sortOrder: index, isCover: id === cover, caption: m && m.caption !== undefined ? clean(m.caption, 200) : i.caption, alt: m && m.alt !== undefined ? clean(m.alt, 200) : i.alt };
    });
    for (const row of next) await programImageRepository.save(row);
    programImageRepository.invalidateCache();
    return next;
  });
}

/** Marks an image removed (history kept) and promotes another cover if needed. Returns the Drive file id to delete afterwards. */
export function removeImage(programId: string, imageId: string): Promise<{ fileId: string; remaining: ProgramImage[] }> {
  return serialized(async () => {
    const current = await listImages(programId, true);
    const target = current.find((i) => i.id === imageId);
    if (!target) throw new CatalogError("That image is not part of this program's gallery.", 404);
    await programImageRepository.save({ ...target, removedAt: new Date().toISOString(), isCover: false });
    const remaining = current.filter((i) => i.id !== imageId);
    if (target.isCover && remaining.length) {
      remaining[0] = { ...remaining[0], isCover: true };
      await programImageRepository.save(remaining[0]);
    }
    programImageRepository.invalidateCache();
    return { fileId: target.fileId, remaining };
  });
}

/** Points an existing gallery entry at a new Drive file (caption, alt text, order and cover are kept). Returns the old file id. */
export function replaceImageFile(programId: string, imageId: string, newFileId: string, mimeType: string): Promise<{ oldFileId: string }> {
  return serialized(async () => {
    const current = await listImages(programId, true);
    const target = current.find((i) => i.id === imageId);
    if (!target) throw new CatalogError("That image is not part of this program's gallery.", 404);
    await programImageRepository.save({ ...target, fileId: newFileId, mimeType });
    programImageRepository.invalidateCache();
    return { oldFileId: target.fileId };
  });
}
