import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationsForDonor } from "@/lib/donations/metrics";
import { SESSION_COOKIE, verifySession } from "@/lib/donors/portalAuth";

export async function GET(request: NextRequest) {
  try {
    // Only the signed-in donor's own data is ever served; a donorId in the URL is not an identity.
    const donorId = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!donorId) {
      return NextResponse.json({ error: "Please sign in to view your giving history." }, { status: 401 });
    }
    const asked = new URL(request.url).searchParams.get("donorId");
    if (asked && asked !== donorId) {
      return NextResponse.json({ error: "You can only view your own giving history." }, { status: 403 });
    }

    const donor = await donorRepository.getById(donorId);
    if (!donor) {
      return NextResponse.json({ error: "Donor not found." }, { status: 404 });
    }

    const allDonations = await donationRepository.getAll();
    // Same relationship rule as the admin CRM: donor token, else a non-empty matching email.
    const donorDonations = donationsForDonor(allDonations, donor);

    const causes = await causeRepository.getAll();
    const allocations = donorDonations.map((d) => ({
      id: d.id,
      causeTitle: d.causeTitle || d.donationType,
      amount: d.amount,
      directAid: Math.round(d.amount * 0.9),
      opsCost: Math.round(d.amount * 0.1),
      date: d.date,
      status: d.status,
    }));

    return NextResponse.json({
      success: true,
      donor,
      donations: donorDonations,
      allocations,
      causes,
    });
  } catch (error: any) {
    console.error("[API/DonorDashboard] Dashboard fetch error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve donor portal data." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
