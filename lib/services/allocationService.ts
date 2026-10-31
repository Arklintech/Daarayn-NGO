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
import { sheetsService } from "../google/sheets";
import { allocationRepository, type AllocationEntity } from "../repositories/allocationRepository";
import { donationRepository } from "../repositories/donationRepository";
import { donationCauseRepository, designationId } from "../repositories/donationCauseRepository";
import { causeRepository } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { driveService } from "../google/drive";
import { realtimeBroadcaster } from "../realtime/broadcaster";
import { donationState } from "../donations/metrics";
import { withLease, LeaseBusyError, type Lease } from "../google/allocationLease";

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

/** True in a production environment until the owner has verified serialised allocation processing there (ALLOCATION_SERIALIZATION_VERIFIED=true). */
export function allocationsPaused(env: Record<string, string | undefined> = process.env): boolean {
  const production = (env.GOOGLE_TARGET_ENV || "").trim() === "production" || (env.VERCEL_ENV || "").trim() === "production";
  return production && (env.ALLOCATION_SERIALIZATION_VERIFIED || "").trim() !== "true";
}

/**
 * Compensating action: reverse a row the SYSTEM must not keep (unverifiable, duplicate key, over the cap). The reversal is idempotent, so it is
 * retried a few times with a short pause; the caller learns whether it finally stuck. A row that could not be reversed stays ACTIVE and is reported
 * by the reconciliation page (ALLOCATION_EXCEEDS_DESIGNATION); it is never silently left behind.
 */
async function reverseBySystem(id: string, reason: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await allocationRepository.update(id, { status: "reversed", reversedReason: reason, reversedAt: new Date().toISOString(), reversedBy: "system" });
      return true;
    } catch (err: any) {
      console.error(`[Allocation] system reversal of ${id} failed (attempt ${attempt}/3):`, err?.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 150 * attempt));
    }
  }
  console.error(`[Allocation] INTEGRITY INCIDENT: ${id} could not be reversed by the system and is still ACTIVE (${reason}).`);
  return false;
}

/**
 * Runs `fn` while holding the SAME lease that createAllocation takes for this donation. Every command that changes what an allocation is checked
 * against (the donation's verified state, its designated amounts) must run under it, otherwise it can interleave with an allocation in flight.
 */
export async function withDonationBalanceLock<T>(donationId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await withLease(`alloc:${String(donationId).slice(0, 150)}`, () => fn());
  } catch (err) {
    if (err instanceof LeaseBusyError) throw new AllocationError(err.message, 503);
    throw err;
  }
}

/** Refuses (409) while the donation has ACTIVE allocations; reads the allocations fresh. */
export async function assertNoActiveAllocations(donationId: string, what: string): Promise<void> {
  const all = await allocationRepository.getAll(true);
  const active = all.filter((a) => a.donationId === donationId && a.status === "active");
  if (active.length > 0) {
    throw new AllocationError(`${what} is not allowed while ${active.length} active allocation(s) exist for donation ${donationId}. Reverse them first.`, 409);
  }
}

/**
 * Creates an allocation. Commands that touch the same donation are SERIALISED by a lease (see lib/google/allocationLease.ts): losers wait for the
 * holder or are told "busy" (retryable), instead of racing and relying on after-the-fact reversal. The lease is mutual exclusion under bounded-delay
 * assumptions, NOT a transaction: Sheets cannot reject a stale writer, so the worker re-checks its lease just before writing and the post-write
 * verification below remains as the backstop.
 */
export async function createAllocation(input: CreateAllocationInput): Promise<{ allocation: AllocationEntity; duplicate: boolean }> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new AllocationError("The allocation amount must be greater than zero.");
  if (allocationsPaused()) throw new AllocationError("Allocations are paused in this environment until serialised processing has been verified (ALLOCATION_SERIALIZATION_VERIFIED).", 503);
  try {
    return await withLease(`alloc:${String(input.donationId).slice(0, 150)}`, (lease) => createAllocationLocked(input, lease));
  } catch (err) {
    if (err instanceof LeaseBusyError) throw new AllocationError(err.message, 503);
    throw err;
  }
}

