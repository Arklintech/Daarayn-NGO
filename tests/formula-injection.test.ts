import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeApi } from "./helpers/fakeGoogleApi";

// Runs the REAL lib/google/sheets.ts against a fake of Google's REST API (which, like Sheets, strips a single leading apostrophe on USER_ENTERED writes).
vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));

const HEADERS = ["id", "name", "note", "amount"];
async function service() {
  fakeApi.reset();
  vi.resetModules();
  (await import("@/lib/google/retry")).setRetrySleep(async () => undefined);
  const mod = await import("@/lib/google/sheets");
  return { svc: new mod.SheetsService("TEST_SHEET_ID_000000000000000000000000"), mod };
}

describe("D37 / F9: text that Sheets would evaluate as a formula is stored as literal text", () => {
  beforeEach(() => fakeApi.reset());

  it("neutraliseFormula protects = + - @ TAB CR and leaves plain numbers and ordinary text alone", async () => {
    const { mod } = await service();
    for (const evil of ['=HYPERLINK("http://x","y")', "=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(1)", "\t=1", "\r=1", "+919876543210"]) expect(mod.neutraliseFormula(evil)).toBe(`'${evil}`);
    for (const safe of ["-5", "-5.25", "0", "12", "450.5", "plain text", "DA001", "2026-10-31T11:50:07.016Z", "", "a=b", "x+1"]) expect(mod.neutraliseFormula(safe)).toBe(safe);
  });

  it("an appended and an updated row send the protected text to Google, and the stored cell reads back as the original text", async () => {
    const { svc } = await service();
    fakeApi.tabs.set("T", [HEADERS]);
    await svc.appendRow("T", { id: "1", name: '=HYPERLINK("http://evil.invalid","click")', note: "+91 98765", amount: 250 }, HEADERS);
    await svc.updateRowAt("T", 2, { id: "1", name: "@SUM(1)", note: "-abc", amount: 250 });
    const rows = fakeApi.records("T");
    expect(rows[0]).toMatchObject({ name: "@SUM(1)", note: "-abc", amount: "250" });
    await svc.appendRow("T", { id: "2", name: '=HYPERLINK("http://evil.invalid","click")', note: "", amount: -5 }, HEADERS);
    const second = fakeApi.records("T")[1];
    expect(second.name).toBe('=HYPERLINK("http://evil.invalid","click")'); // literal text, stored without the apostrophe
    expect(second.amount).toBe("-5"); // a plain negative number is not mangled
  });

  it("the multi-tab literal paths (appendRowsToTabs, updateFieldsLiteral) store the same text without any apostrophe", async () => {
    const { svc } = await service();
    fakeApi.tabs.set("T", [HEADERS]);
    await svc.appendRowsToTabs([{ sheetName: "T", expectedHeaders: HEADERS, records: [{ id: "1", name: "=1+1", note: "x", amount: 5 }] }]);
    expect(fakeApi.records("T")[0]).toMatchObject({ name: "=1+1", amount: "5" });
    await svc.updateFieldsLiteral("T", [{ rowNumber: 2, fields: { name: '=HYPERLINK("a","b")', amount: 7 } }]);
    expect(fakeApi.records("T")[0]).toMatchObject({ id: "1", name: '=HYPERLINK("a","b")', note: "x", amount: "7" });
  });
});
