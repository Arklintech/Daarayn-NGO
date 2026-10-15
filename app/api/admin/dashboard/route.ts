import { requireAdmin } from "@/lib/server/auth";
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

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const TIMEOUT_MS = 20_000;

    // Always read fresh rows: donations and donors are written by other
    // serverless instances, so this instance's cache can be out of date.
    const [donations, donors, reports, causes] = await Promise.all([
      withTimeout(donationRepository.getAll(true), TIMEOUT_MS, []),
      withTimeout(donorRepository.getAll(true), TIMEOUT_MS, []),
      withTimeout(fieldReportRepository.getAll(true), TIMEOUT_MS, []),
      withTimeout(causeRepository.getAll(true), TIMEOUT_MS, []),
    ]);

    let totalDonationSum = 0;
    let pendingDonationSum = 0;
    let completedCount = 0;
    let pendingCount = 0;

    for (const d of donations) {
      const amt = Number(d.amount || 0);
      const status = (d.status || "").toLowerCase();
      if (status === "completed" || status === "verified") {
        totalDonationSum += amt;
        completedCount++;
      } else if (status !== "rejected" && status !== "failed" && status !== "cancelled") {
        pendingDonationSum += amt;
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

    // Monthly amounts received over the last 6 months (verified + awaiting verification)
    const now = new Date();
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, month: d.toLocaleString("en-US", { month: "short" }), amount: 0 };
    });
    for (const d of donations as any[]) {
      const status = String(d.status || "").toLowerCase();
      if (status === "rejected" || status === "failed" || status === "cancelled") continue;
      const when = new Date(d.date || d.createdAt || "");
      if (isNaN(when.getTime())) continue;
      const bucket = monthlyTrend.find((m) => m.key === `${when.getFullYear()}-${when.getMonth()}`);
      if (bucket) bucket.amount += Number(d.amount || 0);
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newDonorsLast30Days = donors.filter((d: any) => {
      const joined = new Date(d.dateJoined || "").getTime();
      return !isNaN(joined) && joined >= thirtyDaysAgo;
    }).length;

    const totalDonors = donors.length;
    const activeCauses = causes.filter(c => (c.status as string) !== "Inactive").length;
    const totalReports = reports.length;

    return NextResponse.json({
      success: true,
      stats: {
        totalDonations: totalDonationSum,
        pendingAmount: pendingDonationSum,
        totalDonors,
        newDonorsLast30Days,
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
      recentDonations: recent,
      monthlyTrend: monthlyTrend.map(({ month, amount }) => ({ month, amount })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[DashboardAPI] Error fetching dashboard data:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

