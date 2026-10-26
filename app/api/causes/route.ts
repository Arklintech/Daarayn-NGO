import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donationCauseRepository } from "@/lib/repositories/donationCauseRepository";
import { fundingByDesignation } from "@/lib/donations/metrics";
import { isSelectableCause, saveCause, CatalogError } from "@/lib/catalog/causes";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";

/**
 * The shared catalog. Public callers (donation form, ribbon) receive only causes that are open for donations
 * (Active or Urgent) in a public-safe shape. An authenticated admin receives every cause with its lifecycle
 * status. There is no seeding and no hardcoded fallback: if the catalog cannot be read, the error is reported.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  const isAdmin = !(admin instanceof NextResponse);

  try {
    const all = await causeRepository.getAll();
    const causes = isAdmin ? all : all.filter(isSelectableCause);

    // Raised = VERIFIED donations explicitly designated to the cause (never the whole of a multi-cause donation).
    let funding: ReturnType<typeof fundingByDesignation> | null = null;
    try {
      funding = fundingByDesignation(await donationRepository.getAll(), await donationCauseRepository.getAll(), all);
    } catch (err: any) {
      console.error("[API/Causes] Donations unavailable, using recorded raised amounts:", err.message);
    }

    return NextResponse.json(
      causes.map((c) => ({
        id: c.id,
        title: c.title,
        name: c.title,
        category: c.category,
        kind: c.kind || "cause",
        targetAmount: c.targetAmount,
        raisedAmount: funding ? funding.byCause.get(c.id)?.designatedReceived ?? 0 : c.raisedAmount,
        recordedRaisedAmount: c.raisedAmount,
        raisedSource: funding ? "verified_designations" : "recorded",
        supporters: funding ? funding.byCause.get(c.id)?.contributorCount ?? 0 : undefined,
        location: c.location,
        description: c.description,
        status: c.status,
        imageUrl: c.imageUrl || (c.driveFileId ? `/api/media/${c.driveFileId}` : ""),
      })),
      { headers: { "Cache-Control": isAdmin ? "no-store" : "public, s-maxage=10, stale-while-revalidate=60" } }
    );
  } catch (error: any) {
    console.error("[API/Causes] Error retrieving causes:", error);
    return NextResponse.json({ error: "The cause catalog could not be read from Google Sheets." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    const { cause, created } = await saveCause(body, adminAuth.email);
    causeRepository.invalidateCache();
    realtimeBroadcaster.broadcast(RealtimeEvent.CAUSE_UPDATED, { id: cause.id });
    return NextResponse.json({ success: true, cause, created });
  } catch (error: any) {
    if (error instanceof CatalogError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    console.error("[API/Causes] Error saving cause:", error);
    return NextResponse.json({ error: "Failed to persist cause." }, { status: 500 });
  }
}
