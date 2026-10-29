import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";

const api = vi.hoisted(() => ({ append: vi.fn(), update: vi.fn(), get: vi.fn() }));
vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: class { constructor(_o: any) {} } },
    sheets: () => ({ spreadsheets: { values: { append: api.append, update: api.update, get: api.get } } }),
  },
}));

const ID = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
const saved = { ...process.env };
const task = (over: any = {}) => ({ entity: "donors", entityId: "DNR-1", operation: "CREATE", data: { name: "Sync Test" }, status: "PENDING", syncAttempts: 0, createdAt: "2026-10-28T00:00:00Z", ...over });
/** Sheet behaviour: header row ["ID","name"], first column holds the given ids. */
const sheetHas = (ids: string[]) =>
  api.get.mockImplementation(async ({ range }: any) => ({ data: { values: String(range).endsWith("!1:1") ? [["ID", "name"]] : [["ID"], ...ids.map((i) => [i])] } }));
const engine = async (configured = true) => {
  process.env = { ...saved };
  Object.assign(process.env, configured ? { GOOGLE_SHEET_ID: ID, GOOGLE_TEST_SHEET_ID: ID, GOOGLE_TARGET_ENV: "test", GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY } : { GOOGLE_SHEET_ID: "", GOOGLE_CLIENT_EMAIL: "", GOOGLE_PRIVATE_KEY: "" });
  vi.resetModules();
  return (await import("@/lib/sync/SyncEngine")).SyncEngine;
};
/** Row writes only (header writes use the 1:1 range). */
const rowUpdates = () => api.update.mock.calls.filter((c: any) => /!A\d+$/.test(String(c[0].range)));
const audits = () => fakeSheets.records("Audit_Log").filter((a: any) => a.source === "sync_audit_logger");

beforeEach(async () => {
  await resetWorld();
  api.append.mockReset().mockResolvedValue({ data: {} });
  api.update.mockReset().mockResolvedValue({ data: {} });
  api.get.mockReset();
});
afterEach(() => {
  process.env = { ...saved };
});

describe("SyncEngine.executeSyncTask reports the truth about the write", () => {
  it("CREATE of a new id appends exactly once and returns success; the audit says SUCCESS", async () => {
    sheetHas([]);
    const out = await (await engine()).executeSyncTask("t1", task() as any);
    expect(out).toEqual({ success: true });
    expect(api.append).toHaveBeenCalledTimes(1);
    expect(audits().map((a: any) => JSON.parse(a.after_state).status)).toEqual(["SUCCESS"]);
  });

  it("replaying the same CREATE does NOT add a duplicate row: the existing row is updated", async () => {
    sheetHas(["DNR-1"]);
    const out = await (await engine()).executeSyncTask("t2", task() as any);
    expect(out.success).toBe(true);
    expect(api.append).not.toHaveBeenCalled();
    expect(rowUpdates()).toHaveLength(1);
    expect(rowUpdates()[0][0].range).toBe("Donors!A2");
  });

  it("a Google failure is returned and audited as FAILED with the reason, and the write is attempted once (no blind retry)", async () => {
    sheetHas([]);
    api.append.mockRejectedValue(Object.assign(new Error("Backend Error"), { code: 503 }));
    const out = await (await engine()).executeSyncTask("t3", task() as any);
    expect(out).toEqual({ success: false, error: "Backend Error" });
    expect(api.append).toHaveBeenCalledTimes(1);
    const a = audits();
    expect(a).toHaveLength(1);
    expect(JSON.parse(a[0].after_state)).toMatchObject({ status: "FAILED", errorDetails: "Backend Error" });
  });

  it("not configured: reported as failed, nothing is sent to Google, no secret in the message", async () => {
    const out = await (await engine(false)).executeSyncTask("t4", task() as any);
    expect(out.success).toBe(false);
    expect(String(out.error)).not.toContain("BEGIN PRIVATE");
    expect(api.append).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(JSON.parse(audits()[0].after_state).status).toBe("FAILED");
  });

  it("DELETE marks the row and reports success; DELETE of an unknown id writes nothing", async () => {
    sheetHas(["DNR-1"]);
    const e = await engine();
    expect((await e.executeSyncTask("t5", task({ operation: "DELETE" }) as any)).success).toBe(true);
    expect(rowUpdates()).toHaveLength(1);
    api.update.mockClear();
    sheetHas([]);
    expect((await e.executeSyncTask("t6", task({ operation: "DELETE", entityId: "NOPE" }) as any)).success).toBe(true);
    expect(rowUpdates()).toHaveLength(0);
  });
});
