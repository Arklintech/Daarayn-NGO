import { NextRequest, NextResponse, after } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { sendEmail } from "@/lib/email/providerManager";
import { issueChallenge } from "@/lib/donors/portalAuth";
import { guardCodeRequest, PortalGuardUnavailableError } from "@/lib/donors/portalGuard";

const GENERIC = "If a donor profile with an email address exists for this identifier, a one-time code has been sent to that address.";

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

/** Runs after the response when the framework allows it, so a known donor's slower mail send is not visible as a timing difference. */
function afterResponse(task: () => Promise<void>) {
  const safe = () => task().catch((err) => console.error("[API/DonorLookup] Could not send the portal code:", String(err?.message || err)));
  try {
    after(safe);
  } catch {
    return safe(); // outside a request scope (tests, scripts): run inline
  }
  return Promise.resolve();
}

/**
 * Donor portal, step 1. Knowing an email address or phone number is not proof of owning it, so this route never
 * returns donor data. It always answers the same way; when a donor profile with an email address exists, a one-time
 * code is sent to THAT address, and the browser receives only an opaque signed challenge to exchange at /verify.
 * Limits (per IP, identifier, donor, hour/day and a daily cap) are shared across instances through Sheets (portalGuard).
 */
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { limit: 10, windowMs: 60 * 1000 });
  if (!limited.allowed && limited.response) return limited.response;

  try {
    const { identifier } = await request.json();
    const clean = String(identifier || "").trim();
    if (!clean) {
      return NextResponse.json({ error: "Email or phone number is required." }, { status: 400 });
    }

    const donor = await donorRepository.findByContact(clean, true);
    const decision = await guardCodeRequest({ ip: clientIp(request), identifier: clean, donorId: donor?.id || "" });
    if (!decision.allowed && decision.scope === "ip") {
      return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": "600" } });
    }

    // Identical response whether or not a code is sent (refused by a limit, unknown donor, or donor without e-mail).
    const { challenge, code } = issueChallenge(decision.allowed ? donor?.id || "" : "");
    if (decision.allowed && donor?.email) {
      const to = donor.email;
      await afterResponse(async () => {
        const sent = await sendEmail({
          to,
          subject: "Your Daarayn donor portal code",
          html: `<p>Your one-time code for the Daarayn donor portal is:</p><p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p><p>It expires in 10 minutes and works once. If you did not ask for it, you can ignore this email.</p>`,
        });
        if (!sent.success) console.error("[API/DonorLookup] Could not send the portal code:", (sent as any).error);
      });
    }

    return NextResponse.json({ success: true, challenge, message: GENERIC });
  } catch (error: any) {
    if (error instanceof PortalGuardUnavailableError) {
      console.error("[API/DonorLookup]", error.message);
      return NextResponse.json({ error: "Donor sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    console.error("[API/DonorLookup] Lookup error:", String(error?.message || error));
    return NextResponse.json({ error: "Failed to start donor sign-in." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
