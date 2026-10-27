/**
 * lib/services/allocationService.ts
 *
 * Allocation records are SEPARATE from donations and from cause selections. An allocation says "this much of this
 * verified, designated donation was assigned to this cause/project", with its own permanent id, evidence and audit
 * trail. Nothing here marks a project complete; completion reports require verified evidence (see communication rules).
 *
 * Rules enforced server-side:
 *  - the donation must exist and be VERIFIED (received);
 *  - the donation must have an explicit, recorded designation for the cause (an unresolved multi-cause split must be
 *    recorded first);
 *  - active allocations for one designation never exceed its designated amount (checked before AND after the write,
 *    because Sheets has no transactions: a concurrent over-allocation is detected and rolled back);
 *  - evidence is attached only after the Drive upload succeeded; an upload failure creates no allocation;
 *  - a repeated request with the same requestKey returns the existing allocation (idempotent);
 *  - reversal keeps the record (status "reversed", reason, actor); nothing is deleted.
 */
import { allocationRepository, type AllocationEntity } from "../repositories/allocationRepository";
import { donationRepository } from "../repositories/donationRepository";
import { donationCauseRepository, designationId } from "../repositories/donationCauseRepository";
import { causeRepository } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { driveService } from "../google/drive";
import { realtimeBroadcaster } from "../realtime/broadcaster";
import { donationState } from "../donations/metrics";

export class AllocationError extends Error {
  constructor(message: string, public readonly httpStatus: 400 | 404 | 409 | 503 = 400) {
    super(message);
  }
}

