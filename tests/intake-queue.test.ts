import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { acceptDonation } from "@/lib/intake/intakeService";
import { runFinaliserPass, requeueIntake, type FinaliserOptions } from "@/lib/intake/finaliser";
import { getIntakeStatus, computeQueueMetrics, donorFacingStatus } from "@/lib/intake/status";
import { parseIntakeRow, submissionReference, payloadHash } from "@/lib/intake/schema";
import { setLeaseBackend, MemoryLeaseBackend } from "@/lib/google/allocationLease";
import { registeredSchemas } from "@/lib/google/schemaRegistry";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D37 proofs on the in-memory sheets (FAKE category): the queued intake and the single-writer finaliser, in isolation. Nothing here touches the
 * active donation path. Crash tests throw at every stage boundary; the stale-worker tests run a worker that wakes up after another one finished.
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
let proof = 0;

async function setup() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1"), cause("C2")]);
  fakeSheets.seed("Program_Content", ["id", "kind", "title"], []); // a real spreadsheet always has it; the one-request eligibility read includes it
  causeRepository.invalidateCache();
  setLeaseBackend(new MemoryLeaseBackend());
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++proof}`, storage_backend: "google_drive" }));
  driveMock.deleteFile.mockImplementation(async () => true);
}
const accept = (i: number, over: Record<string, unknown> = {}) =>
  acceptDonation({ donorName: `Donor ${i}`, donorContact: `i${i}@example.invalid`, amount: 100 + i, selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${i}`, ...over });
const drain = async (opts: FinaliserOptions = {}, max = 30) => {
  let last = await runFinaliserPass(opts);
  for (let k = 0; k < max && last.skipped !== "idle"; k++) last = await runFinaliserPass(opts);
  return last;
};
const intake = () => fakeSheets.records("Donation_Intake");
const donations = () => fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"));

/** Financial invariants for `n` distinct canonical submissions that were all finalised. */
function violations(n: number): string[] {
  const out: string[] = [];
  const d = donations();
  const ids = d.map((x: any) => String(x.id));
  if (d.length !== n) out.push(`${n} donations expected, found ${d.length}`);
  if (new Set(ids).size !== ids.length) out.push("duplicate donation ids");
  const refs = d.map((x: any) => String(x.submissionRef));
  if (new Set(refs).size !== refs.length) out.push("two donation rows for one submission reference");
  const sorted = [...ids].sort();
  sorted.forEach((id, i) => { if (id !== "DA" + String(i + 1).padStart(3, "0")) out.push(`ids not contiguous at ${id}`); });
  if (fakeSheets.records("Donations").some((x: any) => x.id === "PENDING")) out.push("PENDING row left");
  const donors = fakeSheets.records("Donors");
  const emails = donors.map((x: any) => String(x.email));
  if (new Set(emails).size !== emails.length) out.push("duplicate donor rows");
  const dc = fakeSheets.records("Donation_Causes").map((x: any) => String(x.id));
  if (new Set(dc).size !== dc.length) out.push("duplicate designation rows");
  if (d.some((x: any) => x.opStatus !== "complete")) out.push("a donation is not complete");
  return out;
}

