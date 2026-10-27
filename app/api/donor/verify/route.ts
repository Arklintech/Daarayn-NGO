import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, codeMatches, issueSession, readChallenge } from "@/lib/donors/portalAuth";
import { guardCodeAttempt, PortalGuardUnavailableError } from "@/lib/donors/portalGuard";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
const REFUSED = { error: "That code is not valid or has expired. Request a new one." };

/**
 * Donor portal, step 2: exchange the emailed code for a signed, httpOnly session cookie.
 * Every attempt is counted in the shared Sheets ledger BEFORE the code is compared; a code works once, across instances.
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { limit: 10, windowMs: 60 * 1000 });
  if (!limited.allowed && limited.response) return limited.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const data = readChallenge(body?.challenge);
  if (!data) return NextResponse.json(REFUSED, { status: 401 });

  try {
    const attempt = await guardCodeAttempt({ ip: clientIp(request), nonce: data.nonce });
    if (!attempt.ok) {
      return NextResponse.json(attempt.reason === "ip-limit" ? { error: "Too many attempts. Please wait a few minutes." } : REFUSED, { status: attempt.reason === "ip-limit" ? 429 : 401 });
    }
    if (!codeMatches(data, body?.code)) return NextResponse.json(REFUSED, { status: 401 });
    if (!(await attempt.consume())) return NextResponse.json(REFUSED, { status: 401 }); // lost a concurrent use of the same code

    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, issueSession(data.donorId), { ...cookieOptions, maxAge: SESSION_MAX_AGE_SECONDS });
    return res;
  } catch (error: any) {
    if (error instanceof PortalGuardUnavailableError) {
      console.error("[API/DonorVerify]", error.message);
      return NextResponse.json({ error: "Donor sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    console.error("[API/DonorVerify] error:", String(error?.message || error));
    return NextResponse.json({ error: "Failed to verify the code." }, { status: 500 });
  }
}

/** Sign out. */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}

export const dynamic = "force-dynamic";
