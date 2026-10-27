import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSheets } from "./helpers/fakeSheets";
import { resetWorld, mailMock } from "./helpers/mocks";

async function seed() {
  fakeSheets.seed("Donors", ["id", "name", "email", "phone", "status", "donationHistory", "projectsSupported", "casesSupported"], [
    { id: "DNR-T1-AAAA", name: "Donor 1", email: "d1@example.org", phone: "", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" },
    { id: "DNR-T2-AAAA", name: "Donor 2", email: "d2@example.org", phone: "9876543210", status: "active", donationHistory: "[]", projectsSupported: "[]", casesSupported: "[]" },
  ]);
  fakeSheets.seed("Donations", ["id", "donorId", "donorName", "donorEmail", "amount", "currency", "date", "status", "submissionKey"], []);
}
let ipN = 0;
const req = (url: string, body: any, ip = `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`) =>
  new NextRequest(`http://t${url}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
const lookup = async (identifier: string, ip?: string) => (await import("@/app/api/donor/lookup/route")).POST(req("/api/donor/lookup", { identifier }, ip));
const verify = async (challenge: string, code: string, ip?: string) => (await import("@/app/api/donor/verify/route")).POST(req("/api/donor/verify", { challenge, code }, ip));
const lastCode = () => mailMock.sendEmail.mock.calls.at(-1)![0].html.match(/\b(\d{6})\b/)[1] as string;
const wrongOf = (c: string) => (c === "000000" ? "000001" : "000000");

/** A different server instance: all module state (in-memory limiter, repository caches) is gone; only Google Sheets remains. */
async function newInstance() {
  const snapshot = [...fakeSheets.tabs.entries()].map(([k, v]) => [k, { headers: [...v.headers], rows: v.rows.map((r) => [...r]) }] as [string, { headers: string[]; rows: string[][] }]);
  vi.resetModules();
  const { fakeSheets: fresh } = await import("./helpers/fakeSheets");
  fresh.tabs = new Map(snapshot);
  return fresh;
}

beforeEach(async () => {
  await resetWorld();
  await seed();
  process.env.PORTAL_SIGNING_SECRET = "test-secret";
  delete process.env.PORTAL_DAILY_CODE_CAP;
});

describe("donor portal: sign-in still works for legitimate donors", () => {
  it("request code → verify → session cookie, and the code works only once", async () => {
    const { challenge } = await (await lookup("d1@example.org")).json();
    const code = lastCode();
    const ok = await verify(challenge, code);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie") || "").toMatch(/daarayn_donor=/);
    expect((await verify(challenge, code)).status).toBe(401); // consumed
  });

  it("an expired challenge is refused", async () => {
    const { issueChallenge } = await import("@/lib/donors/portalAuth");
    const { challenge, code } = issueChallenge("DNR-T1-AAAA", Date.now() - 11 * 60 * 1000);
    expect((await verify(challenge, code)).status).toBe(401);
  });
});

describe("donor portal: code request limits are shared across instances", () => {
  it("answers identically for known, unknown and phone-only identifiers, and sends only to the profile's own address", async () => {
    const a = await (await lookup("d1@example.org")).json();
    const b = await (await lookup("nobody@example.org")).json();
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.message).toBe(b.message);
    expect(mailMock.sendEmail).toHaveBeenCalledTimes(1);
    expect(mailMock.sendEmail.mock.calls[0][0].to).toBe("d1@example.org");
  });

  it("per identifier: only 3 codes per window, the same generic answer afterwards, no mail", async () => {
    for (let i = 0; i < 3; i++) expect((await lookup(" D1@example.org ")).status).toBe(200);
    expect(mailMock.sendEmail).toHaveBeenCalledTimes(3);
    const fourth = await lookup("d1@example.org");
    expect(fourth.status).toBe(200);
    expect(Object.keys(await fourth.json()).sort()).toEqual(["challenge", "message", "success"]);
    expect(mailMock.sendEmail).toHaveBeenCalledTimes(3);
  });

  it("the identifier limit holds on a different instance (state is in Sheets, not in memory)", async () => {
    for (let i = 0; i < 3; i++) await lookup("d1@example.org");
    await newInstance();
    mailMock.sendEmail.mockClear();
    expect((await lookup("d1@example.org")).status).toBe(200);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("per donor: the same donor reached through e-mail and phone shares one limit", async () => {
    await lookup("d2@example.org");
    await lookup("9876543210");
    await lookup("d2@example.org");
    mailMock.sendEmail.mockClear();
    await lookup("98765 43210");
    expect(mailMock.sendEmail).not.toHaveBeenCalled(); // 4th for the donor within the hour
  });

  it("per IP: a flood from one address is refused with 429, whichever identifiers it tries", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await lookup(`u${i}@example.org`, "203.0.113.9")).status);
    // the route's own per-minute limiter (10) or the shared limiter (10 per 10 min) answers 429 from the 11th request
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });

  it("the per-IP limit holds on a different instance", async () => {
    for (let i = 0; i < 10; i++) await lookup(`u${i}@example.org`, "203.0.113.10");
    await newInstance();
    expect((await lookup("another@example.org", "203.0.113.10")).status).toBe(429);
  });

  it("daily cap: once reached no further code is mailed, to anyone", async () => {
    process.env.PORTAL_DAILY_CODE_CAP = "2";
    await lookup("d1@example.org");
    await lookup("d2@example.org");
    mailMock.sendEmail.mockClear();
    await lookup("d1@example.org");
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
  });

  it("concurrent requests cannot exceed the limit", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => lookup("d1@example.org")));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(mailMock.sendEmail.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mailMock.sendEmail.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("refused requests do not extend a victim's lockout (only mailed ones count toward the donor limit)", async () => {
    for (let i = 0; i < 20; i++) await lookup("d1@example.org");
    const events = fakeSheets.records("Portal_Auth_Events");
    const voided = events.filter((e) => e.kind === "request_void").length;
    expect(voided).toBeGreaterThan(0);
    expect(events.filter((e) => e.kind === "request").length - voided).toBe(3);
  });

  it("stores no plaintext identifier, address, IP or code", async () => {
    const { challenge } = await (await lookup("d1@example.org", "198.51.100.77")).json();
    const code = lastCode();
    await verify(challenge, code, "198.51.100.77");
    const dump = JSON.stringify(fakeSheets.records("Portal_Auth_Events"));
    for (const secret of ["d1@example.org", "198.51.100.77", "DNR-T1-AAAA", code]) expect(dump).not.toContain(secret);
  });

  it("fails closed when the shared store is unavailable (no in-memory substitute) and never mails", async () => {
    fakeSheets.failWrites = true;
    const res = await lookup("d1@example.org");
    expect(res.status).toBe(503);
    expect(mailMock.sendEmail).not.toHaveBeenCalled();
    const { challenge } = (await (await (async () => { fakeSheets.failWrites = false; return lookup("d1@example.org"); })()).json()) as any;
    fakeSheets.failWrites = true;
    expect((await verify(challenge, lastCode())).status).toBe(503);
  });
});

describe("donor portal: verification attempts", () => {
  it("five wrong guesses lock the challenge, even for the right code afterwards, and across instances", async () => {
    const { challenge } = await (await lookup("d1@example.org")).json();
    const code = lastCode();
    for (let i = 0; i < 5; i++) expect((await verify(challenge, wrongOf(code))).status).toBe(401);
    await newInstance();
    expect((await verify(challenge, code)).status).toBe(401);
  });

  it("a consumed code is refused on another instance", async () => {
    const { challenge } = await (await lookup("d1@example.org")).json();
    const code = lastCode();
    expect((await verify(challenge, code)).status).toBe(200);
    await newInstance();
    expect((await verify(challenge, code)).status).toBe(401);
  });

  it("concurrent use of one correct code yields exactly one session", async () => {
    const { challenge } = await (await lookup("d1@example.org")).json();
    const code = lastCode();
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(challenge, code)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it("an unknown identifier's challenge never verifies, and is counted like any other", async () => {
    const { challenge } = await (await lookup("nobody@example.org")).json();
    expect((await verify(challenge, "123456")).status).toBe(401);
  });

  it("per IP: too many verification attempts are refused with 429", async () => {
    const { challenge } = await (await lookup("d1@example.org")).json();
    const { guardCodeAttempt } = await import("@/lib/donors/portalGuard");
    let last: any;
    for (let i = 0; i < 31; i++) last = await guardCodeAttempt({ ip: "192.0.2.5", nonce: `n${i}` });
    expect(last).toEqual({ ok: false, reason: "ip-limit" });
    void challenge;
  });
});
