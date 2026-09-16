import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const donorId = searchParams.get("donorId");

    if (!donorId) {
      return NextResponse.json({ error: "donorId is required." }, { status: 400 });
    }

    const donor = await donorRepository.getById(donorId);
    if (!donor) {
      return NextResponse.json({ error: "Donor not found." }, { status: 404 });
    }

    const allDonations = await donationRepository.getAll();
    const donorDonations = allDonations.filter(
      (d) => d.donorId === donorId || d.donorEmail === donor.email
    );

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