describe("D37 intake: durable, literal-safe, deterministic", () => {
  it("the intake worksheet is in the schema registry, so a cold instance reads its headers with the other tabs in one request", () => {
    expect(registeredSchemas().get("Donation_Intake")).toEqual(["submissionRef", "idempotencyKey", "payloadHash", "payload", "receivedAt", "state", "retryCount", "lastErrorCategory", "donationId", "completedAt", "updatedAt"]);
  });

  it("one atomic append; the row carries the reference, key, hash, minimised payload; no buffer, no id, nothing counted as a donation", async () => {
    await setup();
    const raw = vi.spyOn(fakeSheets, "appendRowRaw");
    const appendRow = vi.spyOn(fakeSheets, "appendRow");
    const r = await accept(1, { donorName: '=HYPERLINK("http://evil.invalid","x")' });
    expect(r.state).toBe("RECEIVED");
    expect(r.reference).toMatch(/^SUB-[0-9A-Z]{12}$/);
    expect(raw).toHaveBeenCalledTimes(1); // one literal (RAW) append
    expect(appendRow.mock.calls.filter((c) => c[0] === "Donation_Intake")).toHaveLength(0); // never the USER_ENTERED path
    const row = intake()[0] as any;
    expect(row).toMatchObject({ submissionRef: r.reference, idempotencyKey: "K-1", state: "RECEIVED", retryCount: "0", donationId: "", completedAt: "" });
    const e = parseIntakeRow(2, row);
    expect(e.valid).toBe(true);
    expect(payloadHash(e.payload!)).toBe(row.payloadHash);
    expect(submissionReference("K-1", row.payloadHash)).toBe(r.reference);
    expect(JSON.stringify(e.payload)).not.toMatch(/png|buffer/i);
    expect(e.payload!.proofDriveFileId).toMatch(/^P\d+$/);
    expect(donations()).toHaveLength(0);
  });

  it("the same submission always gets the same reference; another payload under the same key gets another one", async () => {
    await setup();
    const a = await accept(1);
    const b = await accept(1);
    const c = await accept(1, { amount: 999 });
    expect(b.reference).toBe(a.reference);
    expect(c.reference).not.toBe(a.reference);
  });

  it("an append that fails is never acknowledged and leaves no row", async () => {
    await setup();
    vi.spyOn(fakeSheets, "appendRowRaw").mockRejectedValueOnce(new Error("Simulated Sheets failure"));
    await expect(accept(1)).rejects.toThrow(/Simulated/);
    expect(intake()).toHaveLength(0);
  });

  it("invalid submissions are rejected before anything is stored", async () => {
    await setup();
    await expect(accept(1, { amount: 0 })).rejects.toThrow(/amount/i);
    await expect(accept(1, { donorContact: "nope" })).rejects.toThrow(/email|phone/i);
    await expect(accept(1, { selectedCauses: [{ causeId: "UNKNOWN" }] })).rejects.toThrow();
    expect(intake()).toHaveLength(0);
  });
});

describe("D37 finaliser: one donation end to end, and the states the donor sees", () => {
  it("RECEIVED -> ID_ASSIGNED -> COMPLETE; the donation number appears at ID_ASSIGNED and the final confirmation only at COMPLETE", async () => {
    await setup();
    const r = await accept(1);
    let s = (await getIntakeStatus(r.reference))!;
    expect(s).toMatchObject({ state: "RECEIVED", final: false });
    expect(s.donationId).toBeUndefined();
    const seen: string[] = [];
    await runFinaliserPass({ hooks: { stage: async (name) => { if (name === "id-assigned-recorded") seen.push(((await getIntakeStatus(r.reference))!).state + ":" + ((await getIntakeStatus(r.reference))!).final); } } });
    expect(seen).toEqual(["ID_ASSIGNED:false"]);
    s = (await getIntakeStatus(r.reference))!;
    expect(s).toMatchObject({ state: "COMPLETE", final: true, donationId: "DA001" });
    expect(violations(1)).toEqual([]);
    const d = donations()[0] as any;
    expect(d).toMatchObject({ id: "DA001", status: "pending", opStatus: "complete", submissionRef: r.reference });
    expect(fakeSheets.records("Notifications")).toHaveLength(1);
    expect(fakeSheets.records("Audit_Log").filter((a: any) => a.action === "SUBMIT_DONATION")).toHaveLength(1);
    const row = intake()[0] as any;
    expect(row.payload).toBe(""); // donor data is not kept in the queue after completion
    expect(row.completedAt).not.toBe("");
  });

  it("every non-final state uses wording that never claims a recorded donation", () => {
    const e = (state: string) => parseIntakeRow(2, { submissionRef: "SUB-X", idempotencyKey: "k", payloadHash: "h", payload: "", state, donationId: "DA007" }) ;
    for (const st of ["RECEIVED", "RETRY_PENDING", "FAILED_REQUIRES_REVIEW", "REJECTED"]) {
      const f = donorFacingStatus(e(st));
      expect(f.final).toBe(false);
      expect(f.message).not.toMatch(/has been recorded|thank you/i);
      expect(f.donationId).toBeUndefined();
    }
    expect(donorFacingStatus(e("ID_ASSIGNED"))).toMatchObject({ final: false, donationId: "DA007" });
    expect(donorFacingStatus(e("COMPLETE"))).toMatchObject({ final: true, donationId: "DA007" });
  });
});

