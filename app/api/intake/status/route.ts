import { NextRequest, NextResponse } from "next/server";
import { getIntakeStatus, type DonorFacingStatus } from "@/lib/intake/status";
import { intakeModeEnabled, isSubmissionReference } from "@/lib/intake/runtime";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { runWithPriority } from "@/lib/google/requestControl";

export const dynamic = "force-dynamic";

/**
 * Donor status lookup by submission reference (D38, OFF unless DONATION_INTAKE_MODE=queued). The reference is the only key and the answer carries NO personal data:
 * a state, the donation number once it exists, whether it is final, and a plain sentence. A lookup costs one Sheets read, so it is cached per reference for
 * 10 s and rate limited, and the page never polls on its own.
 */
const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; value: DonorFacingStatus | null }>();

async function GET_handler(request: NextRequest) {
  if (!intakeModeEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limited = checkRateLimit(request, { limit: 30, windowMs: 60 * 1000 });
  if (!limited.allowed && limited.response) return limited.response;
  const ref = (new URL(request.url).searchParams.get("ref") || "").trim().toUpperCase();
  if (!isSubmissionReference(ref)) return NextResponse.json({ error: "That is not a valid submission reference." }, { status: 400 });
  const hit = cache.get(ref);
  let value: DonorFacingStatus | null;
  if (hit && Date.now() - hit.at < CACHE_MS) value = hit.value;
  else {
    try {
      value = await getIntakeStatus(ref);
    } catch {
      return NextResponse.json({ error: "We could not check the status right now. Please try again in a minute." }, { status: 503, headers: { "Retry-After": "30" } });
    }
    if (cache.size > 500) cache.clear();
    cache.set(ref, { at: Date.now(), value });
  }
  // A reference we do not know may simply not be written yet (or be mistyped): the answer is the same either way.
  if (!value) return NextResponse.json({ error: "We could not find that reference. Check it and try again in a minute." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...value, checkAgainInSeconds: value.final ? 0 : 30 }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = (...args: Parameters<typeof GET_handler>) => runWithPriority("P3", () => GET_handler(...args));
