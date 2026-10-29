import { describe, it, expect, vi } from "vitest";
import { inspectGoogleConfig, assertSpreadsheetId, GoogleConfigError } from "@/lib/google/config";
import { compareSchema } from "@/lib/google/schemaRegistry";
import { categorizeGoogleError, withGoogleRetry, setRetrySleep } from "@/lib/google/retry";
import { runSheetsReadiness } from "@/lib/google/readiness";

const ID = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
const env = (o: Record<string, string | undefined>) => ({ env: { GOOGLE_SHEET_ID: ID, GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY, GOOGLE_TARGET_ENV: "test", ...o }, readFile: () => null });
const codes = (r: ReturnType<typeof inspectGoogleConfig>) => r.blocking.map((p) => p.code);

describe("configuration contract", () => {
  it("accepts a complete configuration and exposes only a fingerprint", () => {
    const r = inspectGoogleConfig(env({}));
    expect(r.ok).toBe(true);
    expect(r.spreadsheet.fingerprint).toBe("…UceGzM");
    expect(JSON.stringify(r)).not.toContain(ID);
    expect(JSON.stringify(r)).not.toContain("BEGIN PRIVATE");
  });
  it.each([
    ["missing id", { GOOGLE_SHEET_ID: "" }, "spreadsheet_id_missing"],
    ["pasted URL", { GOOGLE_SHEET_ID: "https://docs.google.com/spreadsheets/d/" + ID }, "spreadsheet_id_malformed"],
    ["quoted id", { GOOGLE_SHEET_ID: `"${ID}"` }, "spreadsheet_id_malformed"],
    ["no credentials", { GOOGLE_CLIENT_EMAIL: "", GOOGLE_PRIVATE_KEY: "" }, "credentials_missing"],
    ["truncated key", { GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc" }, "credentials_key_malformed"],
  ])("blocks: %s", (_n, o, code) => {
    const r = inspectGoogleConfig(env(o));
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain(code);
  });
  it("credentials file: missing, invalid, and conflicting identities are blocking; file+inline is a warning", () => {
    const base = { GOOGLE_APPLICATION_CREDENTIALS: "C:/k.json" };
    expect(codes(inspectGoogleConfig({ env: { GOOGLE_SHEET_ID: ID, ...base }, readFile: () => null }))).toContain("credentials_file_missing");
    expect(codes(inspectGoogleConfig({ env: { GOOGLE_SHEET_ID: ID, ...base }, readFile: () => "{not json" }))).toContain("credentials_file_invalid");
    const file = JSON.stringify({ client_email: "file@x.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nz\n-----END PRIVATE KEY-----" });
    const ok = inspectGoogleConfig({ env: { GOOGLE_SHEET_ID: ID, ...base }, readFile: () => file });
    expect(ok.ok).toBe(true);
    const both = inspectGoogleConfig({ env: { GOOGLE_SHEET_ID: ID, ...base, GOOGLE_CLIENT_EMAIL: "other@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY }, readFile: () => file });
    expect(codes(both)).toContain("credential_identity_conflict");
    const same = inspectGoogleConfig({ env: { GOOGLE_SHEET_ID: ID, ...base, GOOGLE_CLIENT_EMAIL: "file@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: KEY }, readFile: () => file });
    expect(same.ok).toBe(true);
    expect(same.warnings.map((w) => w.code)).toContain("credential_sources_conflict");
  });
  it("warns when the target kind is undeclared", () => {
    const r = inspectGoogleConfig(env({ GOOGLE_TARGET_ENV: undefined }));
    expect(r.ok).toBe(true);
    expect(r.declaredTarget).toBe("undeclared");
    expect(r.warnings.map((w) => w.code)).toContain("target_undeclared");
  });
  it("assertSpreadsheetId throws a non-retryable configuration error", async () => {
    expect(() => assertSpreadsheetId("")).toThrow(GoogleConfigError);
    expect(() => assertSpreadsheetId("bad id")).toThrow(GoogleConfigError);
    expect(() => assertSpreadsheetId(ID)).not.toThrow();
    setRetrySleep(async () => {});
    const fn = vi.fn(async () => assertSpreadsheetId(""));
    await expect(withGoogleRetry(fn)).rejects.toBeInstanceOf(GoogleConfigError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("error categories", () => {
  const e = (code: number, extra: any = {}) => Object.assign(new Error(extra.message || "x"), { code, ...extra });
  it.each([
    [e(401), "authentication"],
    [new Error("invalid_grant: Invalid JWT Signature"), "authentication"],
    [e(403), "permission"],
    [e(403, { errors: [{ reason: "rateLimitExceeded" }] }), "quota"],
    [e(429), "quota"],
    [e(404), "not_found"],
    [e(400), "invalid_request"],
    [e(503), "transient"],
    [e(500), "transient"],
    [Object.assign(new Error("connect"), { code: "ECONNRESET" }), "transient"],
    [Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" }), "timeout"],
    [Object.assign(new Error("cfg"), { isConfigError: true }), "configuration"],
    [new Error("weird"), "unknown"],
  ])("%#", (err, cat) => expect(categorizeGoogleError(err)).toBe(cat));

  it("never retries auth/permission/not-found, and never retries an append after an ambiguous 5xx", async () => {
    setRetrySleep(async () => {});
    for (const err of [e(401), e(403), e(404), e(400)]) {
      const fn = vi.fn(async () => { throw err; });
      await expect(withGoogleRetry(fn)).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    }
    const append = vi.fn(async () => { throw e(503); });
    await expect(withGoogleRetry(append, { quotaOnly: true })).rejects.toBeTruthy();
    expect(append).toHaveBeenCalledTimes(1);
    const read = vi.fn().mockRejectedValueOnce(e(503)).mockRejectedValueOnce(e(429)).mockResolvedValue("ok");
    await expect(withGoogleRetry(read)).resolves.toBe("ok");
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("bounds the attempts and keeps the original error", async () => {
    setRetrySleep(async () => {});
    const err = e(503);
    const fn = vi.fn(async () => { throw err; });
    await expect(withGoogleRetry(fn, { maxAttempts: 4 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(4);
    expect((err as any).retriesExhausted).toBe(true);
  });
});

describe("schema drift", () => {
  const want = new Map([["Donations", ["id", "amount", "status"]], ["Donors", ["id", "email"]]]);
  const kinds = (a: Map<string, string[]>) => compareSchema(want, a).map((f) => `${f.tab}:${f.kind}`);
  it("clean, additive columns and legacy (shorter-than-registry is NOT clean)", () => {
    expect(kinds(new Map([["Donations", ["id", "amount", "status"]], ["Donors", ["id", "email"]]]))).toEqual([]);
    expect(kinds(new Map([["Donations", ["id", "amount", "status", "legacyNote"]], ["Donors", ["id", "email"]]]))).toEqual(["Donations:extra_column"]);
    expect(compareSchema(want, new Map([["Donations", ["id", "amount", "status", "x"]], ["Donors", ["id", "email"]]])).every((f) => f.severity === "info")).toBe(true);
  });
  it("missing tab, empty header, missing header, duplicate, rename", () => {
    expect(kinds(new Map([["Donors", ["id", "email"]]]))).toEqual(["Donations:missing_tab"]);
    expect(kinds(new Map([["Donations", []], ["Donors", ["id", "email"]]]))).toEqual(["Donations:empty_header"]);
    expect(kinds(new Map([["Donations", ["id", "amount"]], ["Donors", ["id", "email"]]]))).toEqual(["Donations:missing_header"]);
    expect(kinds(new Map([["Donations", ["id", "amount", "status", "amount"]], ["Donors", ["id", "email"]]]))).toContain("Donations:duplicate_header");
    const renamed = compareSchema(want, new Map([["Donations", ["id", "Amount ", "status"]], ["Donors", ["id", "email"]]]));
    expect(renamed.some((f) => f.kind === "possible_rename" && f.severity === "blocking")).toBe(true);
  });
});

describe("readiness (read-only classification)", () => {
  const schemas = new Map([["Donations", ["id", "amount"]]]);
  const cfg = env({});
  const mk = (sheets: any, drive: any = null, folderId = "") => ({ config: cfg, sheets: () => sheets, drive: () => drive, spreadsheetId: ID, folderId, schemas, now: () => new Date("2026-10-28T00:00:00Z") });
  const good = () => ({ spreadsheets: { get: vi.fn(async () => ({ data: { sheets: [{ properties: { title: "Donations" } }] } })), values: { batchGet: vi.fn(async () => ({ data: { valueRanges: [{ values: [["id", "amount"]] }] } })) } } });
  const failing = (err: any) => ({ spreadsheets: { get: vi.fn(async () => { throw err; }), values: { batchGet: vi.fn() } } });
  const http = (code: number) => Object.assign(new Error("x"), { code });

  it("operational, and only read calls are made", async () => {
    setRetrySleep(async () => {});
    const s = good();
    const r = await runSheetsReadiness(mk(s));
    expect(r.state).toBe("operational");
    expect(r.readOnly).toBe(true);
    expect(Object.keys(s.spreadsheets)).toEqual(["get", "values"]);
    expect(JSON.stringify(r)).not.toContain(ID);
  });
  it("configuration_invalid sends no request", async () => {
    const s = good();
    const r = await runSheetsReadiness({ ...mk(s), config: env({ GOOGLE_SHEET_ID: "nope" }) });
    expect(r.state).toBe("configuration_invalid");
    expect(s.spreadsheets.get).not.toHaveBeenCalled();
  });
  it.each([
    [http(401), "authentication_failed"],
    [http(403), "permission_denied"],
    [http(404), "spreadsheet_not_found"],
    [http(429), "quota_limited"],
    [http(503), "temporarily_unavailable"],
  ])("classifies %#", async (err, state) => {
    setRetrySleep(async () => {});
    expect((await runSheetsReadiness(mk(failing(err)))).state).toBe(state);
  });
  it("reports missing tab / header as schema_incomplete without creating anything", async () => {
    const s = good();
    s.spreadsheets.get = vi.fn(async () => ({ data: { sheets: [] } }));
    const r = await runSheetsReadiness(mk(s));
    expect(r.state).toBe("schema_incomplete");
    expect(r.drift[0].kind).toBe("missing_tab");
    const s2 = good();
    s2.spreadsheets.values.batchGet = vi.fn(async () => ({ data: { valueRanges: [{ values: [["id", "id"]] }] } }));
    const r2 = await runSheetsReadiness(mk(s2));
    expect(r2.state).toBe("schema_incomplete");
  });
  it("recovers: failing then healthy gives operational again", async () => {
    setRetrySleep(async () => {});
    expect((await runSheetsReadiness(mk(failing(http(503))))).state).toBe("temporarily_unavailable");
    expect((await runSheetsReadiness(mk(good()))).state).toBe("operational");
  });
  it("checks the Drive folder read-only", async () => {
    setRetrySleep(async () => {});
    const ok = { files: { get: vi.fn(async () => ({ data: {} })) } };
    expect((await runSheetsReadiness(mk(good(), ok, "F".repeat(25)))).drive.state).toBe("ok");
    const missing = { files: { get: vi.fn(async () => { throw http(404); }) } };
    expect((await runSheetsReadiness(mk(good(), missing, "F".repeat(25)))).drive.state).toBe("not_found");
  });
});
