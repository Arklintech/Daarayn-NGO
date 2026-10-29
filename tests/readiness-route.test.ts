import { describe, it, expect, vi, beforeEach } from "vitest";
import { authState } from "./helpers/mocks";

const ID = "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM";
const g = vi.hoisted(() => ({ sheets: null as any }));
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "",
  getSheetsClient: () => g.sheets,
  getDriveClient: () => null,
  googleAuthProblem: () => "",
  getGoogleAuth: () => null,
}));

const call = async () => (await import("@/app/api/admin/diagnostics/google-readiness/route")).GET(new Request("http://t/api/admin/diagnostics/google-readiness"));
const fake = (get: any, batchGet: any = vi.fn(async () => ({ data: { valueRanges: [] } }))) => ({ spreadsheets: { get, values: { batchGet } } });

beforeEach(() => {
  authState.role = "admin";
  Object.assign(process.env, { GOOGLE_SHEET_ID: ID, GOOGLE_CLIENT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n", GOOGLE_TARGET_ENV: "test" });
});

describe("GET /api/admin/diagnostics/google-readiness", () => {
  it("requires an administrator", async () => {
    authState.role = "none";
    g.sheets = fake(vi.fn());
    const res = await call();
    expect(res.status).toBe(401);
    expect(g.sheets.spreadsheets.get).not.toHaveBeenCalled();
  });

  it("outage then recovery: 503 while Google fails, 200/operational once it works, never a fabricated success; read calls only; no ids or secrets in the body", async () => {
    const { setRetrySleep } = await import("@/lib/google/retry");
    setRetrySleep(async () => {});
    g.sheets = fake(vi.fn(async () => { throw Object.assign(new Error("backend error"), { code: 503 }); }));
    let res = await call();
    let body: any = await res.json();
    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.state).toBe("temporarily_unavailable");
    expect(body.readOnly).toBe(true);

    g.sheets = fake(vi.fn(async () => ({ data: { sheets: [] } })));
    res = await call();
    body = await res.json();
    expect(body.state).toBe("schema_incomplete"); // reachable but required worksheets absent: reported, never created
    expect(res.status).toBe(424);
    expect(Object.keys(g.sheets.spreadsheets)).toEqual(["get", "values"]); // no update/batchUpdate exists on the double: a write would have thrown

    const text = JSON.stringify(body);
    expect(text).not.toContain(ID);
    expect(text).not.toContain("BEGIN PRIVATE");
  });

  it("nonexistent spreadsheet -> 424 spreadsheet_not_found; bad credentials -> authentication_failed; invalid id -> configuration_invalid without any request", async () => {
    const { setRetrySleep } = await import("@/lib/google/retry");
    setRetrySleep(async () => {});
    g.sheets = fake(vi.fn(async () => { throw Object.assign(new Error("Requested entity was not found."), { code: 404 }); }));
    expect(((await (await call()).json()) as any).state).toBe("spreadsheet_not_found");
    g.sheets = fake(vi.fn(async () => { throw Object.assign(new Error("invalid_grant: Invalid JWT Signature"), { code: 400 }); }));
    expect(((await (await call()).json()) as any).state).toBe("authentication_failed");
    process.env.GOOGLE_SHEET_ID = "not valid";
    g.sheets = fake(vi.fn());
    const res = await call();
    expect(((await res.json()) as any).state).toBe("configuration_invalid");
    expect(g.sheets.spreadsheets.get).not.toHaveBeenCalled();
  });
});
