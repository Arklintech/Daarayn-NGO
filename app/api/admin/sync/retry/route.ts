import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { SyncEngine } from "@/lib/sync/SyncEngine";

export async function POST(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

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
