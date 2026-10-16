import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  // This endpoint previously triggered Firestore sync_queue tasks.
  // The sync queue has been migrated to Google Sheets and replaced with
  // event-driven architecture via SSE (Server-Sent Events).
  //
  // All operational data is now persisted directly to Google Sheets.
  // Real-time synchronization across devices/instances is handled by:
  // - lib/realtime/broadcaster.ts (publishes events to SSE)
  // - lib/realtime/eventLog.ts (persistent event log in Sheets)
  // - lib/realtime/client.ts (browser-side SSE listener)
  //
  // Manual sync triggers are no longer needed.

  return NextResponse.json({
    status: "deprecated",
    message: "Manual sync triggers are no longer needed. All data is persisted to Google Sheets and synchronized via SSE events.",
    architecture: "Event-driven with persistent event log in Google Sheets",
    documentation: "See lib/realtime/ for the real-time event system"
  }, { status: 410 }); // 410 Gone
}
