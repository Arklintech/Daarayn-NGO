import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, driveMock, authState } from "./helpers/mocks";
import { FakeQueue } from "./helpers/fakeQueue";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { runFinaliserPass } from "@/lib/intake/finaliser";
import { setLeaseBackend, MemoryLeaseBackend } from "@/lib/google/allocationLease";
import { resetPublishStats } from "@/lib/intake/queue/dispatcher";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// The routes publish through the transport module; here it is the documented-semantics fake queue (a model, NOT Vercel).
vi.mock("@/lib/intake/queue/vercelTransport", () => ({ vercelQueueTransport: { send: (...a: any[]) => (globalThis as any).__fq.transport.send(...a) } }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const cause = (id: string) => ({ id, title: `Cause ${id}`, category: "Relief", targetAmount: "1000", raisedAmount: "0", location: "", description: "", status: "Active", imageUrl: "", driveFileId: "", createdAt: "", kind: "cause" });
const MON = "monitor-token-0123456789-abcdef";
const CRON = "cron-secret-0123456789-abcdefghi";
let q: FakeQueue;
let proof = 0;

beforeEach(async () => {
  await resetWorld();
  fakeSheets.seed("Causes", CAUSE_HEADERS, [cause("C1")]);
  fakeSheets.seed("Program_Content", ["id", "kind", "title"], []);
  causeRepository.invalidateCache();
  setLeaseBackend(new MemoryLeaseBackend());
  resetPublishStats();
  q = new FakeQueue();
  (globalThis as any).__fq = q;
  driveMock.uploadFile.mockImplementation(async () => ({ drive_file_id: `P${++proof}`, storage_backend: "google_drive" }));
  vi.stubEnv("DONATION_INTAKE_MODE", "queued");
  vi.stubEnv("OPS_MONITOR_TOKEN", MON);
  vi.stubEnv("CRON_SECRET", CRON);
});
afterEach(() => vi.unstubAllEnvs());

const submit = async (over: Record<string, string> = {}, drop: string[] = []) => {
  const { POST } = await import("@/app/api/intake/accept/route");
  const fd = new FormData();
  const f: Record<string, string> = { donorName: "Route Donor PRIVATE", donorContact: "route@example.invalid", amount: "250", cause: "General", selectedCauses: JSON.stringify([{ causeId: "C1" }]), submissionKey: `K-${Math.random()}`, ...over };
  for (const [k, v] of Object.entries(f)) if (!drop.includes(k)) fd.set(k, v);
  if (!drop.includes("screenshot")) fd.set("screenshot", new File([new Uint8Array([137, 80, 78, 71])], "p.png", { type: "image/png" }));
  return POST(new NextRequest("http://t/api/intake/accept", { method: "POST", body: fd, headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } }));
};
const get = async (mod: string, url: string, headers: Record<string, string> = {}) => ((await import(mod)) as any).GET(new NextRequest(`http://t${url}`, { headers }));
const intakeRows = () => fakeSheets.records("Donation_Intake");

describe("D38 accept route", () => {
  it("is OFF by default: 404, nothing read, nothing written", async () => {
    vi.unstubAllEnvs();
    const res = await submit();
    expect(res.status).toBe(404);
    expect(intakeRows()).toHaveLength(0);
  });

  it("answers 202 RECEIVED with a reference, never a donation number, and no personal data comes back", async () => {
    const res = await submit();
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ success: true, state: "RECEIVED", queued: true });
    expect(body.reference).toMatch(/^SUB-[0-9A-Z]{12}$/);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|route@example|DA\d{3}|trackingId|donationId/);
    expect(body.message).toMatch(/not yet your donation receipt/i);
    expect(intakeRows()).toHaveLength(1);
    expect(q.pending()).toBe(1);
  });

  it("a failed wake-up never fails an accepted submission: still 202, queued=false, the row is durable", async () => {
    q.sendFailures.push(new Error("Simulated queue outage"));
    const res = await submit();
    expect(res.status).toBe(202);
    expect(((await res.json()) as any).queued).toBe(false);
    expect(intakeRows()).toHaveLength(1);
  });

  it("validation failures store nothing: missing proof, bad amount, unknown cause", async () => {
    expect((await submit({}, ["screenshot"])).status).toBe(400);
    expect((await submit({ amount: "0" })).status).toBe(400);
    expect((await submit({ selectedCauses: JSON.stringify([{ causeId: "NOPE" }]) })).status).toBe(400);
    expect(intakeRows()).toHaveLength(0);
    expect(q.pending()).toBe(0);
  });

  it("production stays closed until financial activation is approved (503, nothing stored)", async () => {
    vi.stubEnv("GOOGLE_TARGET_ENV", "production");
    const res = await submit();
    expect(res.status).toBe(503);
    expect(intakeRows()).toHaveLength(0);
  });
});

