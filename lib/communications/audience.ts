/**
 * One audience resolver shared by the preview/approval step and the send step, so both always use the same
 * server-side rules. The browser never supplies the audience: it only names the approved recipients, and each must
 * still be eligible when the send happens.
 */
import { resolveRecipients, scopeKeyFor, isCommunicationType, type EligibleRecipient, type ExcludedRecipient, type CommunicationType } from "../communication-resolver";
import { communicationRecipientRepository } from "../repositories/communicationRecipientRepository";

export interface AudienceRequest {
  causeIds: string[];
  type: string;
  includePreviouslySent?: boolean;
  includeUnresolved?: boolean;
  /** Retry mode: only recipients of this earlier broadcast whose send failed (or is unresolved when allowed). */
  retryBroadcastId?: string;
}

export interface Audience {
  ok: boolean;
  status?: number;
  error?: string;
  type: CommunicationType;
  scopeKey: string;
  causeNames: string[];
  recipients: EligibleRecipient[];
  excluded: ExcludedRecipient[];
  stats: { raised: number; goalAmount: number; percentage: number };
}

export async function resolveAudience(req: AudienceRequest): Promise<Audience> {
  if (!isCommunicationType(req.type)) {
    return { ok: false, status: 400, error: `Unknown communication type "${req.type}".`, type: "general_communication", scopeKey: "", causeNames: [], recipients: [], excluded: [], stats: { raised: 0, goalAmount: 0, percentage: 0 } };
  }
  const resolution = await resolveRecipients(req.causeIds, req.type, { includePreviouslySent: req.includePreviouslySent, includeUnresolved: req.includeUnresolved });
  if (!resolution.ok) return { ...resolution, status: 400 };

  if (!req.retryBroadcastId) return { ...resolution };

  // Retry: intersect with the failed (and, only if allowed, unresolved) recipients of that broadcast.
  const history = (await communicationRecipientRepository.readFresh()).map((h) => h.entity);
  const rows = history.filter((h) => h.broadcastId === req.retryBroadcastId);
  if (rows.length === 0) return { ...resolution, ok: false, status: 404, error: `Broadcast ${req.retryBroadcastId} was not found.`, recipients: [] };
  if (rows.some((r) => r.communicationType !== req.type || r.scopeKey !== scopeKeyFor(req.causeIds))) {
    return { ...resolution, ok: false, status: 400, error: "The purpose or causes do not match the broadcast being retried.", recipients: [] };
  }
  const retryable = new Set(
    rows.filter((r) => r.status === "failed" || (req.includeUnresolved && r.status === "unresolved") || ((r.status === "queued" || r.status === "attempted") && Date.now() - new Date(r.updatedAt || r.createdAt).getTime() > 15 * 60 * 1000)).map((r) => r.donorId)
  );
  return { ...resolution, recipients: resolution.recipients.filter((r) => retryable.has(r.id)) };
}
