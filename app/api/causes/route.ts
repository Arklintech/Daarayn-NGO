import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { DEFAULT_CAUSES } from "@/lib/causes";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { fundingByCause } from "@/lib/donations/metrics";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { RealtimeEvent } from "@/lib/realtime/events";

export async function GET(request: NextRequest) {
  try {
    let causes = await causeRepository.getAll();

    // If empty in Google Sheets, seed initial default causes
    if (causes.length === 0) {
      const initialCauses = DEFAULT_CAUSES.map((c) => ({
        id: c.id,
        title: c.title || c.name,
        category: c.category || "General",
        targetAmount: c.goalAmount || 500000,
        raisedAmount: 0,
        location: c.location || "National",
        description: c.description || "",
        status: "Active" as const,
        imageUrl: "",
        driveFileId: "",
        createdAt: new Date().toISOString(),
      }));

      await causeRepository.saveBatch(initialCauses);
      causes = await causeRepository.getAll(true);
    }

    // Raised = verified donations linked to the cause (lib/donations/metrics.ts).
    // The stored raisedAmount column also counted unverified submissions; it
    // is kept as recordedRaisedAmount and used only if donations cannot be read.
    let funding: ReturnType<typeof fundingByCause>["byCause"] | null = null;
    try {
      funding = fundingByCause(await donationRepository.getAll(), causes).byCause;
    } catch (err: any) {
      console.error("[API/Causes] Donations unavailable, using recorded raised amounts:", err.message);
    }

    // Public Safe mapping: ensures internal operational metadata is shielded
    const publicCauses = causes.map((c) => ({
      id: c.id,
      title: c.title,
      name: c.title,
      category: c.category,
      targetAmount: c.targetAmount,
      raisedAmount: funding ? funding.get(c.id)?.receivedAmount ?? 0 : c.raisedAmount,
      recordedRaisedAmount: c.raisedAmount,
      raisedSource: funding ? "verified_donations" : "recorded",
      supporters: funding ? funding.get(c.id)?.contributorCount ?? 0 : undefined,
      location: c.location,
      description: c.description,
      status: c.status,
      imageUrl: c.imageUrl || (c.driveFileId ? `/api/media/${c.driveFileId}` : ""),
    }));

    return NextResponse.json(publicCauses);
  } catch (error: any) {
    console.error("[API/Causes] Error retrieving causes:", error);
    // Return fallback defaults so public site never breaks
    return NextResponse.json(DEFAULT_CAUSES);
  }
}

export async function POST(request: NextRequest) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json({ error: "Cause title is required." }, { status: 400 });
    }

    const causeId = body.id || `CAUSE-${Date.now().toString(36).toUpperCase()}`;
    const newCause = {
      id: causeId,
      title: body.title,
      category: body.category || "General",
      targetAmount: Number(body.targetAmount) || 500000,
      raisedAmount: Number(body.raisedAmount) || 0,
      location: body.location || "National",
      description: body.description || "",
      status: (body.status || "Active") as any,
      imageUrl: body.imageUrl || "",
      driveFileId: body.driveFileId || "",
      createdAt: body.createdAt || new Date().toISOString(),
    };

    await causeRepository.save(newCause);
    realtimeBroadcaster.broadcast(RealtimeEvent.CAUSE_UPDATED, { id: causeId });
    return NextResponse.json({ success: true, cause: newCause });
  } catch (error: any) {
    console.error("[API/Causes] Error saving cause:", error);
    return NextResponse.json({ error: "Failed to persist cause." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
