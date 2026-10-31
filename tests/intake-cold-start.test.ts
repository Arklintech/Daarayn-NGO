import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeApi } from "./helpers/fakeGoogleApi";

// Runs the REAL lib/google/sheets.ts and the REAL intake service against a fake of Google's REST API so every request can be counted.
vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const CAUSE_HEADERS = ["id", "title", "category", "targetAmount", "raisedAmount", "location", "description", "status", "imageUrl", "driveFileId", "createdAt", "kind"];
const INTAKE_HEADERS = ["submissionRef", "idempotencyKey", "payloadHash", "payload", "receivedAt", "state", "retryCount", "lastErrorCategory", "donationId", "completedAt", "updatedAt"];
const cause = ["C1", "Cause C1", "Relief", "1000", "0", "", "", "Active", "", "", "", "cause"];

function seed(over: { intakeHeaders?: string[] | null } = {}) {
  fakeApi.reset();
  fakeApi.tabs.set("Causes", [CAUSE_HEADERS, cause]);
  fakeApi.tabs.set("Program_Content", [["id", "kind", "title"]]);
  if (over.intakeHeaders !== null) fakeApi.tabs.set("Donation_Intake", [over.intakeHeaders ?? INTAKE_HEADERS]);
}
/** A brand-new serverless instance: every module (and every in-memory cache) is loaded again. */
async function coldInstance() {
  vi.resetModules();
  (await import("@/lib/google/retry")).setRetrySleep(async () => undefined);
  return import("@/lib/intake/intakeService");
}
const submission = (over: Record<string, unknown> = {}) => ({ donorName: "Cold Donor", donorContact: "cold@example.invalid", amount: 250, selectedCauses: [{ causeId: "C1" }], submissionKey: "K-COLD", ...over });

describe("D38 Track A: intake costs ONE Sheets read and ONE write, cold or warm", () => {
  beforeEach(() => seed());

  it("a COLD instance: 1 read (eligibility + header check in one batchGet), 1 write, no tab listing, no separate header read", async () => {
    const { acceptDonation } = await coldInstance();
    fakeApi.resetCounts();
    const r = await acceptDonation(submission());
    expect(r.state).toBe("RECEIVED");
    expect(fakeApi.counts.reads).toBe(1);
    expect(fakeApi.counts.writes).toBe(1);
    expect(fakeApi.counts["values.batchGet"]).toBe(1);
    expect(fakeApi.counts["spreadsheets.get"] || 0).toBe(0);
    expect(fakeApi.counts["values.get"] || 0).toBe(0);
    expect(fakeApi.records("Donation_Intake")).toHaveLength(1);
  });

  it("a WARM instance costs the same 1 + 1 (the header contract is checked on every request, never trusted from a cache)", async () => {
    const { acceptDonation } = await coldInstance();
    await acceptDonation(submission());
    fakeApi.resetCounts();
    await acceptDonation(submission({ submissionKey: "K-WARM", donorContact: "warm@example.invalid" }));
    expect(fakeApi.counts.reads).toBe(1);
    expect(fakeApi.counts.writes).toBe(1);
  });

  it("SCHEMA DRIFT FAILS CLOSED: a renamed or reordered intake column writes nothing", async () => {
    seed({ intakeHeaders: ["submissionRef", "payload", "idempotencyKey", ...INTAKE_HEADERS.slice(3)] });
    const { acceptDonation } = await coldInstance();
    fakeApi.resetCounts();
    await expect(acceptDonation(submission())).rejects.toThrow(/schema/i);
    expect(fakeApi.counts.writes || 0).toBe(0);
    expect(fakeApi.records("Donation_Intake")).toHaveLength(0);
  });

  it("extra columns to the RIGHT of the contract are allowed (a human note column), the contract columns are exact", async () => {
    seed({ intakeHeaders: [...INTAKE_HEADERS, "operatorNote"] });
    const { acceptDonation } = await coldInstance();
    await expect(acceptDonation(submission())).resolves.toMatchObject({ state: "RECEIVED" });
    expect(fakeApi.records("Donation_Intake")[0]).toMatchObject({ idempotencyKey: "K-COLD" });
  });

  it("a worksheet that does not exist yet is provisioned once (slow path), then the next request is the fast path", async () => {
    seed({ intakeHeaders: null });
    const { acceptDonation } = await coldInstance();
    const r = await acceptDonation(submission());
    expect(r.state).toBe("RECEIVED");
    expect(fakeApi.tabs.get("Donation_Intake")![0]).toEqual(INTAKE_HEADERS);
    fakeApi.resetCounts();
    await acceptDonation(submission({ submissionKey: "K-2", donorContact: "two@example.invalid" }));
    expect(fakeApi.counts.reads).toBe(1);
    expect(fakeApi.counts.writes).toBe(1);
  });

  it("no formula injection: text beginning with = + - @ is stored as literal text, including the idempotency key", async () => {
    const { acceptDonation } = await coldInstance();
    await acceptDonation(submission({ donorName: '=HYPERLINK("http://evil.invalid","x")', submissionKey: "=cmd|evil" }));
    const row = fakeApi.records("Donation_Intake")[0];
    expect(row.idempotencyKey).toBe("=cmd|evil");
    expect(String(row.payload)).toContain('=HYPERLINK(');
    expect(String(row.payload).startsWith("{")).toBe(true);
  });

  it("eligibility stays fresh and fail-closed: an unknown cause is refused after the single read and nothing is written", async () => {
    const { acceptDonation } = await coldInstance();
    fakeApi.resetCounts();
    await expect(acceptDonation(submission({ selectedCauses: [{ causeId: "NOPE" }] }))).rejects.toThrow();
    expect(fakeApi.counts.reads).toBe(1);
    expect(fakeApi.counts.writes || 0).toBe(0);
  });

  it("a read failure refuses the submission (no stale eligibility, nothing written)", async () => {
    const { acceptDonation } = await coldInstance();
    fakeApi.failures.push({ when: "read", method: "values.batchGet", error: new Error("Simulated read failure") });
    await expect(acceptDonation(submission())).rejects.toThrow();
    expect(fakeApi.records("Donation_Intake")).toHaveLength(0);
  });
});
