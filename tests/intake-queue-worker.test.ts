import { describe, it, expect, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock } from "./helpers/mocks";
import { FakeQueue } from "./helpers/fakeQueue";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { acceptDonation } from "@/lib/intake/intakeService";
import { runFinaliserPass } from "@/lib/intake/finaliser";
import { setLeaseBackend, MemoryLeaseBackend } from "@/lib/google/allocationLease";
import { buildDrainMessage, parseDrainMessage, drainIdempotencyKey, COALESCE_SECONDS, INTAKE_TOPIC } from "@/lib/intake/queue/messages";
import { signalDrain, publishStats, resetPublishStats } from "@/lib/intake/queue/dispatcher";
import { handleDrain, intakeRetryPolicy } from "@/lib/intake/queue/consumer";
import { reconcileIntake } from "@/lib/intake/queue/reconcile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/**
 * D38 Track C on a model of the DOCUMENTED Vercel Queues semantics (FAKE category: this is NOT a Vercel run). The queue carries only a wake-up signal
 * (a schema version, a type, a correlation id and a time bucket): Google Sheets stays authoritative and the finaliser reads the pending rows itself.
 */
const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
let proof = 0;
/** Intake rows carry REAL receivedAt timestamps, so "later" for reconciliation is the wall clock plus an offset (the queue keeps its own virtual clock). */
const later = (ms: number) => () => Date.now() + ms;
const INTAKE_HEADERS = ["submissionRef", "idempotencyKey", "payloadHash", "payload", "receivedAt", "state", "retryCount", "lastErrorCategory", "donationId", "completedAt", "updatedAt"];
async function setup() {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  fakeSheets.seed("Program_Content", ["id", "kind", "title"], []);
  causeRepository.invalidateCache();
  setLeaseBackend(new MemoryLeaseBackend());
  resetPublishStats();
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++proof}`, storage_backend: "google_drive" }));
}
const accept = (i: number) => acceptDonation({ donorName: `Donor ${i} PRIVATE`, donorContact: `i${i}@example.invalid`, amount: 100 + i, selectedCauses: [{ causeId: "C1" }], screenshotBuffer: Buffer.from("png"), screenshotFilename: "p.png", screenshotMimeType: "image/png", submissionKey: `K-${i}` });
/** The application's accept path: durable intake first, then a best-effort wake-up. */
const submit = async (q: FakeQueue, i: number) => {
  const r = await accept(i);
  await signalDrain(q.transport, { now: q.now, hint: r.reference });
  return r;
};
let passes = 0;
const countingPass = async (o: Record<string, unknown> = {}) => {
  passes++;
  return runFinaliserPass(o as any);
};
const deps = (q: FakeQueue, over: Record<string, unknown> = {}) => ({ pass: countingPass, transport: q.transport, now: () => q.now, ...over });
const states = () => fakeSheets.records("Donation_Intake").map((r: any) => r.state);
const drainAll = async (q: FakeQueue, over: Record<string, unknown> = {}, rounds = 12) => {
  for (let k = 0; k < rounds && q.pending() > 0; k++) {
    q.advance((COALESCE_SECONDS + 2) * 1000);
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q, over)).then(() => undefined));
  }
};

describe("D38 Track C: the wake-up message", () => {
  it("carries no donor data: a version, a type, a correlation id, a bucket and at most the public submission reference", async () => {
    await setup();
    const q = new FakeQueue();
    const r = await submit(q, 1);
    expect(q.messages).toHaveLength(1);
    const text = JSON.stringify(q.messages[0].payload);
    expect(text).not.toMatch(/PRIVATE|example\.invalid|Donor|amount|payload|proof/i);
    expect(parseDrainMessage(q.messages[0].payload)).toMatchObject({ v: 1, type: "intake.drain", hint: r.reference });
    expect(INTAKE_TOPIC).toMatch(/^[a-z0-9-]+$/);
  });

  it("an unknown or malformed message is ignored (and acknowledged), never processed as financial work", async () => {
    await setup();
    const q = new FakeQueue();
    expect(parseDrainMessage({ v: 2, type: "intake.drain" })).toBeNull();
    expect(parseDrainMessage({ v: 1, type: "something.else" })).toBeNull();
    expect(parseDrainMessage("nope")).toBeNull();
    const out = await handleDrain({ v: 9 }, { messageId: "x", deliveryCount: 1 }, deps(q));
    expect(out).toMatchObject({ ignored: true });
  });
});

describe("D38 Track C: coalescing a burst", () => {
  it("30 submissions in one burst produce a handful of wake-ups (not 30), a handful of finaliser passes, and 30 COMPLETE donations", async () => {
    await setup();
    const q = new FakeQueue();
    passes = 0;
    await Promise.all(Array.from({ length: 30 }, (_, i) => submit(q, i + 1)));
    expect(q.sent + q.deduped).toBe(30);
    expect(q.sent).toBeLessThanOrEqual(2); // one per time bucket
    await drainAll(q);
    expect(states().every((s: string) => s === "COMPLETE")).toBe(true);
    expect(fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"))).toHaveLength(30);
    expect(passes).toBeLessThanOrEqual(8); // 30 rows = 2 batches of 25, plus the idle checks; far from 30
  }, 60_000);

  it("a submission that arrives during a running pass is not lost: it is processed in the same drain, or its own wake-up comes after", async () => {
    await setup();
    const q = new FakeQueue();
    await submit(q, 1);
    let injected = false;
    q.advance((COALESCE_SECONDS + 2) * 1000);
    await q.deliverDue((m, meta) =>
      handleDrain(m, meta, deps(q, { pass: (o: any) => { passes++; return runFinaliserPass({ ...o, hooks: { stage: async (n: string) => { if (n === "donors-appended" && !injected) { injected = true; await submit(q, 2); } } } }); } })).then(() => undefined)
    );
    await drainAll(q);
    expect(states().sort()).toEqual(["COMPLETE", "COMPLETE"]);
    expect(fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"))).toHaveLength(2);
  }, 60_000);

  it("a submission in the SAME bucket as an already-sent wake-up is not stranded: the consumer starts after the bucket has ended, so it sees the row", async () => {
    await setup();
    const q = new FakeQueue();
    await submit(q, 1);
    q.advance(1_000); // still the same 5 s bucket: the second publish is deduplicated
    await submit(q, 2);
    expect(q.sent).toBe(1);
    expect(q.deduped).toBe(1);
    // the message is not visible before the coalescing window (+ skew margin) has passed
    expect(await q.deliverDue(async () => undefined)).toBe(0);
    q.advance((COALESCE_SECONDS + 2) * 1000);
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q)).then(() => undefined));
    expect(states()).toEqual(["COMPLETE", "COMPLETE"]);
  });

  it("the key of the NEXT bucket differs, so a wake-up is never swallowed by the key of an already-acknowledged one (the documented window is not relied on)", () => {
    const a = buildDrainMessage(1_000_000);
    const b = buildDrainMessage(1_000_000 + COALESCE_SECONDS * 1000);
    expect(drainIdempotencyKey(a.bucket)).not.toBe(drainIdempotencyKey(b.bucket));
  });
});

describe("D38 Track C: the publish / append gap", () => {
  it("append succeeded, publication failed: the submission is accepted, the failure is counted, and reconciliation redispatches it", async () => {
    await setup();
    const q = new FakeQueue();
    q.sendFailures.push(new Error("Simulated queue outage"));
    const r = await submit(q, 1);
    expect(r.state).toBe("RECEIVED");
    expect(q.pending()).toBe(0);
    expect(publishStats.failures).toBe(1);
    expect(states()).toEqual(["RECEIVED"]);
    q.advance(120_000);
    const rec = await reconcileIntake({ transport: q.transport, now: later(120_000), staleAfterSec: 60 });
    expect(rec).toMatchObject({ pending: 1, redispatched: true });
    await drainAll(q);
    expect(states()).toEqual(["COMPLETE"]);
  });

  it("publication succeeded but the response was lost: the donor retries, the same reference is returned, and exactly one donation results", async () => {
    await setup();
    const q = new FakeQueue();
    const first = await submit(q, 1);
    const retry = await submit(q, 1); // same key and payload
    expect(retry.reference).toBe(first.reference);
    await drainAll(q);
    expect(fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"))).toHaveLength(1);
    expect(states().sort()).toEqual(["COMPLETE", "DUPLICATE"]);
  });

  it("a recovery signal is never swallowed by the key of the wake-up it recovers (separate key namespaces per source)", async () => {
    await setup();
    const q = new FakeQueue();
    await submit(q, 1);
    q.messages = []; // the message is lost but its key is remembered inside the dedupe window
    await signalDrain(q.transport, { now: q.now, source: "accept" });
    expect(q.pending()).toBe(0); // the same key in the same bucket is (correctly) deduplicated
    await signalDrain(q.transport, { now: q.now, source: "reconcile" });
    expect(q.pending()).toBe(1); // the recovery key is its own: it goes through
    expect(drainIdempotencyKey(7, "accept")).not.toBe(drainIdempotencyKey(7, "reconcile"));
    expect(drainIdempotencyKey(7, "handoff")).not.toBe(drainIdempotencyKey(7, "reconcile"));
  });

  it("reconciliation does nothing for a healthy queue (no pending rows) and for rows that are still young", async () => {
    await setup();
    fakeSheets.seed("Donation_Intake", INTAKE_HEADERS, []); // provisioned, empty (a real worksheet is never silently created by a read)
    const q = new FakeQueue();
    expect(await reconcileIntake({ transport: q.transport, now: later(0), staleAfterSec: 60 })).toMatchObject({ pending: 0, redispatched: false });
    await accept(1);
    expect(await reconcileIntake({ transport: q.transport, now: later(0), staleAfterSec: 60 })).toMatchObject({ pending: 1, redispatched: false });
    expect(q.sent).toBe(0);
  });
});

describe("D38 Track C: at-least-once delivery, crashes, expiry, deployments", () => {
  it("a duplicate delivery of an already-processed wake-up is harmless (the second run finds nothing to do)", async () => {
    await setup();
    const q = new FakeQueue({ redeliverAfterAck: true });
    await submit(q, 1);
    q.advance((COALESCE_SECONDS + 2) * 1000);
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q)).then(() => undefined));
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q)).then(() => undefined)); // the duplicate
    expect(fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"))).toHaveLength(1);
    expect(states()).toEqual(["COMPLETE"]);
  });

  it("a consumer that crashes mid-pass: the message is redelivered and the work completes exactly once", async () => {
    await setup();
    const q = new FakeQueue({ retryAfterMs: 10_000 });
    await submit(q, 1);
    q.advance((COALESCE_SECONDS + 2) * 1000);
    let crashed = false;
    const crashing = (o: any) => { passes++; return runFinaliserPass({ ...o, hooks: { stage: (n: string) => { if (n === "donations-appended" && !crashed) { crashed = true; throw new Error("worker killed"); } } } }); };
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q, { pass: crashing })).then(() => undefined));
    q.advance(60_000);
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q)).then(() => undefined));
    await drainAll(q);
    expect(fakeSheets.records("Donations").filter((d: any) => String(d.id).startsWith("DA"))).toHaveLength(1);
    expect(states()).toEqual(["COMPLETE"]);
  });

  it("a message that EXPIRES (or is lost with a replaced deployment) leaves the accepted submissions in Sheets, and reconciliation redispatches them: no accepted submission is silent", async () => {
    await setup();
    const q = new FakeQueue();
    await Promise.all([1, 2, 3].map((i) => submit(q, i)));
    q.messages = []; // the queue lost everything (expiry, a deleted deployment)
    expect(states()).toEqual(["RECEIVED", "RECEIVED", "RECEIVED"]);
    q.advance(3_600_000);
    const rec = await reconcileIntake({ transport: q.transport, now: later(3_600_000), staleAfterSec: 60 });
    expect(rec).toMatchObject({ pending: 3, redispatched: true });
    await drainAll(q);
    expect(states()).toEqual(["COMPLETE", "COMPLETE", "COMPLETE"]);
  });

  it("a pass that cannot finish within its time budget hands off to a later wake-up instead of dropping the rest", async () => {
    await setup();
    const q = new FakeQueue();
    await Promise.all(Array.from({ length: 30 }, (_, i) => submit(q, i + 1)));
    q.advance((COALESCE_SECONDS + 2) * 1000);
    await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q, { budgetMs: 0, maxBatch: 10 })).then(() => undefined)); // a zero budget: one pass, then hand off
    expect(q.pending()).toBeGreaterThan(0); // a follow-up wake-up exists
    await drainAll(q, { maxBatch: 10 });
    expect(states().every((s: string) => s === "COMPLETE")).toBe(true);
  }, 60_000);
});

describe("D38 Track C: retry policy and application-level dead letter", () => {
  it("backs off with a bounded delay and acknowledges a message that keeps failing; the evidence stays in Sheets", () => {
    expect(intakeRetryPolicy(new Error("x"), { deliveryCount: 1 })).toEqual({ afterSeconds: 10 });
    expect(intakeRetryPolicy(new Error("x"), { deliveryCount: 4 })).toEqual({ afterSeconds: 80 });
    expect(intakeRetryPolicy(new Error("x"), { deliveryCount: 7 })).toEqual({ afterSeconds: 300 });
    expect(intakeRetryPolicy(new Error("x"), { deliveryCount: 9 })).toEqual({ acknowledge: true });
  });

  it("when Sheets cannot be read at all the consumer throws (so the queue retries); the rows stay RECEIVED and reconciliation can redispatch after the message is gone", async () => {
    await setup();
    const q = new FakeQueue({ maxDeliveries: 3, retryAfterMs: 5_000 });
    await submit(q, 1);
    const broken = async () => { throw new Error("Could not read Donation_Intake from Google Sheets: Simulated outage"); };
    for (let k = 0; k < 5; k++) {
      q.advance(40_000);
      await q.deliverDue((m, meta) => handleDrain(m, meta, deps(q, { pass: broken })).then(() => undefined));
    }
    expect(q.pending()).toBe(0); // dropped after maxDeliveries: there is no built-in dead-letter queue
    expect(q.dropped).toHaveLength(1);
    expect(states()).toEqual(["RECEIVED"]); // the only evidence of the accepted work is in Sheets, and it is intact
    const rec = await reconcileIntake({ transport: q.transport, now: later(3_600_000), staleAfterSec: 60 });
    expect(rec.redispatched).toBe(true);
    await drainAll(q);
    expect(states()).toEqual(["COMPLETE"]);
  }, 60_000);
});
