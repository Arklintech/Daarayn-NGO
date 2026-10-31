/**
 * lib/intake/finaliser.ts  (D37, ISOLATED: nothing in the active donation path imports this module)
 *
 * Step 2 of the queued flow: turn RECEIVED intake rows into financial records, in batches.
 *
 * DESIGN PRINCIPLE: CONVERGENCE, NOT FENCING. Google Sheets cannot reject a write that carries an old authority token, so this finaliser does not
 * depend on exclusive authority for correctness. Every effect of a pass is
 *   - DETERMINISTIC: the permanent donation id is a pure function of the intake order (legacy maximum + rank among canonical intake rows), the
 *     canonical row of a key is the earliest row, designation/notification/audit ids derive from the submission reference;
 *   - IDEMPOTENT: re-running any step writes the same value again, or finds the result already there;
 *   - COLUMN-TARGETED: a writer touches only the cells it owns (opStatus/opPending, the intake state columns), never a whole row, so a late writer
 *     cannot overwrite a donation status an administrator changed meanwhile;
 *   - SELF-HEALING: a regressed or missing intake state is re-derived from the records on the next pass; duplicate rows are removed by the same
 *     earliest-row-wins rule every worker applies.
 * A stale worker that wakes up late therefore re-does work that is already done, to the same result. A lease (when one is available) only avoids
 * wasted work and adds a self-fencing check before each write stage; it is not what makes the pass correct.
 *
 * Limits stated plainly: ids are contiguous only while the queued path is the ONLY creator of donations after its first run (a direct-path donation
 * that takes a number in the queued range is detected as ID_COLLISION and sent to review, never overwritten); duplicate notification or audit rows
 * (same deterministic id) are possible when two workers run the same first attempt simultaneously, are harmless and are detectable by id.
 */
import { sheetsService, type TabAppend } from "../google/sheets";
import { withLease, LeaseBusyError, type Lease, type LeaseBackend } from "../google/allocationLease";
import { driveService } from "../google/drive";
import { donationRepository } from "../repositories/donationRepository";
import { donorRepository, generateDonorToken } from "../repositories/donorRepository";
import { donationCauseRepository, designationsForSelection } from "../repositories/donationCauseRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { contactKeys, normalizeEmail, normalizePhone } from "../donors/normalize";
import type { Donation, DonorProfile } from "../db";
import { INTAKE_SHEET, INTAKE_HEADERS, WORKING_STATES, parseIntakeRow, type IntakeEntry } from "./schema";

export interface FinaliserOptions {
  maxBatch?: number;
  maxRetries?: number;
  /** Default true: take the "intake-finaliser" lease and self-fence before each write stage. Correctness does not depend on it. */
  useLease?: boolean;
  leaseTtlMs?: number;
  leaseBackend?: LeaseBackend;
  minLeaseMs?: number;
  /** Test seam: called at each stage boundary (may throw to simulate a crash, or wait to simulate a stalled worker). */
  hooks?: { stage?: (name: string) => Promise<void> | void };
}

export interface PassResult {
  /** Intake rows read. */
  examined: number;
  /** Canonical rows worked on in this pass. */
  workSize: number;
  /** Donation rows this pass created. */
  assigned: number;
  completed: number;
  duplicates: number;
  rejected: number;
  failed: number;
  retryScheduled: number;
  skipped?: "busy" | "idle";
  aborted?: string;
  errorCategory?: string;
}

export class LostAuthorityError extends Error {
  constructor(public readonly stage: string) {
    super(`The processing authority was lost before stage "${stage}"; nothing was written by this stage.`);
  }
}

const empty = (): PassResult => ({ examined: 0, workSize: 0, assigned: 0, completed: 0, duplicates: 0, rejected: 0, failed: 0, retryScheduled: 0 });
const donationIdFor = (n: number) => "DA" + String(n).padStart(3, "0");
const split = (amount: number) => ({ directAid: Math.floor(amount * 0.9), opsCost: Math.floor(amount * 0.1) });

