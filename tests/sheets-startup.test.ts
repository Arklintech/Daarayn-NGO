import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeApi } from "./helpers/fakeGoogleApi";

// Runs the REAL lib/google/sheets.ts against a fake of Google's REST API so API calls can be counted.
vi.unmock("@/lib/google/sheets");
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "TEST_SHEET_ID_000000000000000000000000",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "ROOT",
  googleAuthProblem: () => "",
  getSheetsClient: () => fakeApi.client(),
  getDriveClient: () => null,
  getGoogleAuth: () => ({}),
}));

const TABS = Array.from({ length: 12 }, (_, i) => `Tab${i}`);
const HEADERS = ["id", "name", "status"];

async function service() {
  fakeApi.reset();
  vi.resetModules();
  const retry = await import("@/lib/google/retry");
  retry.setRetrySleep(async () => undefined);
  const { SheetsService } = await import("@/lib/google/sheets");
  return new SheetsService("TEST_SHEET_ID_000000000000000000000000");
}

// Phase 12 evidence: a cold instance spent 30 of 34 Google calls on tab setup (15 tab listings + 15 header reads for
// 3 requests), because every repository initialised at once and none could see the others' in-flight request.
describe("tab setup cost on a cold instance", () => {
  beforeEach(() => fakeApi.reset());

  it("lists the spreadsheet once and reads all header rows in one request when many repositories start together", async () => {
    const svc = await service();
    for (const t of TABS) fakeApi.tabs.set(t, [HEADERS, ["1", "x", "y"]]);
    fakeApi.resetCounts();

    await Promise.all(TABS.map((t) => svc.ensureSheetExists(t, HEADERS)));

    expect(fakeApi.counts["spreadsheets.get"]).toBe(1);
    expect((fakeApi.counts["values.get"] || 0) + (fakeApi.counts["values.batchGet"] || 0)).toBe(1);
    expect(fakeApi.counts.writes || 0).toBe(0);
  });

  it("still creates a missing tab and writes headers for a tab whose header row is empty", async () => {
    const svc = await service();
    fakeApi.tabs.set("Existing", [HEADERS]);
    fakeApi.tabs.set("NoHeaders", []);
    await Promise.all([svc.ensureSheetExists("Existing", HEADERS), svc.ensureSheetExists("NoHeaders", HEADERS), svc.ensureSheetExists("Brand New", HEADERS)]);
    expect(fakeApi.tabs.get("Brand New")![0]).toEqual(HEADERS);
    expect(fakeApi.tabs.get("NoHeaders")![0]).toEqual(HEADERS);
    expect(fakeApi.tabs.get("Existing")).toEqual([HEADERS]);
  });

  it("returns each tab's own headers", async () => {
    const svc = await service();
    fakeApi.tabs.set("A", [["a1", "a2"]]);
    fakeApi.tabs.set("B", [["b1", "b2", "b3"]]);
    const [a, b] = await Promise.all([svc.getHeaders("A"), svc.getHeaders("B")]);
    expect(a).toEqual(["a1", "a2"]);
    expect(b).toEqual(["b1", "b2", "b3"]);
  });

  it("a missing tab fails only its own header read, not the others in the same batch", async () => {
    const svc = await service();
    fakeApi.tabs.set("Here", [["id"]]);
    const results = await Promise.allSettled([svc.getHeaders("Here"), svc.getHeaders("Missing")]);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: ["id"] });
    expect(results[1].status).toBe("rejected");
  });

  it("a failed tab listing is not remembered: the next attempt tries again", async () => {
    const svc = await service();
    fakeApi.tabs.set("T", [HEADERS]);
    fakeApi.failures.push({ when: "read", error: new Error("boom"), method: "spreadsheets.get" });
    await expect(svc.ensureSheetExists("T", HEADERS)).rejects.toThrow();
    await expect(svc.ensureSheetExists("T", HEADERS)).resolves.toBeUndefined();
  });
});
