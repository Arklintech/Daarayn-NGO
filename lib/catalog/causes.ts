/**
 * lib/catalog/causes.ts
 *
 * The cause / project / campaign catalog (Causes tab). Every consumer (donation form, admin screens, CRM filters,
 * communications, allocations, reports) reads causes through causeRepository; nothing hardcodes cause names.
 *
 * - A cause has a PERMANENT id (never changes when the title changes) and a lifecycle status.
 * - Selectable for new donations: Active, Urgent. Draft, Completed and Inactive are not.
 * - Deactivating or renaming never touches historical records: donations, designations, allocations and
 *   communications reference the id.
 * - Creating a cause does not subscribe any existing donor to it. Donors are associated only through an actual
 *   donation selection (Donation_Causes) or an explicit authorised operation.
 */
import { causeRepository, type Cause } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { CatalogError } from "./errors";

export const CAUSE_STATUSES = ["Draft", "Active", "Urgent", "Completed", "Inactive"] as const;
export type CauseStatus = (typeof CAUSE_STATUSES)[number];
export const CAUSE_KINDS = ["cause", "project", "campaign"] as const;
export type CauseKind = (typeof CAUSE_KINDS)[number];

export const isSelectableStatus = (status: unknown) => normalizeStatus(status) === "Active" || normalizeStatus(status) === "Urgent";
export const isSelectableCause = (c: Pick<Cause, "status">) => isSelectableStatus(c.status);

export function normalizeStatus(status: unknown): CauseStatus | null {
  const s = String(status ?? "").trim().toLowerCase();
  return CAUSE_STATUSES.find((x) => x.toLowerCase() === s) ?? null;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const normTitle = (t: unknown) => String(t ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export { CatalogError };

export interface CauseInput {
  id?: string;
  title?: string;
  name?: string;
  category?: string;
  targetAmount?: number | string;
  goalAmount?: number | string;
  raisedAmount?: number | string;
  location?: string;
  description?: string;
  status?: string;
  imageUrl?: string;
  driveFileId?: string;
  createdAt?: string;
  kind?: string;
  isCampaign?: boolean;
  type?: string;
}

/** Pure validation + normalisation. Returns the entity to store or throws CatalogError. */
export function prepareCause(input: CauseInput, existing: Cause[], newId: () => string): { cause: Cause & { kind: CauseKind }; created: boolean; previous?: Cause } {
  const title = String(input.title ?? input.name ?? "").trim().replace(/\s+/g, " ");
  if (!title) throw new CatalogError("A cause needs a title.");
  if (title.length > 160) throw new CatalogError("The title is too long (160 characters maximum).");

  const providedId = String(input.id ?? "").trim();
  if (providedId && !SAFE_ID.test(providedId)) throw new CatalogError("The id may contain only letters, digits, '-' and '_' (3-64 characters).");
  const previous = providedId ? existing.find((c) => c.id === providedId) : undefined;

  const clash = existing.find((c) => normTitle(c.title) === normTitle(title) && c.id !== previous?.id);
  if (clash) throw new CatalogError(`Another entry already uses the title "${clash.title}" (${clash.id}).`, 409);

  let status: CauseStatus;
  if (input.status === undefined || input.status === "") {
    status = (previous ? normalizeStatus(previous.status) : "Draft") ?? "Draft";
  } else {
    const s = normalizeStatus(input.status);
    if (!s) throw new CatalogError(`Unknown status "${input.status}". Use one of: ${CAUSE_STATUSES.join(", ")}.`);
    status = s;
  }

  const target = Number(input.targetAmount ?? input.goalAmount ?? previous?.targetAmount ?? 0);
  if (!Number.isFinite(target) || target < 0) throw new CatalogError("The target amount must be zero or a positive number.");

  // Activating requires a usable configuration.
  if (isSelectableStatus(status)) {
    if (!(target > 0)) throw new CatalogError("An active cause needs a target amount greater than zero.");
  }
  // A closed cause cannot be re-selected silently: only an explicit status change reopens it (checked above).

  const kindRaw = String(input.kind ?? (input.isCampaign ? "campaign" : (previous as any)?.kind ?? "cause")).toLowerCase();
  const kind = (CAUSE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as CauseKind) : "cause";

  const id = previous?.id || providedId || newId();
  const cause: Cause & { kind: CauseKind } = {
    id,
    title,
    category: String(input.category ?? previous?.category ?? "General") || "General",
    targetAmount: target,
    // Stored "raised" is legacy; reports derive it from designations.
    raisedAmount: Number(previous?.raisedAmount ?? input.raisedAmount ?? 0) || 0,
    location: String(input.location ?? previous?.location ?? "National"),
    description: String(input.description ?? previous?.description ?? ""),
    status: status as Cause["status"],
    imageUrl: String(input.imageUrl ?? previous?.imageUrl ?? ""),
    driveFileId: String(input.driveFileId ?? previous?.driveFileId ?? ""),
    createdAt: previous?.createdAt || new Date().toISOString(),
    kind,
  };
  return { cause, created: !previous, previous };
}

export const newCauseId = () => `CAUSE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// Saves are serialised inside one server instance: a double-click or a repeated submission with the same id is then an
// UPDATE of the same row, never a second row. (Across instances uniqueness still rests on the title/id check, as for other entities.)
let saveChain: Promise<unknown> = Promise.resolve();

/** Persists a cause (create or update), audits it, refreshes the shared cache. Throws CatalogError on invalid input. */
export function saveCause(input: CauseInput, actorEmail: string): Promise<{ cause: Cause; created: boolean }> {
  const run = saveChain.then(() => saveCauseNow(input, actorEmail));
  saveChain = run.catch(() => undefined);
  return run;
}

async function saveCauseNow(input: CauseInput, actorEmail: string): Promise<{ cause: Cause; created: boolean }> {
  const existing = await causeRepository.getAll(true);
  const { cause, created, previous } = prepareCause(input, existing, newCauseId);
  await causeRepository.save(cause as Cause);
  causeRepository.invalidateCache();
  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: actorEmail,
      actor_role: "admin",
      action: created ? "CREATE_CAUSE" : previous && previous.status !== cause.status ? "CHANGE_CAUSE_STATUS" : "UPDATE_CAUSE",
      entity_type: "Cause",
      entity_id: cause.id,
      before_state: previous ? { title: previous.title, status: previous.status } : null,
      after_state: { title: cause.title, status: cause.status },
      timestamp: new Date().toISOString(),
      source: "admin_catalog",
    });
  } catch (err: any) {
    console.error(`[Catalog] audit for ${cause.id} failed:`, err.message);
  }
  return { cause, created };
}
