/**
 * Validation of an import batch BEFORE any real record reaches the production worksheets (pure functions, no Google request, no I/O).
 * The batch is plain data supplied by the owner at a later, separate onboarding stage; nothing here invents or defaults a financial value.
 * A batch is accepted only when `validateOnboardingBatch(...).ok` is true; every problem is reported with the worksheet, the row index and a code.
 */
export interface DonorRow { id: string; name?: string; email?: string; phone?: string }
export interface DonationRow { id: string; donorId: string; amount: number; status?: string; submissionKey?: string; date?: string }
export interface DesignationRow { donationId: string; causeId: string; designatedAmount: number | null }
export interface AllocationRow { id: string; donationId: string; causeId: string; allocatedAmount: number; status?: string; requestKey?: string }
export interface CauseRow { id: string }

export interface OnboardingBatch {
  donors: DonorRow[];
  donations: DonationRow[];
  designations: DesignationRow[];
  allocations: AllocationRow[];
  causes: CauseRow[];
  /** totals the owner states independently (for example from the trust's own books); compared with the batch, never computed from it */
  statedTotals?: { donationsTotal?: number; allocatedTotal?: number };
}

export interface Problem { sheet: string; row: number; code: string; message: string }

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const cents = (n: number) => Math.round(n * 100);
const isMoney = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export function validateOnboardingBatch(b: OnboardingBatch): { ok: boolean; problems: Problem[]; counts: Record<string, number> } {
  const problems: Problem[] = [];
  const add = (sheet: string, row: number, code: string, message: string) => problems.push({ sheet, row, code, message });

  const uniq = <T,>(sheet: string, rows: T[], key: (r: T) => string | undefined, label: string) => {
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const k = key(r);
      if (!k) return add(sheet, i, "MISSING_ID", `${label} is required`);
      if (!ID_RE.test(k)) add(sheet, i, "BAD_ID", `${label} "${k}" is not a valid permanent id`);
      if (seen.has(k)) add(sheet, i, "DUPLICATE_ID", `${label} "${k}" is also on row ${seen.get(k)}`);
      else seen.set(k, i);
    });
    return seen;
  };

  const donors = uniq("Donors", b.donors, (r) => r.id, "donor id");
  const donations = uniq("Donations", b.donations, (r) => r.id, "donation id");
  const causes = uniq("Causes", b.causes, (r) => r.id, "cause id");
  const allocationIds = uniq("Allocations", b.allocations, (r) => r.id, "allocation id");
  void allocationIds;

  const keys = new Map<string, number>();
  b.donations.forEach((d, i) => {
    if (!donors.has(d.donorId)) add("Donations", i, "DONOR_MISSING", `donation ${d.id} refers to donor "${d.donorId}" that is not in the batch`);
    if (!isMoney(d.amount) || d.amount <= 0) add("Donations", i, "BAD_AMOUNT", `donation ${d.id} has an invalid amount`);
    if (d.submissionKey) {
      if (keys.has(d.submissionKey)) add("Donations", i, "DUPLICATE_SUBMISSION_KEY", `submission key of ${d.id} repeats row ${keys.get(d.submissionKey)} (a duplicate donation)`);
      else keys.set(d.submissionKey, i);
    }
  });

  const designatedByDonation = new Map<string, number>();
  const designationKey = new Set<string>();
  b.designations.forEach((s, i) => {
    if (!donations.has(s.donationId)) add("Donation_Causes", i, "DONATION_MISSING", `designation refers to donation "${s.donationId}" that is not in the batch`);
    if (!causes.has(s.causeId)) add("Donation_Causes", i, "CAUSE_MISSING", `designation refers to cause "${s.causeId}" that is not in the batch`);
    const k = `${s.donationId}|${s.causeId}`;
    if (designationKey.has(k)) add("Donation_Causes", i, "DUPLICATE_DESIGNATION", `donation ${s.donationId} is designated to ${s.causeId} twice`);
    designationKey.add(k);
    if (s.designatedAmount !== null) {
      if (!isMoney(s.designatedAmount)) add("Donation_Causes", i, "BAD_AMOUNT", "designated amount is invalid");
      else designatedByDonation.set(s.donationId, (designatedByDonation.get(s.donationId) || 0) + cents(s.designatedAmount));
    }
  });
  for (const [id, c] of designatedByDonation) {
    const d = b.donations[donations.get(id) ?? -1];
    if (d && isMoney(d.amount) && c > cents(d.amount)) add("Donation_Causes", donations.get(id)!, "DESIGNATED_EXCEEDS_DONATION", `designations of ${id} total more than the donation`);
  }

  const designated = new Map<string, number | null>();
  b.designations.forEach((s) => designated.set(`${s.donationId}|${s.causeId}`, s.designatedAmount === null ? null : cents(s.designatedAmount)));
  const allocated = new Map<string, number>();
  const reqKeys = new Map<string, number>();
  b.allocations.forEach((a, i) => {
    if (!isMoney(a.allocatedAmount) || a.allocatedAmount <= 0) add("Allocations", i, "BAD_AMOUNT", `allocation ${a.id} has an invalid amount`);
    const k = `${a.donationId}|${a.causeId}`;
    if (!designated.has(k)) add("Allocations", i, "NO_DESIGNATION", `allocation ${a.id} has no recorded designation for ${a.causeId}`);
    if (a.requestKey) {
      if (reqKeys.has(a.requestKey)) add("Allocations", i, "DUPLICATE_REQUEST_KEY", `request key of ${a.id} repeats row ${reqKeys.get(a.requestKey)}`);
      else reqKeys.set(a.requestKey, i);
    }
    if ((a.status || "active") === "active" && isMoney(a.allocatedAmount)) allocated.set(k, (allocated.get(k) || 0) + cents(a.allocatedAmount));
  });
  for (const [k, c] of allocated) {
    const d = designated.get(k);
    if (d === null || d === undefined) continue;
    if (c > d) add("Allocations", -1, "ALLOCATED_EXCEEDS_DESIGNATED", `active allocations for ${k} total more than the designated amount`);
  }

  const total = b.donations.reduce((s, d) => s + (isMoney(d.amount) ? cents(d.amount) : 0), 0);
  const stated = b.statedTotals;
  if (stated?.donationsTotal !== undefined && cents(stated.donationsTotal) !== total) add("Donations", -1, "TOTAL_MISMATCH", `donations total ${(total / 100).toFixed(2)} differs from the stated total ${stated.donationsTotal.toFixed(2)}`);
  const allocTotal = [...allocated.values()].reduce((s, v) => s + v, 0);
  if (stated?.allocatedTotal !== undefined && cents(stated.allocatedTotal) !== allocTotal) add("Allocations", -1, "TOTAL_MISMATCH", `active allocations total ${(allocTotal / 100).toFixed(2)} differs from the stated total ${stated.allocatedTotal.toFixed(2)}`);

  return { ok: problems.length === 0, problems, counts: { donors: b.donors.length, donations: b.donations.length, designations: b.designations.length, allocations: b.allocations.length, causes: b.causes.length } };
}
