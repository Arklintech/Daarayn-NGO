import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decideWriteTarget } from "@/lib/google/config";
import { approveTestResourceForThisProcess } from "@/lib/google/approvedTargets";

const api = vi.hoisted(() => ({
  append: vi.fn(),
  update: vi.fn(),
  clear: vi.fn(),
  batchUpdate: vi.fn(),
  get: vi.fn(),
  valuesGet: vi.fn(),
  batchGet: vi.fn(),
  filesCreate: vi.fn(),
  filesGet: vi.fn(),
}));
vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: class { constructor(_o: any) {} } },
    sheets: () => ({ spreadsheets: { get: api.get, batchUpdate: api.batchUpdate, values: { append: api.append, update: api.update, clear: api.clear, get: api.valuesGet, batchGet: api.batchGet } } }),
    drive: () => ({ files: { create: api.filesCreate, get: api.filesGet } }),
  },
}));

const PROD = "1PRODUCTIONSPREADSHEETID_cs7D_U_xxxxxxxx";
const TEST = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
const saved = { ...process.env };
const setEnv = (o: Record<string, string | undefined>) => {
  process.env = { ...saved, GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY, GOOGLE_APPLICATION_CREDENTIALS: "", ...o } as any;
  for (const k of Object.keys(o)) if (o[k] === undefined) delete (process.env as any)[k];
};

