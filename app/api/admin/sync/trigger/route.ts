import { NextResponse } from "next/server";
import { SyncEngine } from "@/lib/sync/SyncEngine";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId } = body;
    if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

    const taskSnap = await getDoc(doc(db, "sync_queue", taskId));
    if (!taskSnap.exists()) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    
    const task = taskSnap.data();
    
    // Fire and forget, don't await so the client response is immediate
    SyncEngine.executeSyncTask(taskId, task as any).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
