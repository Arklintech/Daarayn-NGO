import { NextRequest, NextResponse } from "next/server";
import { broadcastStore } from "@/lib/broadcast-store";
import { communicationRepository } from "@/lib/repositories/communicationRepository";

export async function GET(req: NextRequest) {
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
    const found = comms.find(c => c.id === broadcastId);
    if (found) {
      return NextResponse.json({
        success: true,
        broadcast: {
          id: found.id,
          status: found.status,
          stats: {
            sent: found.sentCount || 0,
            failed: found.failedCount || 0,
            remaining: Math.max(0, (found.recipientCount || 0) - (found.sentCount || 0) - (found.failedCount || 0))
          },
          totalRecipients: found.recipientCount,
          completedAt: found.completedAt
        }
      });
    }
  } catch (err: any) {
    console.warn("[BroadcastStatus] Error querying sheets:", err.message);
  }

  return NextResponse.json({
    success: false,
    error: "Broadcast not found"
  }, { status: 404 });
}