async function createAllocationLocked(input: CreateAllocationInput, lease: Lease): Promise<{ allocation: AllocationEntity; duplicate: boolean }> {
  const amount = Number(input.amount);
  const requestKey = (input.requestKey || "").trim().slice(0, 100);

  // The four authoritative inputs are read FRESH in ONE batched Sheets request (not four), then each repository is refreshed from those rows.
  // Nothing comes from a cache: eligibility and the remaining balance are decided on what was just read.
  await Promise.all([donationRepository.init(), donationCauseRepository.init(), allocationRepository.init(), causeRepository.init()]);
  const batch = await sheetsService.batchGetRows([donationRepository.tabName, donationCauseRepository.tabName, allocationRepository.tabName, causeRepository.tabName]);
  const donations = donationRepository.hydrate(batch[donationRepository.tabName] || []);
  const designations = donationCauseRepository.hydrate(batch[donationCauseRepository.tabName] || []);
  const allocations = allocationRepository.hydrate(batch[allocationRepository.tabName] || []);
  const causes = causeRepository.hydrate(batch[causeRepository.tabName] || []);

  if (requestKey) {
    // A row the system itself reversed because its cap could not be verified (below) never happened: a retry with the same key starts over.
    const prior = allocations.find((a) => a.requestKey === requestKey && !(a.status === "reversed" && a.reversedBy === "system"));
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
  // Self-fencing: do not write unless this worker still holds the CURRENT lease with a safe margin left (a worker that stalled past its window must not write).
  if (!(await lease.stillValid(Number(process.env.ALLOCATION_LEASE_MIN_REMAINING_MS || 20_000)))) {
    throw new AllocationError("The exclusive processing window for this donation ended before the allocation could be written. Nothing was allocated; please retry.", 503);
  }
  await allocationRepository.append(allocation);

  // Post-write check for concurrent over-allocation (no transactions in Sheets). Rows are appended in order, so only
  // the rows up to and including this one count: the earliest rows win and the surplus loses. Counting every row made
  // all simultaneous requests see the combined total and roll themselves back. Survivors never exceed the designation,
  // because each survivor's prefix (which includes every earlier survivor) already fits.
  let after: AllocationEntity[];
  try {
    after = await allocationRepository.getAll(true);
  } catch (err: any) {
    // The row is written but the cap could not be checked (for example Google rate-limited the read). Never leave an unchecked
    // financial row active: reverse it as a system action so the retry (same key) starts clean; if even that fails, say so plainly.
    console.error(`[Allocation] ${allocation.id} written but not verifiable:`, err?.message);
    if (!(await reverseBySystem(allocation.id, "Could not verify the designated cap after writing (source error); reversed for safety"))) {
      throw new AllocationError(`The allocation ${allocation.id} may have been written but could not be verified or undone. It may still be ACTIVE: check the Allocations tab before retrying.`, 503);
    }
    throw new AllocationError("The allocation could not be verified because the records service was busy, so it was not kept. Please retry.", 503);
  }
  const mineAt = after.findIndex((a) => a.id === allocation.id);
  const mine = after.filter((a) => a.id === allocation.id).length;
  if (mine !== 1) throw new AllocationError("The allocation could not be confirmed after writing. Check the Allocations tab before retrying.", 503);
  // The same logical request (same idempotency key) arriving at two instances at once passes the pre-check in both. The EARLIEST row for
  // a key is the allocation; any later row with that key is a duplicate: it is reversed by the system and the caller gets the original.
  const systemReversed = (a: AllocationEntity) => a.status === "reversed" && a.reversedBy === "system";
  const firstByKey = new Map<string, AllocationEntity>();
  for (const a of after) if (a.requestKey && !systemReversed(a) && !firstByKey.has(a.requestKey)) firstByKey.set(a.requestKey, a);
  const winner = requestKey ? firstByKey.get(requestKey) : undefined;
  if (winner && winner.id !== allocation.id) {
    if (!(await reverseBySystem(allocation.id, "Duplicate of an identical request (same idempotency key); the earlier allocation stands"))) {
      throw new AllocationError(`The allocation ${allocation.id} duplicates an earlier request (${winner.id}) and could not be reversed automatically. It is still ACTIVE: reverse ${allocation.id} from the Allocations page.`, 503);
    }
    return { allocation: winner, duplicate: true };
  }
  // Rows that are later duplicates of an earlier same-key request never count toward another request's prefix total.
  const prefix = after.slice(0, mineAt + 1).filter((a) => !a.requestKey || firstByKey.get(a.requestKey)?.id === a.id || systemReversed(a));
  const total = activeAllocatedCents(prefix, donation.id, input.causeId);
  if (total > designated) {
    if (!(await reverseBySystem(allocation.id, "Exceeded the designated amount (concurrent allocation detected)"))) {
      throw new AllocationError(`The allocation ${allocation.id} exceeds the designated amount and could NOT be reversed automatically. It is still ACTIVE and over the limit: reverse ${allocation.id} from the Allocations page now (reconciliation also reports it).`, 503);
    }
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