const cents = (n: number) => Math.round(n * 100);
const newAllocationId = () => `ALLOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export interface CreateAllocationInput {
  donationId: string;
  causeId: string;
  amount: number;
  projectId?: string;
  notes?: string;
  requestKey?: string;
  actorEmail: string;
  evidence?: { buffer: Buffer; filename: string; mimeType: string };
}

/** Sum of ACTIVE allocations for one donation+cause, in paise. */
export function activeAllocatedCents(allocations: AllocationEntity[], donationId: string, causeId: string, excludeId?: string): number {
  return allocations
    .filter((a) => a.donationId === donationId && a.causeId === causeId && a.status === "active" && a.id !== excludeId)
    .reduce((sum, a) => sum + cents(a.allocatedAmount), 0);
}

export async function createAllocation(input: CreateAllocationInput): Promise<{ allocation: AllocationEntity; duplicate: boolean }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AllocationError("The allocation amount must be greater than zero.");
  const requestKey = (input.requestKey || "").trim().slice(0, 100);

  const [donations, designations, allocations, causes] = await Promise.all([
    donationRepository.getAll(true),
    donationCauseRepository.getAll(true),
    allocationRepository.getAll(true),
    causeRepository.getAll(),
  ]);

  if (requestKey) {
    const prior = allocations.find((a) => a.requestKey === requestKey);
    if (prior) return { allocation: prior, duplicate: true };
  }

  const matches = donations.filter((d) => d.id === input.donationId);
  if (matches.length === 0) throw new AllocationError(`Donation ${input.donationId} was not found.`, 404);
  if (matches.length > 1) throw new AllocationError(`Donation id ${input.donationId} is held by more than one row; resolve that first.`, 409);
  const donation = matches[0];
  if (donationState(donation.status) !== "received") throw new AllocationError("Only a verified donation can be allocated.", 409);

  const cause = causes.find((c) => c.id === input.causeId);
  if (!cause) throw new AllocationError(`Unknown cause ${input.causeId}.`, 404);
  if (["Draft", "Inactive"].includes(String(cause.status))) throw new AllocationError(`Cause "${cause.title}" is ${cause.status} and cannot receive allocations.`, 409);

  const relation = designations.find((d) => d.donationId === donation.id && d.causeId === input.causeId);
  if (!relation) throw new AllocationError(`Donation ${donation.id} is not related to cause ${cause.title}.`, 409);
  if (relation.designationStatus !== "designated" || relation.designatedAmount === null) {
    throw new AllocationError("The cause distribution of this donation has not been recorded yet. Record the designation first.", 409);
  }

  const designated = cents(relation.designatedAmount);
  const already = activeAllocatedCents(allocations, donation.id, input.causeId);
  if (already + cents(amount) > designated) {
    throw new AllocationError(`This would allocate ${((already + cents(amount)) / 100).toFixed(2)} against a designation of ${(designated / 100).toFixed(2)}.`, 409);
  }

  // Evidence first: if the upload fails nothing is recorded, so there is never a "completed" attachment without a file.
  let evidenceIds: string[] = [];
  if (input.evidence && input.evidence.buffer.length > 0) {
    try {
      const meta = await driveService.uploadFile(input.evidence.buffer, input.evidence.filename, input.evidence.mimeType, "Allocation Evidence", donation.id, input.actorEmail);
      evidenceIds = [meta.drive_file_id];
    } catch (err: any) {
      console.error("[Allocation] Evidence upload failed:", err.message);
      throw new AllocationError("The supporting evidence could not be stored, so the allocation was not recorded. Please retry.", 503);
    }
  }

  const nowIso = new Date().toISOString();
  const allocation: AllocationEntity = {
    id: newAllocationId(),
    donationId: donation.id,
    donorId: donation.donorId,
    donorName: donation.donorName,
    causeId: input.causeId,
    designationId: designationId(donation.id, input.causeId),
    projectId: input.projectId || "",
    caseId: "",
    targetTitle: cause.title,
    allocatedAmount: amount,
    allocationDate: nowIso,
    adminEmail: input.actorEmail,
    status: "active",
    notes: input.notes || "",
    createdAt: nowIso,
    evidenceDriveFileIds: evidenceIds,
    requestKey,
  };
  await allocationRepository.append(allocation);

  // Post-write check for concurrent over-allocation (no transactions in Sheets). Rows are appended in order, so only
  // the rows up to and including this one count: the earliest rows win and the surplus loses. Counting every row made
  // all simultaneous requests see the combined total and roll themselves back. Survivors never exceed the designation,
  // because each survivor's prefix (which includes every earlier survivor) already fits.
  const after = await allocationRepository.getAll(true);
  const mineAt = after.findIndex((a) => a.id === allocation.id);
  const mine = after.filter((a) => a.id === allocation.id).length;
  if (mine !== 1) throw new AllocationError("The allocation could not be confirmed after writing. Check the Allocations tab before retrying.", 503);
  const total = activeAllocatedCents(after.slice(0, mineAt + 1), donation.id, input.causeId);
  if (total > designated) {
    await allocationRepository.update(allocation.id, {
      status: "reversed",
      reversedReason: "Exceeded the designated amount (concurrent allocation detected)",
      reversedAt: new Date().toISOString(),
      reversedBy: "system",
    });
    throw new AllocationError("Another allocation was recorded at the same time and the designated amount would be exceeded. Nothing was allocated; please review and retry.", 409);
  }

  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: input.actorEmail,
      actor_role: "admin",
      action: "CREATE_ALLOCATION",
      entity_type: "Allocation",
      entity_id: allocation.id,
      before_state: null,
      after_state: { donationId: donation.id, causeId: input.causeId, amount, evidence: evidenceIds.length },
      timestamp: nowIso,
      source: "admin_allocations",
    });
  } catch (err: any) {
    console.error(`[Allocation] audit for ${allocation.id} failed:`, err.message);
  }
  void realtimeBroadcaster.publish("ALLOCATION_UPDATED", { id: allocation.id, donationId: donation.id });
  return { allocation, duplicate: false };
}

export async function reverseAllocation(id: string, reason: string, actorEmail: string): Promise<AllocationEntity> {
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3) throw new AllocationError("A reason is required to reverse an allocation.");
  const all = await allocationRepository.getAll(true);
  const existing = all.find((a) => a.id === id);
  if (!existing) throw new AllocationError(`Allocation ${id} was not found.`, 404);
  if (existing.status === "reversed") return existing; // idempotent
  const reversedAt = new Date().toISOString();
  const updated = { ...existing, status: "reversed" as const, reversedReason: cleanReason, reversedAt, reversedBy: actorEmail };
  await allocationRepository.save(updated);
  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: actorEmail,
      actor_role: "admin",
      action: "REVERSE_ALLOCATION",
      entity_type: "Allocation",
      entity_id: id,
      before_state: { status: "active", amount: existing.allocatedAmount },
      after_state: { status: "reversed", reason: cleanReason },
      timestamp: reversedAt,
      source: "admin_allocations",
    });
  } catch (err: any) {
    console.error(`[Allocation] audit for reversal of ${id} failed:`, err.message);
  }
  return updated;
}
