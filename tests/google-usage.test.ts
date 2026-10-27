import { describe, it, expect, beforeEach } from "vitest";
import { withGoogleRetry, setRetrySleep } from "@/lib/google/retry";
import { googleUsageSnapshot, resetGoogleUsage } from "@/lib/google/usage";

beforeEach(() => {
  resetGoogleUsage();
  setRetrySleep(async () => undefined);
});

// Phase 12: the 429 quota event could not be investigated because nothing counted Google API calls.
describe("Google API usage accounting", () => {
  it("counts every attempt per label, and quota rejections separately", async () => {
    let n = 0;
    await withGoogleRetry(async () => {
      n++;
      if (n < 3) throw Object.assign(new Error("Quota exceeded"), { code: 429 });
      return "ok";
    }, { label: "Sheets read rows" });
    await withGoogleRetry(async () => "ok", { label: "Sheets read rows" });
    await withGoogleRetry(async () => "ok", { label: "Sheets append" });

    const s = googleUsageSnapshot();
    expect(s.byLabel["Sheets read rows"]).toEqual({ calls: 4, quotaRejections: 2, failures: 2 });
    expect(s.byLabel["Sheets append"]).toEqual({ calls: 1, quotaRejections: 0, failures: 0 });
    expect(s.total).toEqual({ calls: 5, quotaRejections: 2, failures: 2 });
  });

  it("reports calls per minute so a burst is visible", async () => {
    for (let i = 0; i < 3; i++) await withGoogleRetry(async () => "ok", { label: "x" });
    const s = googleUsageSnapshot();
    expect(s.perMinute.reduce((t, m) => t + m.calls, 0)).toBe(3);
    expect(s.perMinute.length).toBeGreaterThan(0);
  });

  it("unlabelled calls are still counted", async () => {
    await withGoogleRetry(async () => "ok");
    expect(googleUsageSnapshot().byLabel["(unlabelled)"].calls).toBe(1);
  });

  it("never swallows the original error", async () => {
    await expect(withGoogleRetry(async () => { throw Object.assign(new Error("nope"), { code: 404 }); }, { label: "y" })).rejects.toThrow("nope");
    expect(googleUsageSnapshot().byLabel["y"]).toEqual({ calls: 1, quotaRejections: 0, failures: 1 });
  });
});
