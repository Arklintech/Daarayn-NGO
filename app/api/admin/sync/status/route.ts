import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { GoogleSheetsClient } from "@/lib/sync/GoogleSheetsClient";

export async function GET(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const sheetsClient = new GoogleSheetsClient();
    const isGoogleSheetsConfigured = sheetsClient.isConfigured();

    // All operational data now flows through Google Sheets.
    // Real-time synchronization is handled by SSE event delivery from lib/realtime/broadcaster.ts
    // No separate Firestore sync queue is needed.

    return NextResponse.json({
      status: "operational",
      googleSheetsStatus: isGoogleSheetsConfigured ? "Connected" : "Disconnected",
      architecture: {
        authentication: "Firebase Auth",
        operationalDatabase: "Google Sheets",
        fileStorage: "Google Drive",
        email: "Gmail SMTP",
        realtimeEvents: "SSE",
      },
      realtimeSync: {
        enabled: true,
        mechanism: "Server-Sent Events (SSE) with persistent event log in Google Sheets",
        documentation: "lib/realtime/ for event system and lib/donations/snapshot.ts for consistent reads",
      },
      note: "Operational Firestore has been fully migrated to Google Sheets. All data now uses Sheets as the single source of truth.",
    });
  } catch (error: any) {
    console.error("Failed to get sync status", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
