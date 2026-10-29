import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
const configure = () => Object.assign(process.env, { GOOGLE_SHEET_ID: ID, GOOGLE_TEST_SHEET_ID: ID, GOOGLE_TARGET_ENV: "test", GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY });
const make = async () => new (await import("@/lib/sync/GoogleSheetsClient")).GoogleSheetsClient();

beforeEach(() => {
  api.append.mockReset();
  api.update.mockReset();
  api.get.mockReset();
});
afterEach(() => {
  process.env = { ...saved };
});

describe("legacy GoogleSheetsClient: a write that did not happen is never reported as done", () => {
  it("success: resolves and writes exactly once", async () => {
    configure();
    api.append.mockResolvedValue({ data: {} });
    const c = await make();
    expect(c.isConfigured()).toBe(true);
    await expect(c.appendRow("Donors", ["a", "b"])).resolves.toBeUndefined();
    expect(api.append).toHaveBeenCalledTimes(1);
    expect(api.append.mock.calls[0][0]).toMatchObject({ spreadsheetId: ID, range: "Donors!A:A" });
  });

  it("a Google failure propagates with its original error, with no retry and no second write", async () => {
    configure();
    const boom = Object.assign(new Error("Quota exceeded"), { code: 429 });
    api.append.mockRejectedValue(boom);
    api.update.mockRejectedValue(boom);
    const c = await make();
    await expect(c.appendRow("Donors", ["a"])).rejects.toBe(boom);
    await expect(c.updateRow("Donors", 3, ["a"])).rejects.toBe(boom);
    await expect(c.setHeaders("Donors", ["id"])).rejects.toBe(boom);
    expect(api.append).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(2);
  });

  it("not configured (missing / malformed id, no credentials): every write throws instead of returning quietly, and nothing is sent", async () => {
    for (const env of [{ GOOGLE_SHEET_ID: "" }, { GOOGLE_SHEET_ID: "https://docs.google.com/spreadsheets/d/" + ID }, { GOOGLE_CLIENT_EMAIL: "", GOOGLE_PRIVATE_KEY: "" }]) {
      process.env = { ...saved };
      configure();
      Object.assign(process.env, env);
      const c = await make();
      expect(c.isConfigured()).toBe(false);
      await expect(c.appendRow("Donors", ["a"])).rejects.toMatchObject({ name: "GoogleConfigError" });
      await expect(c.updateRow("Donors", 2, ["a"])).rejects.toMatchObject({ name: "GoogleConfigError" });
      await expect(c.setHeaders("Donors", ["id"])).rejects.toMatchObject({ name: "GoogleConfigError" });
    }
    expect(api.append).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("write guard: a process that did not declare the test target cannot write through this client either (no Google request is made)", async () => {
    configure();
    delete process.env.GOOGLE_TARGET_ENV;
    const c = await make();
    await expect(c.appendRow("Donors", ["a"])).rejects.toThrow(/Write refused/);
    await expect(c.updateRow("Donors", 2, ["a"])).rejects.toThrow(/Write refused/);
    expect(api.append).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("the thrown configuration error never contains the key or the spreadsheet id", async () => {
    configure();
    process.env.GOOGLE_SHEET_ID = "bad id";
    const c = await make();
    const err: any = await c.appendRow("Donors", ["a"]).catch((e) => e);
    expect(String(err.message)).not.toContain("BEGIN PRIVATE");
    expect(String(err.message)).not.toContain("bad id");
  });
});
