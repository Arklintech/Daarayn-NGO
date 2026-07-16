import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, getCountFromServer } from "firebase/firestore";
import { GoogleSheetsClient } from "@/lib/sync/GoogleSheetsClient";

export async function GET() {
  try {
    const sheetsClient = new GoogleSheetsClient();
    const isGoogleSheetsConfigured = sheetsClient.isConfigured();

    const queueRef = collection(db, "sync_queue");
    
    // Total Tasks
    const totalSnap = await getCountFromServer(queueRef);
    const totalTasks = totalSnap.data().count;

    // Failed Tasks
    const qFailed = query(queueRef, where("status", "==", "FAILED"));
    const failedSnap = await getCountFromServer(qFailed);
    const failedTasks = failedSnap.data().count;

    // Pending Tasks
    const qPending = query(queueRef, where("status", "==", "PENDING"));
    const pendingSnap = await getCountFromServer(qPending);
    const pendingTasks = pendingSnap.data().count;

    // Synced Tasks
    const qSynced = query(queueRef, where("status", "==", "SYNCED"));
    const syncedSnap = await getCountFromServer(qSynced);
    const syncedTasks = syncedSnap.data().count;

    return NextResponse.json({
      firestoreStatus: "Connected",
      googleSheetsStatus: isGoogleSheetsConfigured ? "Connected" : "Disconnected",
      syncStats: {
        total: totalTasks,
        failed: failedTasks,
        pending: pendingTasks,
        synced: syncedTasks
      }
    });
  } catch (error: any) {
    console.error("Failed to get sync status", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
