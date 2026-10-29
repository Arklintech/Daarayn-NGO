import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { allocationRepository } from "@/lib/repositories/allocationRepository";
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
    // Real allocations only: Allocations rows recorded against THIS donor's own donations and still active. A donation is not an allocation,
    // and no 90/10 (or any other) ratio is applied or implied here. Internal fields (admin e-mail, notes, evidence ids) are never returned.
    const ownDonationIds = new Set(donorDonations.map((d) => d.id));
    const allocations = (await allocationRepository.getAll(true))
      .filter((a) => ownDonationIds.has(a.donationId) && a.status === "active")
      .map((a) => ({ id: a.id, donationId: a.donationId, targetTitle: a.targetTitle, allocatedAmount: Number(a.allocatedAmount) || 0, allocationDate: a.allocationDate }));

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
