import { describe, it, expect, beforeEach, vi } from "vitest";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld } from "./helpers/mocks";

beforeEach(resetWorld);

describe("D4 speed: concurrent reads share one Google Sheets request", () => {
  it("several simultaneous ordinary getAll() calls on one tab read the sheet once (a forced refresh always reads fresh)", async () => {
    fakeSheets.seed("Causes", ["id", "title", "status"], [{ id: "C1", title: "One", status: "Active" }]);
    const { causeRepository } = await import("@/lib/repositories/causeRepository");
    causeRepository.invalidateCache();
    const spy = vi.spyOn(fakeSheets, "getAllRows");
    const results = await Promise.all(Array.from({ length: 6 }, () => causeRepository.getAll()));
    expect(spy).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r.map((c) => c.id)).toEqual(["C1"]);
    spy.mockRestore();
  });

  it("a later read after the first finished reads again (no stale sharing)", async () => {
    fakeSheets.seed("Causes", ["id", "title", "status"], [{ id: "C1", title: "One", status: "Active" }]);
    const { causeRepository } = await import("@/lib/repositories/causeRepository");
    causeRepository.invalidateCache();
    await causeRepository.getAll(true);
    fakeSheets.seed("Causes", ["id", "title", "status"], [{ id: "C1", title: "One", status: "Active" }, { id: "C2", title: "Two", status: "Active" }]);
    expect((await causeRepository.getAll(true)).map((c) => c.id)).toEqual(["C1", "C2"]);
  });
});
