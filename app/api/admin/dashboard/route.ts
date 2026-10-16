import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/donations/snapshot";
import { canonicalStatus, fundingByCause, monthlyTrend, summarizeDonations } from "@/lib/donations/metrics";

export const maxDuration = 25;
export const dynamic = "force-dynamic";

const READ_TIMEOUT_MS = 20_000;
const REVIEW_STATUSES = new Set(["pending review", "needs info"]);

// In-memory cache with 3-minute TTL for dashboard
let cachedDashboard: any = null;
let dashboardCacheTime = 0;
const DASHBOARD_CACHE_TTL = 3 * 60 * 1000;

const AUDIT_LABELS: Record<string, string> = {
  SUBMIT_DONATION: "Donation submitted",
  DONATION_PROCESSED: "Donation processed",
  UPDATE_DONATION_STATUS: "Donation status changed",
  CREATE_FIELD_AGENT: "Field agent created",
  SUBMIT_FIELD_REPORT: "Field report submitted",
  UPDATE_FIELD_REPORT_STATUS: "Field report status changed",
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Google Sheets did not respond within ${ms / 1000}s`)), ms)),
  ]);
}

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    // One request, fresh rows: other instances write donations and donors.
    const snap = await withTimeout(loadSnapshot(["donations", "donors", "causes", "fieldReports", "auditLog"]), READ_TIMEOUT_MS);
    const { donations, donors, causes, fieldReports, auditLog } = snap;

    const summary = summarizeDonations(donations);
    const { unattributed } = fundingByCause(donations, causes);

    const recent = [...donations]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 8)
      .map((d) => ({
        id: d.id,
        donor: d.donorName || "Generous Donor",
        cause: d.causeTitle || "General Support",
        amount: Number(d.amount || 0),
        date: d.date,
        status: canonicalStatus(d.status),
      }));

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newDonorsLast30Days = donors.filter((d) => {
      const joined = new Date(d.dateJoined || "").getTime();
      return !isNaN(joined) && joined >= thirtyDaysAgo;
    }).length;

    const activity = auditLog
      .filter((e) => e.action && !e.action.startsWith("KHIZR_"))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        label: AUDIT_LABELS[e.action] || e.action.replace(/_/g, " ").toLowerCase(),
        actor: e.actor_role === "admin" ? e.actor_id : e.actor_role || "system",
        entity: [e.entity_type, e.entity_id].filter(Boolean).join(" "),
        timestamp: e.timestamp,
      }));

    const response = {
      success: true,
      readAt: snap.readAt,
      stats: {
        totalDonations: summary.receivedAmount,
        completedDonations: summary.receivedCount,
        pendingAmount: summary.pendingAmount,
        pendingDonations: summary.pendingCount,
        rejectedAmount: summary.rejectedAmount,
        rejectedDonations: summary.rejectedCount,
        averageVerifiedDonation: summary.receivedCount ? Math.round(summary.receivedAmount / summary.receivedCount) : 0,
        generalFundReceived: unattributed.receivedAmount,
        generalFundCount: unattributed.receivedCount,
        totalDonors: donors.length,
        newDonorsLast30Days,
        totalCauses: causes.length,
        activeCampaigns: causes.filter((c) => String(c.status) !== "Inactive").length,
        totalReports: fieldReports.length,
        reportsAwaitingReview: fieldReports.filter((r: any) => REVIEW_STATUSES.has(String(r.status || "").toLowerCase())).length,
      },
      statusBreakdown: [
        { label: "Verified", amount: summary.receivedAmount, count: summary.receivedCount },
        { label: "Pending", amount: summary.pendingAmount, count: summary.pendingCount },
        { label: "Rejected", amount: summary.rejectedAmount, count: summary.rejectedCount },
      ],
      recentDonations: recent,
      monthlyTrend: monthlyTrend(donations, 6).map(({ month, amount, pending }) => ({ month, amount, pending })),
      activity,
    };

    // Cache successful response
    cachedDashboard = response;
    dashboardCacheTime = Date.now();

    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[DashboardAPI] Error fetching dashboard data:", error?.message);

    // Return cached data if available and fresh
    if (cachedDashboard && Date.now() - dashboardCacheTime < DASHBOARD_CACHE_TTL) {
      return NextResponse.json({
        ...cachedDashboard,
        cached: true,
        cacheAge: Date.now() - dashboardCacheTime
      }, { headers: { "Cache-Control": "no-store" } });
    }

    // Return empty but success to prevent UI crashes
    return NextResponse.json({
      success: true,
      stats: {
        totalDonations: 0,
        completedDonations: 0,
        pendingAmount: 0,
        pendingDonations: 0,
        rejectedAmount: 0,
        rejectedDonations: 0,
        averageVerifiedDonation: 0,
        generalFundReceived: 0,
        generalFundCount: 0,
        totalDonors: 0,
        newDonorsLast30Days: 0,
        totalCauses: 0,
        activeCampaigns: 0,
        totalReports: 0,
        reportsAwaitingReview: 0,
      },
      statusBreakdown: [],
      recentDonations: [],
      monthlyTrend: [],
      activity: [],
      cached: true,
      error: "Dashboard service temporarily unavailable"
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
