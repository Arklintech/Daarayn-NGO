import { decideWriteTarget } from "../google/config";

/**
 * The clock used for Masjid update timestamps, the 7-day hold and hold clearance. It is the real server clock, except in one narrowly
 * gated case: a process that is ALREADY authorized to write only to the approved test resources (development/test runtime, label "test",
 * allowlisted test sheet; see decideWriteTarget) may shift it with TEST_CLOCK_OFFSET_DAYS or freeze it with TEST_CLOCK_FIXED_ISO so the overdue state can be produced without
 * hand-editing spreadsheet rows. In every other process the variable is ignored, so production behavior cannot be altered by it.
 */
export function serverNow(env: Record<string, string | undefined> = process.env): Date {
  const productionRuntime = !!env.VERCEL || env.NODE_ENV === "production";
  const authorised = !productionRuntime && (env.GOOGLE_TARGET_ENV || "").trim().toLowerCase() === "test" && decideWriteTarget("sheets", env).allowed;
  if (!authorised) return new Date();
  // TEST_CLOCK_FIXED_ISO freezes the clock at one instant (to hit an exact boundary); otherwise TEST_CLOCK_OFFSET_DAYS shifts it.
  const fixed = Date.parse(env.TEST_CLOCK_FIXED_ISO || "");
  if (Number.isFinite(fixed)) return new Date(fixed);
  const days = Number(env.TEST_CLOCK_OFFSET_DAYS);
  if (!Number.isFinite(days) || days === 0) return new Date();
  return new Date(Date.now() + days * 86_400_000);
}