describe("D38 status route", () => {
  it("rejects a malformed reference (400) and answers 404 for an unknown one; both reveal nothing", async () => {
    expect((await get("@/app/api/intake/status/route", "/api/intake/status?ref=nope")).status).toBe(400);
    expect((await get("@/app/api/intake/status/route", "/api/intake/status?ref=SUB-AAAAAAAAAAAA")).status).toBe(404);
  });

  it("walks RECEIVED -> COMPLETE; the donation number appears only when assigned; the answer never contains donor data", async () => {
    const ref = ((await (await submit()).json()) as any).reference;
    // the route caches an answer for 10 s per reference, so each state uses its own reference lookup via a fresh module
    vi.resetModules();
    let res = await get("@/app/api/intake/status/route", `/api/intake/status?ref=${ref}`);
    let body = (await res.json()) as any;
    expect(body).toMatchObject({ state: "RECEIVED", final: false });
    expect(body.donationId).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|example\.invalid|payload|amount/i);
    await runFinaliserPass({});
    vi.resetModules();
    res = await get("@/app/api/intake/status/route", `/api/intake/status?ref=${ref}`);
    body = (await res.json()) as any;
    expect(body).toMatchObject({ state: "COMPLETE", final: true, donationId: "DA001" });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|example\.invalid/);
  });

  it("is OFF with the mode off (404)", async () => {
    vi.unstubAllEnvs();
    expect((await get("@/app/api/intake/status/route", "/api/intake/status?ref=SUB-AAAAAAAAAAAA")).status).toBe(404);
  });
});

describe("D38 admin queue API", () => {
  const post = async (body: unknown) => ((await import("@/app/api/admin/intake-queue/route")) as any).POST(new NextRequest("http://t/api/admin/intake-queue", { method: "POST", body: JSON.stringify(body) }));
  const stuck = async () => {
    const ref = ((await (await submit()).json()) as any).reference;
    const t = fakeSheets.tabs.get("Donation_Intake")!;
    t.rows[0][t.headers.indexOf("state")] = "FAILED_REQUIRES_REVIEW";
    t.rows[0][t.headers.indexOf("lastErrorCategory")] = "INTERNAL";
    return ref as string;
  };

  it("requires an administrator", async () => {
    authState.role = "none";
    const res = await get("@/app/api/admin/intake-queue/route", "/api/admin/intake-queue");
    expect(res.status).not.toBe(200);
  });

  it("returns counts, ages, the waiting and review lists and the alarm, with no personal data", async () => {
    await stuck();
    await submit();
    const res = await get("@/app/api/admin/intake-queue/route", "/api/admin/intake-queue");
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, depth: 1, needsReview: 1, alarm: "review" });
    expect(body.review).toHaveLength(1);
    expect(body.waiting).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|example\.invalid/);
  });

  it("a requeue is AUDITED FIRST and then performed; the row returns to the queue and a wake-up is published", async () => {
    const ref = await stuck();
    const res = await post({ action: "requeue", ref });
    expect(res.status).toBe(200);
    const audit = fakeSheets.records("Audit_Log").filter((a: any) => a.action === "INTAKE_REQUEUE");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity_id: ref, actor_role: "admin" });
    expect((intakeRows()[0] as any).state).toBe("RETRY_PENDING");
    expect(q.pending()).toBeGreaterThanOrEqual(1);
  });

  it("if the audit record cannot be written the action is REFUSED and nothing changes (no intervention without a trace)", async () => {
    const ref = await stuck();
    await import("@/app/api/admin/intake-queue/route"); // the route and the spy must share one module graph (earlier tests reset modules)
    const { auditLogRepository: repo } = await import("@/lib/repositories/auditLogRepository");
    const spy = vi.spyOn(repo, "append").mockRejectedValueOnce(new Error("Simulated audit failure"));
    const res = await post({ action: "requeue", ref });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error).toMatch(/NOT performed/);
    expect((intakeRows()[0] as any).state).toBe("FAILED_REQUIRES_REVIEW");
    spy.mockRestore();
  });

  it("rejects unknown actions and malformed references", async () => {
    expect((await post({ action: "delete-everything" })).status).toBe(400);
    expect((await post({ action: "requeue", ref: "x" })).status).toBe(400);
  });
});

