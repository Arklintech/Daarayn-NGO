/**
 * Server-only signing key for short-lived signed tokens (donor portal codes and sessions).
 * Uses PORTAL_SIGNING_SECRET when set, otherwise a value derived from other server-only secrets, so it is never
 * guessable from the browser. `purpose` keeps keys for different token kinds separate.
 */
import crypto from "crypto";

export function signingKey(purpose: string): Buffer {
  const secret =
    process.env.PORTAL_SIGNING_SECRET ||
    `${process.env.SMTP_PASS || ""}|${process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""}|${process.env.GOOGLE_PRIVATE_KEY || ""}|${process.env.ADMIN_EMAILS || ""}`;
  if (!secret.replace(/\|/g, "")) throw new Error("No server secret available to sign tokens (set PORTAL_SIGNING_SECRET).");
  return crypto.createHash("sha256").update(`daarayn-${purpose}:${secret}`).digest();
}
