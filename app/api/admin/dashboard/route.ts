import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { loadSnapshot } from "@/lib/donations/snapshot";
import { canonicalStatus, monthlyTrend, summarizeDonations } from "@/lib/donations/metrics";
import { computeDashboard } from "@/lib/reporting/dashboard";

export const maxDuration = 25;
export const dynamic = "force-dynamic";

const READ_TIMEOUT_MS = 20_000;
const REVIEW_STATUSES = new Set(["pending review", "needs info"]);

const AUDIT_LABELS: Record<string, string> = {
  SUBMIT_DONATION: "Donation submitted",
  DONATION_PROCESSED: "Donation processed",
  UPDATE_DONATION_STATUS: "Donation status changed",
  CREATE_FIELD_AGENT: "Field agent created",
  SUBMIT_FIELD_REPORT: "Field report submitted",
  UPDATE_FIELD_REPORT_STATUS: "Field report status changed",
  CREATE_CAUSE: "Cause created",
  CHANGE_CAUSE_STATUS: "Cause status changed",
  CREATE_ALLOCATION: "Allocation recorded",
  REVERSE_ALLOCATION: "Allocation reversed",
  RECORD_DESIGNATION: "Cause distribution recorded",
  RECOVER_DONATION_FOLLOW_UP: "Donation follow-up recovered",
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Google Sheets did not respond within ${ms / 1000}s`)), ms)),
  ]);
}

/**
 * Every figure is computed from one consistent snapshot of the canonical records (see lib/reporting/dashboard.ts for the
 * definitions). If Google Sheets cannot be read the response is an ERROR (503), never zeros presented as a result.
 * Optional ?from=&to= (ISO dates) restricts donations and new donors to a reporting period.
 */
export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const url = new URL(request.url);
    const range = { from: url.searchParams.get("from") || undefined, to: url.searchParams.get("to") || undefined };

    const snap = await withTimeout(loadSnapshot(["donations", "donors", "causes", "fieldReports", "auditLog", "designations", "allocations", "recipients"]), READ_TIMEOUT_MS);
    const { donations, donors, causes, fieldReports, auditLog, designations, allocations, recipients } = snap;

    const real = donations.filter((d) => d.id !== "PENDING");
    const scoped = real.filter((d) => {
      if (!range.from && !range.to) return true;
      const t = new Date(d.date || "").getTime();
      return !Number.isNaN(t) && (!range.from || t >= new Date(range.from).getTime()) && (!range.to || t <= new Date(range.to).getTime());
    });
    const summary = summarizeDonations(scoped);
    const canonical = computeDashboard({ donations, donors, causes, designations, allocations, recipients, range });

    const recent = [...scoped]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 8)
      .map((d) => ({ id: d.id, donor: d.donorName || "Generous Donor", cause: d.causeTitle || "General Support", amount: Number(d.amount || 0), date: d.date, status: canonicalStatus(d.status) }));

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

    return NextResponse.json(
      {
        success: true,
        readAt: snap.readAt,
        range,
        stats: {
          totalDonations: summary.receivedAmount,
          completedDonations: summary.receivedCount,
          pendingAmount: summary.pendingAmount,
          pendingDonations: summary.pendingCount,
          rejectedAmount: summary.rejectedAmount,
          rejectedDonations: summary.rejectedCount,
          averageVerifiedDonation: summary.receivedCount ? Math.round(summary.receivedAmount / summary.receivedCount) : 0,
          generalFundReceived: canonical.unrestricted.receivedAmount,
          generalFundCount: canonical.unrestricted.receivedCount,
          unresolvedDistributionAmount: canonical.unresolvedDistribution.receivedAmount,
          unresolvedDistributionCount: canonical.unresolvedDistribution.receivedCount,
          totalDonors: donors.length,
          newDonorsLast30Days: canonical.donors.newInPeriod,
          totalCauses: causes.length,
          activeCampaigns: causes.filter((c) => ["active", "urgent"].includes(String(c.status).toLowerCase())).length,
          totalReports: fieldReports.length,
          reportsAwaitingReview: fieldReports.filter((r: any) => REVIEW_STATUSES.has(String(r.status || "").toLowerCase())).length,
          allocatedAmount: canonical.allocations.activeAmount,
          integrityErrors: canonical.integrity.errors,
        },
        statusBreakdown: [
          { label: "Verified", amount: summary.receivedAmount, count: summary.receivedCount },
          { label: "Pending", amount: summary.pendingAmount, count: summary.pendingCount },
          { label: "Rejected", amount: summary.rejectedAmount, count: summary.rejectedCount },
        ],
        recentDonations: recent,
        monthlyTrend: monthlyTrend(scoped, 6).map(({ month, amount, pending }) => ({ month, amount, pending })),
        activity,
        canonical,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[DashboardAPI] Error fetching dashboard data:", error?.message);
    return NextResponse.json(
      { success: false, error: "The dashboard figures could not be read from Google Sheets. No figures are shown rather than showing zeros." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
