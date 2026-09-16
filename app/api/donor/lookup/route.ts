import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json();
    const clean = (identifier || "").trim().toLowerCase();
    if (!clean) {
      return NextResponse.json({ error: "Email or phone number is required." }, { status: 400 });
    }

    // Lookup in Google Sheets repository
    let donor = await donorRepository.findByContact(clean);

    // If not found, automatically register a new donor profile in Google Sheets
    if (!donor) {
      const isEmail = clean.includes("@");
      const newId = `DNR-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;

      donor = {
        id: newId,
        name: isEmail ? clean.split("@")[0] : "New Donor",
        email: isEmail ? clean : "",
        phone: !isEmail ? clean : "",
        country: "India",
        city: "",
        donationPreference: "General Fund",
        communicationPreference: isEmail ? "Email" : "WhatsApp",
        dateJoined: new Date().toISOString(),
        totalDonations: 0,
        totalAmountDonated: 0,
        projectsSupportedCount: 0,
        casesSupportedCount: 0,
        donationHistory: [],
        projectsSupported: [],
        casesSupported: [],
        status: "active",
      };
      await donorRepository.save(donor);
    }

    return NextResponse.json({ success: true, donor });
  } catch (error: any) {
    console.error("[API/DonorLookup] Lookup error:", error);
    return NextResponse.json(
      { error: "Failed to verify donor credentials." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
