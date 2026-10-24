import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { checkRateLimit } from "@/lib/security/rate-limiter";

/**
 * Donor portal sign-in lookup. It only recognises an EXISTING donor (created by
 * a donation); it never creates a donor profile, and it returns just the Donor
 * Token and first name so contact details are not disclosed to whoever knows an
 * email address or phone number.
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
    if (!donor) {
      return NextResponse.json({ error: "No donor profile was found for this email or phone number. Profiles are created when you make a donation." }, { status: 404 });
    }

    return NextResponse.json({ success: true, donor: { id: donor.id, name: (donor.name || "").split(" ")[0] } });
  } catch (error: any) {
    console.error("[API/DonorLookup] Lookup error:", error);
    return NextResponse.json({ error: "Failed to verify donor credentials." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
