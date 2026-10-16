import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { broadcastStore } from "@/lib/broadcast-store";
import { communicationRepository } from "@/lib/repositories/communicationRepository";

export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  const { searchParams } = new URL(req.url);
  const broadcastId = searchParams.get("id");

  if (!broadcastId) {
    return NextResponse.json({ success: false, error: "Missing broadcast id" }, { status: 400 });
  }

  // 1. Check live in-memory store
  const live = broadcastStore.get(broadcastId);
  if (live) {
    return NextResponse.json({
      success: true,
      broadcast: live
    });
  }

  // 2. Check Google Sheets communications repository
  try {
    const comms = await communicationRepository.getAll();
    if (Array.isArray(comms)) {
      const found = comms.find(c => c.id === broadcastId);
      if (found) {
        return NextResponse.json({
          success: true,
          broadcast: {
            id: found.id,
            status: found.status || "Unknown",
            communicationType: found.type || "general_communication",
            causeName: (Array.isArray(found.selectedCauses) ? found.selectedCauses : []).join(", ") || "Unknown",
            stats: {
              sent: Number(found.sentCount || 0),
              failed: Number(found.failedCount || 0),
              remaining: Math.max(0, Number(found.recipientCount || 0) - Number(found.sentCount || 0) - Number(found.failedCount || 0))
            },
            totalRecipients: Number(found.recipientCount || 0),
            startedAt: found.createdAt,
            completedAt: found.completedAt,
            processingDurationMs: 0,
            errors: found.errorSummary ? [{ reason: found.errorSummary, count: 1 }] : []
          }
        });
      }
    }
  } catch (err: any) {
    console.warn("[BroadcastStatus] Error querying sheets:", err.message);
    // Return empty response rather than erroring
    return NextResponse.json({
      success: false,
      error: "Failed to retrieve broadcast details"
    }, { status: 404 });
  }

  return NextResponse.json({
    success: false,
    error: "Broadcast not found"
  }, { status: 404 });
}
