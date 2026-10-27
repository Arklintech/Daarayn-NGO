import { describe, it, expect } from "vitest";
import { issueChallenge, readChallenge, codeMatches, issueSession, verifySession } from "@/lib/donors/portalAuth";

const check = (challenge: unknown, code: unknown, now?: number) => {
  const d = readChallenge(challenge, now);
  return d && codeMatches(d, code) ? { ok: true as const, donorId: d.donorId } : { ok: false as const };
};

describe("donor portal one-time code (signature, expiry, match; single use and guess limits live in portalGuard)", () => {
  it("a correct code returns the donor the challenge was issued for", () => {
    const { challenge, code } = issueChallenge("DNR-A");
    expect(code).toMatch(/^\d{6}$/);
    expect(check(challenge, code)).toEqual({ ok: true, donorId: "DNR-A" });
  });

  it("a wrong code is refused", () => {
    const { challenge, code } = issueChallenge("DNR-A");
    expect(check(challenge, code === "000000" ? "000001" : "000000").ok).toBe(false);
  });

  it("an expired challenge is refused", () => {
    const t0 = Date.now();
    const { challenge, code } = issueChallenge("DNR-A", t0);
    expect(check(challenge, code, t0 + 11 * 60 * 1000).ok).toBe(false);
  });

  it("a tampered challenge is refused", () => {
    const a = issueChallenge("DNR-A");
    const b = issueChallenge("DNR-B");
    const [payloadA] = a.challenge.split(".");
    const [, sigB] = b.challenge.split(".");
    expect(check(`${payloadA}.${sigB}`, a.code).ok).toBe(false);
    expect(check("garbage", a.code).ok).toBe(false);
  });

  it("a challenge for an unknown identifier looks the same but never verifies", () => {
    const { challenge, code } = issueChallenge("");
    expect(challenge).toContain(".");
    expect(check(challenge, code).ok).toBe(false);
  });

  it("the code is not recoverable from the challenge", () => {
    const { challenge, code } = issueChallenge("DNR-A");
    expect(Buffer.from(challenge.split(".")[0], "base64url").toString()).not.toContain(code);
  });
});

describe("donor portal session", () => {
  it("round-trips the donor id", () => {
    expect(verifySession(issueSession("DNR-A"))).toBe("DNR-A");
  });
  it("expires", () => {
    const t0 = Date.now();
    expect(verifySession(issueSession("DNR-A", t0), t0 + 13 * 60 * 60 * 1000)).toBeNull();
  });
  it("rejects a modified donor id", () => {
    const [payload, sig] = issueSession("DNR-A").split(".");
    const forged = Buffer.from(JSON.stringify({ d: "DNR-B", x: Date.now() + 100000 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`)).toBeNull();
    expect(verifySession(payload)).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
  it("a challenge token is not accepted as a session", () => {
    expect(verifySession(issueChallenge("DNR-A").challenge)).toBeNull();
  });
});
