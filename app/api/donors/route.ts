import { NextRequest, NextResponse } from "next/server";
import { donorRepository } from "@/lib/repositories/donorRepository";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase().trim();
    const status = searchParams.get("status")?.toLowerCase().trim();

    const donors = await donorRepository.getAll();

    let filtered = donors;
    if (status && status !== "all") {
      filtered = filtered.filter((d) => d.status?.toLowerCase() === status);
    }

    if (query) {
      filtered = filtered.filter(
        (d) =>
          d.name?.toLowerCase().includes(query) ||
          d.email?.toLowerCase().includes(query) ||
          d.phone?.includes(query) ||
          d.id?.toLowerCase().includes(query)
      );
    }

    return NextResponse.json(filtered);
  } catch (error: any) {
    console.error("[API/Donors] Failed to fetch donors:", error);
    return NextResponse.json(
      { error: "Failed to retrieve donor records." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "Donor name is required." }, { status: 400 });
    }

    let donor = body.id ? await donorRepository.getById(body.id) : null;
    if (!donor) {
      const newId = `DNR-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;
      donor = {
        id: newId,
        name: body.name,
        email: body.email || "",
        phone: body.phone || "",
        country: body.country || "India",
        city: body.city || "",
        donationPreference: body.donationPreference || "General Fund",
        communicationPreference: body.communicationPreference || "Email",
        dateJoined: new Date().toISOString(),
        totalDonations: Number(body.totalDonations) || 0,
        totalAmountDonated: Number(body.totalAmountDonated) || 0,
        projectsSupportedCount: Number(body.projectsSupportedCount) || 0,
        casesSupportedCount: Number(body.casesSupportedCount) || 0,
        donationHistory: Array.isArray(body.donationHistory) ? body.donationHistory : [],
        projectsSupported: Array.isArray(body.projectsSupported) ? body.projectsSupported : [],
        casesSupported: Array.isArray(body.casesSupported) ? body.casesSupported : [],
        status: body.status || "active",
      };
    } else {
      donor = {
        ...donor,
        ...body,
      };
    }

    await donorRepository.save(donor!);
    return NextResponse.json({ success: true, donor });
  } catch (error: any) {
    console.error("[API/Donors] Failed to save donor:", error);
    return NextResponse.json(
      { error: "Failed to persist donor profile." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