export function classifyError(err: unknown): string {
  if (err instanceof LostAuthorityError) return "LOST_AUTHORITY";
  const m = String((err as any)?.message || err);
  if (/quota|rate limit|429|busy|retriesExhausted/i.test(m)) return "QUOTA";
  if (/timeout|timed out|ECONN|ENOTFOUND|network|fetch failed|socket/i.test(m)) return "NETWORK";
  if (/integrity|conflict|different content/i.test(m)) return "INTEGRITY";
  return "INTERNAL";
}

export async function runFinaliserPass(opts: FinaliserOptions = {}): Promise<PassResult> {
  if (opts.useLease === false) return passBody(opts, null);
  try {
    return await withLease("intake-finaliser", (lease) => passBody(opts, lease), { acquireTimeoutMs: 0, ttlMs: opts.leaseTtlMs ?? 75_000, backend: opts.leaseBackend });
  } catch (err) {
    if (err instanceof LeaseBusyError) return { ...empty(), skipped: "busy" };
    throw err;
  }
}

type Row = { rowNumber: number; record: Record<string, any> };
type Kind = "CANONICAL" | "DUPLICATE" | "KEY_CONFLICT" | "INVALID";
interface Plan {
  e: IntakeEntry;
  kind: Kind;
  of?: IntakeEntry;
  rank?: number;
}

