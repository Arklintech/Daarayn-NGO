/**
 * lib/donors/portalAuth.ts
 *
 * Donor portal access. Knowing someone's email or phone number is not proof of being that person, so the portal asks
 * for a one-time code sent to the email on the donor's profile and exchanges it for a short-lived signed session.
 * Tokens are signed and stateless; single use, guess limits and request limits are enforced in portalGuard.ts.
 */
import crypto from "crypto";
import { signingKey } from "../server/signingKey";

export const SESSION_COOKIE = "daarayn_donor";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const b64u = (b: Buffer) => b.toString("base64url");
const sign = (purpose: string, payload: string) => b64u(crypto.createHmac("sha256", signingKey(purpose)).update(payload).digest());
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const codeHash = (nonce: string, donorId: string, code: string) => sign("donor-code", `${nonce}|${donorId}|${code}`);

/** donorId "" issues a challenge that can never verify, so an unknown identifier is indistinguishable from a known one. */
export function issueChallenge(donorId: string, now = Date.now()): { challenge: string; code: string } {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const nonce = b64u(crypto.randomBytes(9));
  const payload = b64u(Buffer.from(JSON.stringify({ t: "c", n: nonce, d: donorId, h: codeHash(nonce, donorId, code), x: now + CHALLENGE_TTL_MS })));
  return { challenge: `${payload}.${sign("donor-challenge", payload)}`, code };
}

export interface ChallengeData { nonce: string; donorId: string; hash: string; expiresAt: number }

/** Checks the signature and expiry only. Single use and guess limits are enforced by portalGuard (shared across instances). */
export function readChallenge(challenge: unknown, now = Date.now()): ChallengeData | null {
  if (typeof challenge !== "string" || !challenge.includes(".")) return null;
  const [payload, sig] = challenge.split(".");
  if (!safeEqual(sig || "", sign("donor-challenge", payload || ""))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.t !== "c" || !data.n || typeof data.x !== "number" || data.x < now) return null;
    return { nonce: String(data.n), donorId: String(data.d || ""), hash: String(data.h || ""), expiresAt: data.x };
  } catch {
    return null;
  }
}

/** True only for a challenge issued for a real donor whose code matches. An unknown-identifier challenge never matches. */
export function codeMatches(data: ChallengeData, code: unknown): boolean {
  if (typeof code !== "string" || !data.donorId) return false;
  return safeEqual(data.hash, codeHash(data.nonce, data.donorId, code.trim()));
}

export function issueSession(donorId: string, now = Date.now()): string {
  const payload = b64u(Buffer.from(JSON.stringify({ t: "s", d: donorId, x: now + SESSION_TTL_MS })));
  return `${payload}.${sign("donor-session", payload)}`;
}

export function verifySession(token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!safeEqual(sig || "", sign("donor-session", payload || ""))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.t === "s" && data.d && data.x >= now ? String(data.d) : null;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
