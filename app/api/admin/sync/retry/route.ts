import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  // This endpoint previously triggered retries for failed Firestore sync tasks.
  // With the migration to Google Sheets and event-driven architecture:
  //
  // - All data is persisted directly to Google Sheets
  // - Real-time events are delivered via SSE with built-in reconnection and recovery
  // - Failed delivery is automatically retried with exponential backoff
  // - Event log in Google Sheets provides persistence across instance restarts
  //
  // No manual retry triggers are needed.

  return NextResponse.json({
    status: "deprecated",
    message: "Manual retry triggers are no longer needed. Failed events are automatically retried with exponential backoff.",
    automaticRetry: {
      mechanism: "SSE reconnection with exponential backoff (2-30 seconds)",
      persistence: "Event log in Google Sheets allows recovery of missed events on reconnection",
      documentation: "See lib/realtime/client.ts for reconnect logic"
    }
  }, { status: 410 }); // 410 Gone
}
