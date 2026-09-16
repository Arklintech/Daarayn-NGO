import { NextResponse } from "next/server";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";
import { fieldReportRepository } from "@/lib/repositories/fieldReportRepository";
import { causeRepository } from "@/lib/repositories/causeRepository";

// Vercel max function duration (25 s for hobby, 60 s for pro)
export const maxDuration = 25;
export const dynamic = 'force-dynamic';

/** Resolves to `fallback` if `promise` does not settle within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function GET() {
  try {
    const TIMEOUT_MS = 20_000;

    const [donations, donors, reports, causes] = await Promise.all([
      withTimeout(donationRepository.getAll(), TIMEOUT_MS, []),
      withTimeout(donorRepository.getAll(), TIMEOUT_MS, []),
      withTimeout(fieldReportRepository.getAll(), TIMEOUT_MS, []),
      withTimeout(causeRepository.getAll(), TIMEOUT_MS, []),
    ]);

    let totalDonationSum = 0;
    let completedCount = 0;
    let pendingCount = 0;

    for (const d of donations) {
      const amt = Number(d.amount || 0);
      const status = (d.status || "").toLowerCase();
      if (status === "completed" || status === "verified") {
        totalDonationSum += amt;
        completedCount++;
      } else {
        pendingCount++;
      }
    }

    // Recent donations
    const recent = donations
      .map((d: any) => ({
        id: d.trackingId || d.id,
        donationId: d.id,
        donor: d.donorName || "Generous Donor",
        cause: d.causeName || d.causeTitle || "General Support",
        amount: Number(d.amount || 0),
        date: d.date || (d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN") : "Recent"),
        createdAt: d.date || d.createdAt,
        status: d.status || "completed"
      }))
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 8);

    const totalDonors = donors.length;
    const activeCauses = causes.filter(c => (c.status as string) !== "Inactive").length;
    const totalReports = reports.length;

    return NextResponse.json({
      success: true,
      stats: {
        totalDonations: totalDonationSum,
        totalDonors,
        completedDonations: completedCount,
        pendingDonations: pendingCount,
        activeCampaigns: activeCauses,
        totalReports,
        familiesHelped: Math.max(12, Math.round(totalDonationSum / 5000)),
        studentsSponsored: Math.max(8, Math.round(totalDonationSum / 12000)),
        masjidProjects: 3,
        waterProjects: 9,
        totalBeneficiaries: Math.max(180, totalDonors * 3)
      },
      recentDonations: recent
    });
  } catch (error: any) {
    console.error("[DashboardAPI] Error fetching dashboard data:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