async function passBody(opts: FinaliserOptions, lease: Lease | null): Promise<PassResult> {
  const maxBatch = opts.maxBatch ?? 25;
  const maxRetries = opts.maxRetries ?? 5;
  const res = empty();
  const nowIso = () => new Date().toISOString();
  const stage = async (name: string) => {
    await opts.hooks?.stage?.(name);
    if (lease && !(await lease.stillValid(opts.minLeaseMs ?? 5_000))) throw new LostAuthorityError(name);
  };

  await sheetsService.ensureSheetExists(INTAKE_SHEET, INTAKE_HEADERS);
  const intakeSnap = await sheetsService.getRowsWithNumbers(INTAKE_SHEET);
  const entries = intakeSnap.rows.map((r: Row) => parseIntakeRow(r.rowNumber, r.record));
  res.examined = entries.length;

  // ---- 1. pure plan: canonical row per key, duplicates, conflicts, invalid rows; rank among canonical rows in intake order ----
  const firstByKey = new Map<string, IntakeEntry>();
  const plan: Plan[] = [];
  let rank = 0;
  for (const e of entries) {
    if (!e.valid) {
      plan.push({ e, kind: "INVALID" });
      continue;
    }
    const first = firstByKey.get(e.idempotencyKey);
    if (first) {
      plan.push({ e, kind: first.payloadHash === e.payloadHash ? "DUPLICATE" : "KEY_CONFLICT", of: first });
      continue;
    }
    firstByKey.set(e.idempotencyKey, e);
    plan.push({ e, kind: "CANONICAL", rank: ++rank });
  }

  const bookkeeping: { rowNumber: number; fields: Record<string, any> }[] = [];
  const dupProofs: string[] = [];
  for (const p of plan) {
    if (p.e.state && !WORKING_STATES.has(p.e.state)) continue; // terminal rows are never rewritten here
    if (p.kind === "DUPLICATE") {
      bookkeeping.push({ rowNumber: p.e.rowNumber, fields: { state: "DUPLICATE", lastErrorCategory: "", updatedAt: nowIso() } });
      res.duplicates++;
      const mine = p.e.payload?.proofDriveFileId;
      if (mine && p.of?.payload && p.of.payload.proofDriveFileId !== mine) dupProofs.push(mine);
    } else if (p.kind === "KEY_CONFLICT") {
      bookkeeping.push({ rowNumber: p.e.rowNumber, fields: { state: "REJECTED", lastErrorCategory: "KEY_REUSED", updatedAt: nowIso() } });
      res.rejected++;
    } else if (p.kind === "INVALID") {
      bookkeeping.push({ rowNumber: p.e.rowNumber, fields: { state: "FAILED_REQUIRES_REVIEW", lastErrorCategory: "INVALID_RECORD", updatedAt: nowIso() } });
      res.failed++;
    }
  }

  let work = plan.filter((p) => p.kind === "CANONICAL" && WORKING_STATES.has(p.e.state)).slice(0, maxBatch);
  // A row that has exhausted its retries goes to review instead of being tried again.
  for (const p of work) {
    if (p.e.state === "RETRY_PENDING" && p.e.retryCount >= maxRetries) {
      bookkeeping.push({ rowNumber: p.e.rowNumber, fields: { state: "FAILED_REQUIRES_REVIEW", updatedAt: nowIso() } });
      res.failed++;
    }
  }
  work = work.filter((p) => !(p.e.state === "RETRY_PENDING" && p.e.retryCount >= maxRetries));

  if (work.length === 0 && bookkeeping.length === 0) return { ...res, skipped: "idle" };
  res.workSize = work.length;

  const done = new Set<string>(); // rows whose COMPLETE write is confirmed: a later failure must never move them back
  try {
    if (bookkeeping.length) {
      await stage("before-bookkeeping");
      await sheetsService.updateFieldsLiteral(INTAKE_SHEET, bookkeeping);
      for (const id of dupProofs) await driveService.deleteFile(id).catch(() => undefined);
    }
    if (work.length === 0) return res;

    await Promise.all([donationRepository.init(), donorRepository.init(), donationCauseRepository.init(), notificationRepository.init(), auditLogRepository.init()]);
    const [donationSnap, donorSnap] = await Promise.all([sheetsService.getRowsWithNumbers(donationRepository.tabName), sheetsService.getRowsWithNumbers(donorRepository.tabName)]);
    await stage("planned");

    // ---- 2. deterministic ids: legacy maximum (rows without a submission reference) + rank ----
    let legacyMax = 0;
    for (const r of donationSnap.rows as Row[]) {
      if (String(r.record.submissionRef || "").startsWith("SUB-")) continue;
      const m = /^DA(\d+)$/.exec(String(r.record.id || ""));
      if (m) legacyMax = Math.max(legacyMax, parseInt(m[1], 10));
    }
    interface Item {
      e: IntakeEntry;
      donationId: string;
      donorId?: string;
      created: boolean;
    }
    const items: Item[] = [];
    const collisions: { rowNumber: number; fields: Record<string, any> }[] = [];
    for (const p of work) {
      const donationId = donationIdFor(legacyMax + (p.rank as number));
      const sameId = (donationSnap.rows as Row[]).filter((r) => String(r.record.id) === donationId && String(r.record.submissionRef || "") !== p.e.submissionRef);
      if (sameId.length > 0) {
        collisions.push({ rowNumber: p.e.rowNumber, fields: { state: "FAILED_REQUIRES_REVIEW", lastErrorCategory: "ID_COLLISION", updatedAt: nowIso() } });
        res.failed++;
        continue;
      }
      const has = (donationSnap.rows as Row[]).some((r) => String(r.record.submissionRef || "") === p.e.submissionRef);
      items.push({ e: p.e, donationId, created: !has });
    }
    if (collisions.length) await sheetsService.updateFieldsLiteral(INTAKE_SHEET, collisions);

    // ---- 3. donors: find once per contact, create the missing ones in one request, verify (earliest row wins) ----
    const toCreate = items.filter((i) => i.created);
    const donorKey = (c: string) => {
      const k = contactKeys(c);
      return k.email || k.phone;
    };
    const matchDonor = (rows: Row[], c: string) => {
      const k = contactKeys(c);
      return rows.filter((r) => (k.email && normalizeEmail(r.record.email) === k.email) || (k.phone && normalizePhone(r.record.phone) === k.phone));
    };
    const donorIdFor = new Map<string, string>();
    const newDonors = new Map<string, DonorProfile>();
    for (const it of toCreate) {
      const c = it.e.payload!.donorContact;
      const key = donorKey(c);
      if (donorIdFor.has(key) || newDonors.has(key)) continue;
      const found = matchDonor(donorSnap.rows as Row[], c)[0];
      if (found) {
        donorIdFor.set(key, String(found.record.id));
        continue;
      }
      const k = contactKeys(c);
      const isEmail = !!k.email;
      newDonors.set(key, {
        id: generateDonorToken(), name: it.e.payload!.donorName, email: k.email, phone: isEmail ? "" : k.phone, country: "India", city: "",
        donationPreference: it.e.payload!.causeTitle, communicationPreference: isEmail ? "Email" : "WhatsApp", dateJoined: it.e.receivedAt,
        totalDonations: 0, totalAmountDonated: 0, projectsSupportedCount: 0, casesSupportedCount: 0, donationHistory: [], projectsSupported: [], casesSupported: [], status: "active",
      } as DonorProfile);
    }
    if (newDonors.size) {
      const prepared = await Promise.all([...newDonors.values()].map((d) => donorRepository.prepareAppend(d)));
      await stage("before-donors");
      await sheetsService.appendRowsToTabs([{ sheetName: prepared[0].sheetName, expectedHeaders: prepared[0].expectedHeaders, records: prepared.flatMap((p) => p.records) }]);
      await stage("donors-appended");
      const verify = (await sheetsService.getRowsWithNumbers(donorRepository.tabName)).rows as Row[];
      for (const [key, d] of newDonors) {
        const mine = verify.find((r) => String(r.record.id) === d.id);
        if (!mine) throw new Error("The new donor row could not be located after writing.");
        const earlier = matchDonor(verify, d.email || d.phone).filter((r) => r.rowNumber < mine.rowNumber);
        if (earlier.length) {
          await sheetsService.clearRowAt(donorRepository.tabName, mine.rowNumber);
          donorIdFor.set(key, String(earlier[0].record.id));
        } else donorIdFor.set(key, d.id);
      }
      await stage("donors-verified");
    }

    // ---- 4. donation rows: the id is already final, so the row is appended directly (no placeholder); verify, earliest row per reference wins ----
    if (toCreate.length) {
      const records: Record<string, any>[] = [];
      let header: TabAppend | null = null;
      for (const it of toCreate) {
        const p = it.e.payload!;
        const k = contactKeys(p.donorContact);
        const sp = split(p.amount);
        const donation: Donation = {
          id: it.donationId, donorId: donorIdFor.get(donorKey(p.donorContact))!, donorName: p.donorName, donorEmail: k.email || "", amount: p.amount, currency: p.currency,
          date: it.e.receivedAt, status: "pending", paymentMethod: "UPI", donationType: p.causeTitle, causeId: p.causeId, causeTitle: p.causeTitle,
          proofDriveFileId: p.proofDriveFileId, transactionReference: p.upiRef, notes: `Allocation split: Direct Aid INR ${sp.directAid}, Ops INR ${sp.opsCost}`,
          selectedCauses: [], selection: p.selection, opStatus: "pending", opPending: "designations,notification,audit",
        } as Donation;
        header = await donationRepository.prepareAppend(donation);
        records.push({ ...header.records[0], submissionKey: it.e.idempotencyKey, submissionRef: it.e.submissionRef });
      }
      await stage("before-donations");
      await sheetsService.appendRowsToTabs([{ sheetName: header!.sheetName, expectedHeaders: header!.expectedHeaders, records }]);
      res.assigned = toCreate.length;
      await stage("donations-appended");
    }

    // verify every donation row of this batch (also repairs duplicates left by an earlier crash or a concurrent worker)
    const dv = (await sheetsService.getRowsWithNumbers(donationRepository.tabName)).rows as Row[];
    const rowOf = new Map<string, Row>();
    const finalItems: Item[] = [];
    for (const it of items) {
      const mine = dv.filter((r) => String(r.record.submissionRef || "") === it.e.submissionRef).sort((a, b) => a.rowNumber - b.rowNumber);
      if (mine.length === 0) throw new Error(`Donation row for ${it.e.submissionRef} was not found after writing.`);
      const clash = dv.some((r) => String(r.record.id) === it.donationId && String(r.record.submissionRef || "") !== it.e.submissionRef);
      if (clash) {
        for (const r of mine) await sheetsService.clearRowAt(donationRepository.tabName, r.rowNumber);
        await sheetsService.updateFieldsLiteral(INTAKE_SHEET, [{ rowNumber: it.e.rowNumber, fields: { state: "FAILED_REQUIRES_REVIEW", lastErrorCategory: "ID_COLLISION", updatedAt: nowIso() } }]);
        res.failed++;
        continue;
      }
      for (const dup of mine.slice(1)) await sheetsService.clearRowAt(donationRepository.tabName, dup.rowNumber);
      rowOf.set(it.e.submissionRef, mine[0]);
      finalItems.push(it);
    }
    await stage("donations-verified");

    // ---- 5. durable ID_ASSIGNED (a stale write of a lower state heals on the next pass: the state is derived from the records) ----
    const needIdState = finalItems.filter((i) => i.e.state !== "ID_ASSIGNED" || i.e.donationId !== i.donationId);
    await stage("before-id-assigned");
    await sheetsService.updateFieldsLiteral(INTAKE_SHEET, needIdState.map((i) => ({ rowNumber: i.e.rowNumber, fields: { state: "ID_ASSIGNED", donationId: i.donationId, lastErrorCategory: "", updatedAt: nowIso() } })));
    await stage("id-assigned-recorded");

    // ---- 6. follow-ups for donations that are not yet complete: designations, notification, audit in ONE atomic request ----
    const pending = finalItems.filter((i) => String(rowOf.get(i.e.submissionRef)!.record.opStatus || "") !== "complete");
    if (pending.some((i) => !i.e.payload)) throw new Error("integrity: a donation that is not complete has no intake payload to finish it from.");
    if (pending.length) {
      const recovery = pending.some((i) => i.e.state !== "RECEIVED" || i.e.retryCount > 0);
      let haveNotif = new Set<string>();
      let haveAudit = new Set<string>();
      if (recovery) {
        const [n, a] = await Promise.all([sheetsService.getRowsWithNumbers(notificationRepository.tabName), sheetsService.getRowsWithNumbers(auditLogRepository.tabName)]);
        haveNotif = new Set((n.rows as Row[]).map((r) => String(r.record.id)));
        haveAudit = new Set((a.rows as Row[]).map((r) => String(r.record.event_id || r.record.id)));
      }
      const designs = pending.flatMap((i) => designationsForSelection({ id: i.donationId, amount: i.e.payload!.amount }, i.e.payload!.selection.map((s) => ({ causeId: s.causeId, causeTitle: s.causeName })), i.e.receivedAt));
      const notifs = pending.filter((i) => !haveNotif.has(`NOTIF-${i.e.submissionRef}`)).map((i) => ({
        id: `NOTIF-${i.e.submissionRef}`, recipientType: "Admin" as const, recipientId: "all", type: "DONATION", title: "New Donation Received",
        message: `Received ₹${i.e.payload!.amount.toLocaleString()} for ${i.e.payload!.causeTitle} from ${i.e.payload!.donorName}${i.e.payload!.upiRef ? ` (Ref: ${i.e.payload!.upiRef})` : ""} — awaiting verification`,
        read: false, relatedEntityId: i.donationId, createdAt: i.e.receivedAt,
      }));
      const audits = pending.filter((i) => !haveAudit.has(`AUDIT-${i.e.submissionRef}-SUBMIT`)).map((i) => ({
        id: `AUDIT-${i.e.submissionRef}-SUBMIT`, actor_id: rowOf.get(i.e.submissionRef)!.record.donorId || "donor", actor_role: "donor", action: "SUBMIT_DONATION", entity_type: "Donation", entity_id: i.donationId,
        before_state: null, after_state: { amount: i.e.payload!.amount, cause: i.e.payload!.causeTitle, causes: i.e.payload!.selection.map((s) => s.causeId), trackingId: i.donationId, submissionRef: i.e.submissionRef, proofDriveFileId: i.e.payload!.proofDriveFileId, transactionReference: i.e.payload!.upiRef },
        timestamp: i.e.receivedAt, source: "queued_intake_finaliser",
      }));
      const batches: TabAppend[] = [donationCauseRepository.prepareRows(designs)];
      if (notifs.length) {
        const prep = await Promise.all(notifs.map((n) => notificationRepository.prepareAppend(n)));
        batches.push({ sheetName: prep[0].sheetName, expectedHeaders: prep[0].expectedHeaders, records: prep.flatMap((p) => p.records) });
      }
      if (audits.length) {
        const prep = await Promise.all(audits.map((a) => auditLogRepository.prepareAppend(a)));
        batches.push({ sheetName: prep[0].sheetName, expectedHeaders: prep[0].expectedHeaders, records: prep.flatMap((p) => p.records) });
      }
      await stage("before-followups");
      await sheetsService.appendRowsToTabs(batches);
      await stage("followups-written");
      await donationCauseRepository.settleAfterAppend(designs); // throws when rows with different content share an id
      await stage("followups-verified");
      await stage("before-completion");
      await sheetsService.updateFieldsLiteral(donationRepository.tabName, pending.map((i) => ({ rowNumber: rowOf.get(i.e.submissionRef)!.rowNumber, fields: { opStatus: "complete", opPending: "" } })));
      await stage("completion-written");
    }

    // ---- 7. COMPLETE: the intake payload is scrubbed (the hash stays) so donor data is not duplicated longer than needed ----
    await stage("before-intake-complete");
    await sheetsService.updateFieldsLiteral(INTAKE_SHEET, finalItems.map((i) => ({ rowNumber: i.e.rowNumber, fields: { state: "COMPLETE", donationId: i.donationId, completedAt: nowIso(), payload: "", lastErrorCategory: "", updatedAt: nowIso() } })));
    res.completed = finalItems.length;
    for (const i of finalItems) done.add(i.e.submissionRef);
    await stage("intake-completed");
    return res;
  } catch (err) {
    if (err instanceof LostAuthorityError) return { ...res, aborted: err.message, errorCategory: "LOST_AUTHORITY" };
    const category = classifyError(err);
    res.errorCategory = category;
    try {
      const marks = work.filter((p) => !done.has(p.e.submissionRef)).map((p) => {
        const next = p.e.retryCount + 1;
        return { rowNumber: p.e.rowNumber, fields: { state: next >= maxRetries ? "FAILED_REQUIRES_REVIEW" : "RETRY_PENDING", retryCount: next, lastErrorCategory: category, updatedAt: nowIso() } };
      });
      await sheetsService.updateFieldsLiteral(INTAKE_SHEET, marks);
      res.retryScheduled = marks.filter((m) => m.fields.state === "RETRY_PENDING").length;
      res.failed += marks.length - res.retryScheduled;
    } catch {
      /* the bookkeeping write failed as well: the rows stay as they were and the next pass tries again */
    }
    return res;
  }
}

/** Administrator action: send a row that needs review back to the queue. */
export async function requeueIntake(submissionRef: string): Promise<boolean> {
  const snap = await sheetsService.getRowsWithNumbers(INTAKE_SHEET);
  const row = (snap.rows as Row[]).find((r) => String(r.record.submissionRef) === submissionRef && String(r.record.state) === "FAILED_REQUIRES_REVIEW");
  if (!row) return false;
  await sheetsService.updateFieldsLiteral(INTAKE_SHEET, [{ rowNumber: row.rowNumber, fields: { state: "RETRY_PENDING", retryCount: 0, lastErrorCategory: "", updatedAt: new Date().toISOString() } }]);
  return true;
}