describe("D37 deduplication and concurrency", () => {
  it("duplicate client submissions (same key, same payload) become ONE donation; the extra rows are DUPLICATE; a key reused with another payload is REJECTED", async () => {
    await setup();
    const refs = await Promise.all([accept(1), accept(1), accept(1)]);
    expect(new Set(refs.map((r) => r.reference)).size).toBe(1);
    const conflict = await accept(1, { amount: 4242 });
    expect(intake()).toHaveLength(4);
    const res = await drain();
    expect(res.skipped).toBe("idle");
    expect(violations(1)).toEqual([]);
    const states = intake().map((r: any) => r.state).sort();
    expect(states).toEqual(["COMPLETE", "DUPLICATE", "DUPLICATE", "REJECTED"]);
    expect((await getIntakeStatus(conflict.reference))).toMatchObject({ state: "REJECTED", final: false });
    expect((await getIntakeStatus(refs[0].reference))).toMatchObject({ state: "COMPLETE", final: true });
  });

  it("two instances receive the same key at the same moment and two workers run at the same moment WITHOUT a lease: still one donation, one donor, one designation", async () => {
    await setup();
    await Promise.all([accept(1), accept(1)]);
    await Promise.all([runFinaliserPass({ useLease: false }), runFinaliserPass({ useLease: false })]);
    await drain({ useLease: false });
    const fin = violations(1);
    expect(fin).toEqual([]);
  });

  for (const N of [6, 12, 20, 30]) {
    it(`${N} simultaneous different submissions: all accepted, then ${N} distinct contiguous ids, ${N} donors, exact follow-ups`, async () => {
      await setup();
      const accepted = await Promise.all(Array.from({ length: N }, (_, i) => accept(i + 1)));
      expect(new Set(accepted.map((a) => a.reference)).size).toBe(N);
      expect(intake()).toHaveLength(N);
      await drain({ maxBatch: 25 });
      expect(violations(N)).toEqual([]);
      expect(fakeSheets.records("Notifications")).toHaveLength(N);
      expect(fakeSheets.records("Audit_Log").filter((a: any) => a.action === "SUBMIT_DONATION")).toHaveLength(N);
      expect(intake().every((r: any) => r.state === "COMPLETE")).toBe(true);
    }, 120_000);
  }

  it("three workers at the same moment on 12 submissions, no lease: no duplicate donation, donor or designation (notification/audit may repeat by id)", async () => {
    await setup();
    await Promise.all(Array.from({ length: 12 }, (_, i) => accept(i + 1)));
    await Promise.all([runFinaliserPass({ useLease: false }), runFinaliserPass({ useLease: false }), runFinaliserPass({ useLease: false })]);
    await drain({ useLease: false });
    expect(violations(12)).toEqual([]);
    const nIds = fakeSheets.records("Notifications").map((x: any) => String(x.id));
    expect(new Set(nIds).size).toBe(12); // every notification id is present, repeats (if any) share the deterministic id
  }, 120_000);
});

describe("D37 crash recovery: the worker dies at every stage boundary and the next pass converges", () => {
  const STAGES = ["planned", "before-donors", "donors-appended", "donors-verified", "before-donations", "donations-appended", "donations-verified", "before-id-assigned", "id-assigned-recorded", "before-followups", "followups-written", "followups-verified", "before-completion", "completion-written", "before-intake-complete"];
  for (const crashAt of STAGES) {
    it(`crash at "${crashAt}": nothing lost, nothing duplicated, all 3 complete after recovery`, async () => {
      await setup();
      await Promise.all([accept(1), accept(2), accept(3)]);
      const first = await runFinaliserPass({ hooks: { stage: (n) => { if (n === crashAt) throw new Error(`crash@${n}`); } } });
      expect(first.errorCategory).toBeDefined();
      await drain();
      expect(violations(3)).toEqual([]);
      expect(fakeSheets.records("Notifications")).toHaveLength(3);
      expect(fakeSheets.records("Audit_Log").filter((a: any) => a.action === "SUBMIT_DONATION")).toHaveLength(3);
      expect(intake().every((r: any) => r.state === "COMPLETE")).toBe(true);
    });
  }
});

