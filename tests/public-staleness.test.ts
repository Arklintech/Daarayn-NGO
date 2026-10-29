import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3100" }) }));

const respond = (stampAgeMs: number | null, body: any = []) =>
  new Response(JSON.stringify(body), { status: 200, headers: stampAgeMs === null ? {} : { "x-generated-at": new Date(Date.now() - stampAgeMs).toISOString() } });

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PUBLIC_CATALOG_MAX_STALE_SECONDS;
});

// D9: Next serves the last good copy of a cached fetch while Sheets is down. That must not be presented as current forever.
describe("public pages refuse data that is too old to be called current", () => {
  it("fresh data is used; data older than the limit is refused so the page says it is unavailable", async () => {
    const { fetchPublicPrograms, fetchPublicCatalog } = await import("@/lib/catalog/publicClient");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(5_000, [{ id: "P" }]));
    expect(await fetchPublicPrograms()).toEqual([{ id: "P" }]);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(11 * 60_000, [{ id: "P" }]));
    await expect(fetchPublicPrograms()).rejects.toThrow(/older than/);
    await expect(fetchPublicCatalog()).rejects.toThrow(/older than/);
  });

  it("the limit is configurable and a response without a timestamp is not refused", async () => {
    const { fetchPublicPrograms } = await import("@/lib/catalog/publicClient");
    process.env.PUBLIC_CATALOG_MAX_STALE_SECONDS = "30";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(60_000));
    await expect(fetchPublicPrograms()).rejects.toThrow(/older than 30 s/);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond(null, [{ id: "Q" }]));
    expect(await fetchPublicPrograms()).toEqual([{ id: "Q" }]);
  });

  it("an error response is never treated as data", async () => {
    const { fetchPublicPrograms } = await import("@/lib/catalog/publicClient");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 503 }));
    await expect(fetchPublicPrograms()).rejects.toThrow(/unavailable/);
  });
});
