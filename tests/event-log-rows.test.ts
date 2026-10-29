import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";

// The event log's event id IS the row number. Sheets reports wrong rows for overlapping appends, so the log must locate each event by
// its unique eventId in the data (D17). The Google client used for reads is backed by the same fake sheet.
vi.mock("@/lib/google/client", () => ({
  GOOGLE_SHEET_ID: "1sGVsMEQDI1WmjWdUTQ0eKOzZC34Ri9CLsf4uUUceGzM",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "",
  getSheetsClient: () => ({
    spreadsheets: {
      values: {
        get: async ({ range }: any) => {
          const t = (fakeSheets as any).tabs.get("Realtime_Events");
          const col = [[t?.headers?.[0] ?? "eventId"], ...((t?.rows ?? []) as string[][]).map((r) => [r[0]])];
          return { data: { values: String(range).includes("!A:A") ? col : [] } };
        },
      },
    },
  }),
  getDriveClient: () => null,
  googleAuthProblem: () => "",
  getGoogleAuth: () => null,
}));

beforeEach(async () => {
  await resetWorld();
  fakeSheets.misreportAppendedRow = true;
});

describe("event log row ids come from the data, not from the append response", () => {
  it("20 concurrent single events: every returned row is the event's REAL row and all are distinct", async () => {
    const { appendEvent } = await import("@/lib/realtime/eventLog");
    const rows = await Promise.all(Array.from({ length: 20 }, (_, i) => appendEvent("T", { i }, ["admin"], "inst", new Date().toISOString())));
    expect(rows.every((r) => r !== null)).toBe(true);
    expect(new Set(rows).size).toBe(20);
    const t = (fakeSheets as any).tabs.get("Realtime_Events");
    rows.forEach((row, i) => expect(JSON.parse(t.rows[(row as number) - 2][3]).i).toBeGreaterThanOrEqual(0)); // the row holds an event payload
    const payloadAt = (row: number) => JSON.parse(t.rows[row - 2][3]).i;
    expect(new Set(rows.map((r) => payloadAt(r as number))).size).toBe(20); // each returned row holds a different event
  });

  it("batches: each event of a batch gets its own real row", async () => {
    const { appendEvents } = await import("@/lib/realtime/eventLog");
    const [a, b] = await Promise.all([
      appendEvents([{ type: "A1", payload: 1, audience: ["admin"] }, { type: "A2", payload: 2, audience: ["admin"] }], "inst", "t"),
      appendEvents([{ type: "B1", payload: 3, audience: ["admin"] }, { type: "B2", payload: 4, audience: ["admin"] }], "inst", "t"),
    ]);
    const t = (fakeSheets as any).tabs.get("Realtime_Events");
    const typeAt = (row: number) => t.rows[row - 2][1];
    expect([typeAt(a![0]), typeAt(a![1]), typeAt(b![0]), typeAt(b![1])]).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("the broadcaster never marks a wrong row as delivered or hands out a wrong id when the row cannot be located", async () => {
    vi.resetModules();
    vi.doMock("@/lib/realtime/broadcaster", async (orig) => await orig());
    vi.doMock("@/lib/realtime/eventLog", async (orig) => ({ ...(await orig<any>()), appendEvent: vi.fn(async () => null) }));
    const { realtimeBroadcaster } = await vi.importActual<typeof import("@/lib/realtime/broadcaster")>("@/lib/realtime/broadcaster");
    const seen: any[] = [];
    (realtimeBroadcaster as any).fanOut = (m: any) => seen.push(m);
    const res = await realtimeBroadcaster.publish("DONATION_UPDATED" as any, { id: "x" });
    expect(res).toEqual({ delivered: "log" });
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBeUndefined();
    vi.doUnmock("@/lib/realtime/eventLog");
  });
});