describe("D38 monitor and cron endpoints", () => {
  it("queue-status: disabled without a token, 401 with a wrong one, 200 healthy, 503 on a stale backlog, 503 when a row needs review", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("DONATION_INTAKE_MODE", "queued");
    expect((await get("@/app/api/ops/queue-status/route", "/api/ops/queue-status")).status).toBe(404);
    vi.stubEnv("OPS_MONITOR_TOKEN", MON);
    expect((await get("@/app/api/ops/queue-status/route", "/api/ops/queue-status", { authorization: "Bearer wrong-token-0123456789-abcdef" })).status).toBe(401);
    await submit();
    const ok = await get("@/app/api/ops/queue-status/route", "/api/ops/queue-status", { authorization: `Bearer ${MON}` });
    expect(ok.status).toBe(200);
    const t = fakeSheets.tabs.get("Donation_Intake")!;
    t.rows[0][t.headers.indexOf("receivedAt")] = new Date(Date.now() - 3_600_000).toISOString();
    const stale = await get("@/app/api/ops/queue-status/route", "/api/ops/queue-status?maxAge=300", { authorization: `Bearer ${MON}` });
    expect(stale.status).toBe(503);
    expect(((await stale.json()) as any).status).toBe("breach");
    t.rows[0][t.headers.indexOf("receivedAt")] = new Date().toISOString();
    t.rows[0][t.headers.indexOf("state")] = "FAILED_REQUIRES_REVIEW";
    expect((await get("@/app/api/ops/queue-status/route", "/api/ops/queue-status", { authorization: `Bearer ${MON}` })).status).toBe(503);
  });

  it("reconcile cron: disabled without CRON_SECRET, 401 with a wrong secret, redispatches a stale backlog with the right one", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await get("@/app/api/internal/intake/reconcile/route", "/api/internal/intake/reconcile")).status).toBe(404);
    vi.stubEnv("CRON_SECRET", CRON);
    expect((await get("@/app/api/internal/intake/reconcile/route", "/api/internal/intake/reconcile", { authorization: "Bearer nope-nope-nope-nope-nope-nope" })).status).toBe(401);
    await submit();
    q.messages = []; // the wake-up was lost, but the queue still remembers its idempotency key (the harder case)
    const t = fakeSheets.tabs.get("Donation_Intake")!;
    t.rows[0][t.headers.indexOf("receivedAt")] = new Date(Date.now() - 600_000).toISOString();
    const res = await get("@/app/api/internal/intake/reconcile/route", "/api/internal/intake/reconcile", { authorization: `Bearer ${CRON}` });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any)).toMatchObject({ pending: 1, redispatched: true });
    expect(q.pending()).toBe(1);
  });

  it("the queue consumer answers 404 when the queued mode is off (a second guard on top of the private trigger)", async () => {
    vi.unstubAllEnvs();
    const { POST } = await import("@/app/api/queues/intake-finaliser/route");
    expect((await POST(new Request("http://t/api/queues/intake-finaliser", { method: "POST", body: "{}" }))).status).toBe(404);
  });
});
