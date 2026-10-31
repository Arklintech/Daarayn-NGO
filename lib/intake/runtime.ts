/**
 * lib/intake/runtime.ts  (D38, ISOLATED): the switch and small shared helpers of the queued path.
 * The queued path is OFF unless DONATION_INTAKE_MODE=queued. With it off, every queued route answers 404 and the direct donation path is untouched.
 */
import crypto from "crypto";

export const intakeModeEnabled = (env: Record<string, string | undefined> = process.env) => (env.DONATION_INTAKE_MODE || "").trim() === "queued";

/** Constant-time check of an `Authorization: Bearer <secret>` header. A secret shorter than 24 characters counts as "not configured". */
export function bearerMatches(header: string | null, secret: string | undefined): "ok" | "unconfigured" | "denied" {
  const s = (secret || "").trim();
  if (s.length < 24) return "unconfigured";
  const given = Buffer.from(header || "");
  const want = Buffer.from(`Bearer ${s}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want) ? "ok" : "denied";
}

/** A donor-facing submission reference: SUB- plus 12 characters of the reference alphabet. */
export const isSubmissionReference = (v: unknown): v is string => typeof v === "string" && /^SUB-[0-9A-Z]{12}$/.test(v);
