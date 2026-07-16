import { NextResponse } from 'next/server';
import { db } from "@/lib/firebase";
import { doc, setDoc, addDoc, collection } from "firebase/firestore";
import { getNextFieldSerial, FieldAgent } from "@/lib/db-field-ops";
import { SyncEngine } from "@/lib/sync/SyncEngine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      name, email, phone, 
      country, state, district, city, address,
      role, region, assignedSupervisor, status,
      password, requirePasswordChange,
      permissions, adminId
    } = body;

    // 1. Create Firebase Auth Account via REST API 
    // (This avoids logging out the current Admin session)
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable.");
    }

    const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      throw new Error(authData.error?.message || "Failed to create Firebase Auth user.");
    }
    const firebaseUid = authData.localId; // The new user's UID

    // 2. Generate FA- ID
    const newId = await getNextFieldSerial("field_agents", "FA");

    // 3. Create Firestore Document
    const newAgent: FieldAgent = {
      id: newId,
      firebaseUid,
      name,
      email,
      phone,
      country,
      state,
      district,
      city,
      address,
      role,
      region,
      status: status || "Active",
      assignedSupervisor: assignedSupervisor || "",
      requirePasswordChange: requirePasswordChange ?? true,
      rawPassword: password, // As requested by Admin for field agent management
      permissions: permissions || {
        submitReports: true,
        uploadEvidence: true,
        viewOwnReports: true,
        replyConversations: true,
        receiveNotifications: true
      },
      joinDate: new Date().toISOString(),
      stats: {
        reportsSubmitted: 0,
        reportsApproved: 0,
        reportsPending: 0,
        reportsRejected: 0
      }
    };

    await setDoc(doc(db, "field_agents", newId), newAgent);

    // 4. Initialize Notification Settings (Welcome Notification)
    const notifId = `NOTIF-${Date.now()}`;
    await setDoc(doc(db, "field_notifications", notifId), {
      id: notifId,
      agentId: newId,
      title: "Welcome to Daarayn Field Operations",
      message: "Your agent portal is ready. Please ensure your profile is up to date.",
      type: "Success",
      isRead: false,
      timestamp: new Date().toISOString()
    });

    // 5. Synchronize to Google Sheets
    try {
      const syncTask = {
        entity: "field_agents",
        entityId: newId,
        operation: "CREATE" as const,
        data: newAgent,
        status: "PENDING" as const,
        syncAttempts: 0,
        createdAt: new Date().toISOString()
      };
      
      const taskId = `sync_${Date.now()}`;
      await setDoc(doc(db, "sync_queue", taskId), syncTask);
      // await SyncEngine.executeSyncTask(taskId, syncTask);
    } catch (syncErr) {
      console.warn("Failed to queue sync task for new agent", syncErr);
    }

    // 6. Create Activity Log
    const actId = `ACT-${Date.now()}`;
    await setDoc(doc(db, "field_activities", actId), {
      id: actId,
      agentId: newId,
      action: "Field Agent Identity Created & Auth Provisioned",
      performedBy: adminId || "System Admin",
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    console.error("Error creating field agent:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
