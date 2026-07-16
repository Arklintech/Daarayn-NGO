import { NextResponse } from "next/server";
import { SyncEngine } from "@/lib/sync/SyncEngine";

export async function POST() {
  try {
    const retriedCount = await SyncEngine.retryFailedTasks();

    return NextResponse.json({
      message: `Successfully triggered retry for ${retriedCount} failed tasks.`,
      retriedCount
    });
  } catch (error: any) {
    console.error("Failed to retry tasks", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