describe("decideWriteTarget", () => {
  const dev = { NODE_ENV: "development", VERCEL: undefined, GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST };
  it.each([
    ["dev, label unset, production id (ordinary npm run dev)", { ...dev }, false, "target_undeclared"],
    ["dev, unknown label", { ...dev, GOOGLE_TARGET_ENV: "staging" }, false, "target_undeclared"],
    ["dev declares production", { ...dev, GOOGLE_TARGET_ENV: "production" }, false, "target_not_test"],
    ["dev says test but points at production id (label alone is not enough)", { ...dev, GOOGLE_TARGET_ENV: "test" }, false, "target_mismatch"],
    ["dev says test, no test id configured", { ...dev, GOOGLE_TARGET_ENV: "test", GOOGLE_TEST_SHEET_ID: "" }, false, "target_mismatch"],
    ["dev says test and id equals the declared test id", { ...dev, GOOGLE_TARGET_ENV: "test", GOOGLE_SHEET_ID: TEST }, true, "target_ok"],
    ["test runtime (NODE_ENV=test) obeys the same rule", { ...dev, NODE_ENV: "test" }, false, "target_undeclared"],
    ["production runtime, label production", { NODE_ENV: "production", GOOGLE_TARGET_ENV: "production", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST }, true, "target_ok"],
    ["production runtime, label unset (existing deployment keeps working)", { NODE_ENV: "production", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST }, true, "target_ok"],
    ["production runtime pointing at the test sheet", { NODE_ENV: "production", GOOGLE_TARGET_ENV: "production", GOOGLE_SHEET_ID: TEST, GOOGLE_TEST_SHEET_ID: TEST }, false, "production_runtime_on_test_target"],
    ["Vercel counts as production runtime", { NODE_ENV: "development", VERCEL: "1", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST }, true, "target_ok"],
    ["production runtime with a garbage label", { NODE_ENV: "production", GOOGLE_TARGET_ENV: "prod?", GOOGLE_SHEET_ID: PROD }, false, "target_undeclared"],
  ])("sheets: %s", (_n, env, allowed, code) => {
    const d = decideWriteTarget("sheets", env as any);
    expect(d.allowed).toBe(allowed);
    expect(d.code).toBe(code);
    expect(d.message).not.toContain(PROD);
    expect(d.message).not.toContain(TEST);
  });

  it("drive: a dev process may only write when the root folder is empty or the declared test folder", () => {
    approveTestResourceForThisProcess("folder", "FOLDER_TEST_0000000000000");
    const base = { NODE_ENV: "development", GOOGLE_TARGET_ENV: "test", GOOGLE_DRIVE_TEST_FOLDER_ID: "FOLDER_TEST_0000000000000" };
    expect(decideWriteTarget("drive", { ...base, GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_PROD_0000000000000" }).allowed).toBe(false);
    expect(decideWriteTarget("drive", { ...base, GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_TEST_0000000000000" }).allowed).toBe(true);
    expect(decideWriteTarget("drive", { ...base, GOOGLE_DRIVE_ROOT_FOLDER_ID: "" }).allowed).toBe(true);
    expect(decideWriteTarget("drive", { NODE_ENV: "development", GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_PROD_0000000000000" }).allowed).toBe(false);
  });
});

describe("the guard sits on the real Google clients (no write path can skip it)", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const f of Object.values(api)) f.mockReset().mockResolvedValue({ data: {} });
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ordinary dev run (no GOOGLE_TARGET_ENV, production id): SheetsService writes are refused BEFORE any Google request; reads still work", async () => {
    setEnv({ NODE_ENV: "development", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST, GOOGLE_TARGET_ENV: undefined });
    api.valuesGet.mockResolvedValue({ data: { values: [["id"], ["1"]] } });
    api.get.mockResolvedValue({ data: { sheets: [{ properties: { title: "Donations" } }] } });
    const { SheetsService } = await vi.importActual<typeof import("@/lib/google/sheets")>("@/lib/google/sheets");
    const svc = new SheetsService(PROD);
    await expect(svc.appendRow("Donations", { id: "x" }, ["id"])).rejects.toThrow(/Write refused/);
    await expect(svc.updateRowAt("Donations", 2, { id: "x" })).rejects.toThrow(/Write refused/);
    await expect(svc.clearRowAt("Donations", 2)).rejects.toThrow(/Write refused/);
    expect(api.append).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.clear).not.toHaveBeenCalled();
    await expect(svc.getAllRows("Donations")).resolves.toBeTruthy(); // reads are never blocked
  });

  it("the event log and every other direct client use the same guard (getSheetsClient is the single factory)", async () => {
    setEnv({ NODE_ENV: "development", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST, GOOGLE_TARGET_ENV: "test" });
    const { getSheetsClient } = await import("@/lib/google/client");
    const client: any = getSheetsClient();
    await expect(client.spreadsheets.values.append({ spreadsheetId: PROD, range: "A:A" })).rejects.toThrow(/Write refused/);
    await expect(client.spreadsheets.batchUpdate({ spreadsheetId: PROD, requestBody: {} })).rejects.toThrow(/Write refused/);
    expect(api.append).not.toHaveBeenCalled();
    expect(api.batchUpdate).not.toHaveBeenCalled();
    await client.spreadsheets.values.get({ spreadsheetId: PROD, range: "A:A" });
    expect(api.valuesGet).toHaveBeenCalledTimes(1);
  });

  it("the declared test sheet with the matching label can write", async () => {
    setEnv({ NODE_ENV: "development", GOOGLE_SHEET_ID: TEST, GOOGLE_TEST_SHEET_ID: TEST, GOOGLE_TARGET_ENV: "test" });
    const { getSheetsClient } = await import("@/lib/google/client");
    await (getSheetsClient() as any).spreadsheets.values.append({ spreadsheetId: TEST, range: "A:A" });
    expect(api.append).toHaveBeenCalledTimes(1);
  });

  it("Drive writes are refused for a production folder in a dev process; Drive reads are not", async () => {
    setEnv({ NODE_ENV: "development", GOOGLE_TARGET_ENV: "test", GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_PROD_0000000000000", GOOGLE_DRIVE_TEST_FOLDER_ID: "FOLDER_TEST_0000000000000", GOOGLE_SHEET_ID: TEST, GOOGLE_TEST_SHEET_ID: TEST });
    const { getDriveClient } = await import("@/lib/google/client");
    const drive: any = getDriveClient();
    await expect(drive.files.create({ requestBody: { name: "x" } })).rejects.toThrow(/Write refused/);
    expect(api.filesCreate).not.toHaveBeenCalled();
    await drive.files.get({ fileId: "abc" });
    expect(api.filesGet).toHaveBeenCalledTimes(1);
  });

  it("a refusal is not retried (configuration errors are never retried)", async () => {
    setEnv({ NODE_ENV: "development", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: TEST, GOOGLE_TARGET_ENV: undefined });
    const { withGoogleRetry, setRetrySleep } = await import("@/lib/google/retry");
    setRetrySleep(async () => {});
    const { getSheetsClient } = await import("@/lib/google/client");
    const fn = vi.fn(() => (getSheetsClient() as any).spreadsheets.values.update({}));
    await expect(withGoogleRetry(fn)).rejects.toThrow(/Write refused/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("guard works on clients whose resources have non-configurable properties (real googleapis shape)", () => {
  it("does not violate Proxy invariants and still blocks writes", async () => {
    const { guardWrites } = await import("@/lib/google/config");
    const values = { append: vi.fn(async () => "wrote"), get: vi.fn(async () => "read") };
    const spreadsheets: any = { batchUpdate: vi.fn(async () => "wrote") };
    Object.defineProperty(spreadsheets, "values", { value: values, writable: false, configurable: false, enumerable: true });
    const client: any = {};
    Object.defineProperty(client, "spreadsheets", { value: spreadsheets, writable: false, configurable: false, enumerable: true });
    process.env = { ...saved, NODE_ENV: "development", GOOGLE_TARGET_ENV: undefined } as any;
    delete (process.env as any).GOOGLE_TARGET_ENV;
    const guarded: any = guardWrites(client, "sheets");
    await expect(guarded.spreadsheets.values.append({})).rejects.toThrow(/Write refused/);
    await expect(guarded.spreadsheets.batchUpdate({})).rejects.toThrow(/Write refused/);
    expect(await guarded.spreadsheets.values.get({})).toBe("read");
    expect(values.append).not.toHaveBeenCalled();
    process.env = { ...saved };
  });
});

describe("environment/target matrix beyond two agreeing variables (committed allowlist and production veto)", () => {
  const APPROVED = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
  const dev = { NODE_ENV: "development", GOOGLE_TARGET_ENV: "test" };
  it("a developer who sets label=test AND GOOGLE_TEST_SHEET_ID to the production id is still refused (id not on the allowlist)", () => {
    const d = decideWriteTarget("sheets", { ...dev, GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: PROD } as any);
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("target_mismatch");
    expect(d.message).toMatch(/allowlist/);
    expect(d.message).not.toContain(PROD);
  });
  it("the approved test sheet is allowed only with the matching label and declared id", () => {
    expect(decideWriteTarget("sheets", { ...dev, GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED } as any).allowed).toBe(true);
    expect(decideWriteTarget("sheets", { ...dev, GOOGLE_SHEET_ID: APPROVED } as any).allowed).toBe(false); // no declared test id
    expect(decideWriteTarget("sheets", { NODE_ENV: "development", GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED } as any).allowed).toBe(false); // no label
  });
  it("a configured production id vetoes everything, even an allowlisted id", () => {
    const d = decideWriteTarget("sheets", { ...dev, GOOGLE_SHEET_ID: APPROVED, GOOGLE_TEST_SHEET_ID: APPROVED, GOOGLE_PRODUCTION_SHEET_ID: APPROVED } as any);
    expect(d.allowed).toBe(false);
    expect(decideWriteTarget("drive", { ...dev, GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_X", GOOGLE_DRIVE_TEST_FOLDER_ID: "FOLDER_X", GOOGLE_PRODUCTION_DRIVE_FOLDER_ID: "FOLDER_X" } as any).allowed).toBe(false);
  });
  it("a Drive folder that is declared as the test folder but is not allowlisted is refused", () => {
    expect(decideWriteTarget("drive", { ...dev, GOOGLE_DRIVE_ROOT_FOLDER_ID: "FOLDER_NOT_APPROVED", GOOGLE_DRIVE_TEST_FOLDER_ID: "FOLDER_NOT_APPROVED" } as any).allowed).toBe(false);
  });
  it("the allowlist cannot be widened outside a test runner", () => {
    const saved = process.env.VITEST;
    delete process.env.VITEST;
    expect(approveTestResourceForThisProcess("sheet", PROD)).toBe(false);
    process.env.VITEST = saved;
    expect(decideWriteTarget("sheets", { ...dev, GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: PROD } as any).allowed).toBe(false);
  });
  it("at the real client: label and test id both set to the production id still never reach Google", async () => {
    vi.resetModules();
    for (const f of Object.values(api)) f.mockReset().mockResolvedValue({ data: {} });
    setEnv({ NODE_ENV: "development", GOOGLE_SHEET_ID: PROD, GOOGLE_TEST_SHEET_ID: PROD, GOOGLE_TARGET_ENV: "test" });
    const { getSheetsClient } = await import("@/lib/google/client");
    await expect((getSheetsClient() as any).spreadsheets.values.append({})).rejects.toThrow(/Write refused/);
    expect(api.append).not.toHaveBeenCalled();
    process.env = { ...saved };
  });
});
