/**
 * Records an authorised admin's monetary split of one donation across the causes the donor selected.
 * Never invents a split: the admin supplies the amounts, which must reconcile exactly (see validateSplit), and the
 * change is audited. Existing active allocations cannot be left exceeding a reduced designation.
 */
import { donationRepository } from "../repositories/donationRepository";
import { donationCauseRepository } from "../repositories/donationCauseRepository";
import { allocationRepository } from "../repositories/allocationRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { donationState } from "../donations/metrics";
import { validateSplit, DesignationError } from "../donations/designations";
import { activeAllocatedCents, withDonationBalanceLock, AllocationError } from "./allocationService";

/** Runs under the allocation lease of the donation: lowering a designation must not interleave with an allocation checked against it. */
export async function recordDesignation(donationId: string, split: { causeId: string; amount: number }[], actorEmail: string) {
  try {
    return await withDonationBalanceLock(donationId, () => recordDesignationLocked(donationId, split, actorEmail));
  } catch (err) {
    if (err instanceof AllocationError && err.httpStatus === 503) throw new DesignationError(err.message, 503);
    throw err;
  }
}

async function recordDesignationLocked(donationId: string, split: { causeId: string; amount: number }[], actorEmail: string) {
  const donations = (await donationRepository.getAll(true)).filter((d) => d.id === donationId);
  if (donations.length === 0) throw new DesignationError(`Donation ${donationId} was not found.`, 400);
  if (donations.length > 1) throw new DesignationError(`Donation id ${donationId} is held by more than one row; resolve that first.`, 409);
  const donation = donations[0];
  if (donationState(donation.status) === "rejected") throw new DesignationError("A rejected donation cannot be designated.", 409);

  const rows = (await donationCauseRepository.readFreshWithRows()).filter((r) => r.entity.donationId === donationId);
  validateSplit(donation.amount, rows.map((r) => r.entity), split);

  const allocations = await allocationRepository.getAll(true);
  for (const s of split) {
    if (activeAllocatedCents(allocations, donationId, s.causeId) > Math.round(s.amount * 100)) {
      throw new DesignationError(`Active allocations for ${s.causeId} already exceed the new amount. Reverse them first.`, 409);
    }
  }

  const now = new Date().toISOString();
  const before = rows.map((r) => ({ causeId: r.entity.causeId, amount: r.entity.designatedAmount, status: r.entity.designationStatus }));
  await donationCauseRepository.rewrite(
    rows.map((r) => ({
      rowNumber: r.rowNumber,
      entity: { ...r.entity, designatedAmount: split.find((s) => s.causeId === r.entity.causeId)!.amount, designationStatus: "designated" as const, provenance: "admin" as const, updatedAt: now, updatedBy: actorEmail },
    }))
  );
  try {
    await auditLogRepository.append({
      id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actor_id: actorEmail,
      actor_role: "admin",
      action: "RECORD_DESIGNATION",
      entity_type: "Donation",
      entity_id: donationId,
      before_state: before,
      after_state: split,
      timestamp: now,
      source: "admin_designations",
    });
  } catch (err: any) {
    console.error(`[Designation] audit for ${donationId} failed:`, err.message);
  }
  return { donationId, split };
}