describe("D37 a stale worker cannot do harm after losing authority", () => {
  async function stalledScenario(useLease: boolean) {
    await setup();
    await Promise.all([accept(1), accept(2)]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let reached!: () => void;
    const at = new Promise<void>((r) => (reached = r));
    const backend = new MemoryLeaseBackend();
    setLeaseBackend(backend);
    // Worker A takes its snapshot and then stalls (long GC pause, frozen function).
    const a = runFinaliserPass({ useLease, leaseTtlMs: 150, minLeaseMs: 20, leaseBackend: backend, hooks: { stage: async (n) => { if (n === "planned") { reached(); await gate; } } } });
    await at;
    await new Promise((r) => setTimeout(r, 200)); // A's lease (if any) expires while it is stalled
    const b = await drain({ useLease, leaseTtlMs: 60_000, leaseBackend: backend });
    expect(b.skipped).toBe("idle");
    // an administrator verifies a donation in the meantime
    await donationRepository.updateStatus("DA001", "completed");
    release();
    const aResult = await a;
    await drain({ useLease: false });
    return aResult;
  }

  it("WITHOUT any fencing (no lease): the late worker re-does done work to the same result: no duplicate rows, ids unchanged, the administrator's status survives", async () => {
    await stalledScenario(false);
    expect(violations(2)).toEqual([]);
    expect((donations().find((d: any) => d.id === "DA001") as any).status).toBe("completed");
    expect(intake().every((r: any) => r.state === "COMPLETE")).toBe(true);
    expect(fakeSheets.records("Notifications")).toHaveLength(2);
  });

  it("WITH the lease: the late worker self-fences before its first write stage and aborts without writing; the end state is the same", async () => {
    const r = await stalledScenario(true);
    expect(r.aborted).toMatch(/authority was lost/);
    expect(violations(2)).toEqual([]);
    expect((donations().find((d: any) => d.id === "DA001") as any).status).toBe("completed");
  });
});

describe("D37 retries, review and ID safety", () => {
  it("persistent failure: RETRY_PENDING with a growing count, then FAILED_REQUIRES_REVIEW; a requeue after the fault is fixed completes it", async () => {
    await setup();
    const r = await accept(1);
    const real = fakeSheets.appendRowsToTabs.bind(fakeSheets);
    const spy = vi.spyOn(fakeSheets, "appendRowsToTabs").mockImplementation(async (b: any) => {
      if (b.some((x: any) => x.sheetName === "Donations")) throw new Error("Simulated quota exceeded 429");
      return real(b);
    });
    try {
      const seenStates: string[] = [];
      for (let k = 0; k < 4; k++) {
        const res = await runFinaliserPass({ maxRetries: 3 });
        if (res.skipped) break;
        seenStates.push(String((intake()[0] as any).state) + ":" + (intake()[0] as any).retryCount + ":" + (intake()[0] as any).lastErrorCategory);
      }
      expect(seenStates).toEqual(["RETRY_PENDING:1:QUOTA", "RETRY_PENDING:2:QUOTA", "FAILED_REQUIRES_REVIEW:3:QUOTA"]);
      expect((await getIntakeStatus(r.reference))!.message).toMatch(/review/i);
      expect(donations()).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
    expect(await requeueIntake(r.reference)).toBe(true);
    await drain();
    expect(violations(1)).toEqual([]);
  });

  it("a donation number already taken by another row is never overwritten: the intake row goes to review with ID_COLLISION", async () => {
    await setup();
    await accept(1);
    await runFinaliserPass({ hooks: { stage: async (n) => { if (n === "planned") await fakeSheets.appendRow("Donations", { id: "DA001", donorId: "legacy", donorName: "Legacy", amount: 5, status: "completed", date: new Date().toISOString() }); } } });
    const row = intake()[0] as any;
    expect(row).toMatchObject({ state: "FAILED_REQUIRES_REVIEW", lastErrorCategory: "ID_COLLISION" });
    const rows = fakeSheets.records("Donations").filter((d: any) => d.id === "DA001");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ donorName: "Legacy", status: "completed" });
  });

  it("a tampered intake row (reference or hash no longer matches its content) is not processed: FAILED_REQUIRES_REVIEW", async () => {
    await setup();
    await accept(1);
    const t = fakeSheets.tabs.get("Donation_Intake")!;
    const iAmount = t.headers.indexOf("payload");
    t.rows[0][iAmount] = t.rows[0][iAmount].replace(/"amount":\d+/, '"amount":999999');
    await drain();
    expect(intake()[0]).toMatchObject({ state: "FAILED_REQUIRES_REVIEW", lastErrorCategory: "INVALID_RECORD" });
    expect(donations()).toHaveLength(0);
  });
});

describe("D37 visibility: queue metrics", () => {
  it("depth, oldest pending age, retries, review count and the stale alarm", async () => {
    await setup();
    await Promise.all([accept(1), accept(2), accept(3)]);
    const rows = intake().map((r: any, i: number) => parseIntakeRow(i + 2, r));
    const now = Date.now() + 20 * 60_000;
    const m = computeQueueMetrics(rows, now, 900);
    expect(m.depth).toBe(3);
    expect(m.oldestPendingAgeSec).toBeGreaterThanOrEqual(1200);
    expect(m.stale).toBe(3);
    await drain();
    const after = computeQueueMetrics(intake().map((r: any, i: number) => parseIntakeRow(i + 2, r)), now, 900);
    expect(after).toMatchObject({ depth: 0, stale: 0, needsReview: 0 });
    expect(after.byState.COMPLETE).toBe(3);
  });
});
