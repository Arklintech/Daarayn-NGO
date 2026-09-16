import { NextResponse } from "next/server";
import { fieldAgentRepository } from "@/lib/repositories/fieldAgentRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { notificationRepository } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export async function GET() {
  try {
    const agents = await fieldAgentRepository.getAll();
    return NextResponse.json({ success: true, agents });
  } catch (error: any) {
    console.error("[API/FieldAgents] Failed to retrieve agents:", error);
    return NextResponse.json({ success: false, error: "Failed to retrieve field agents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
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
      assignedSupervisor,
      status,
      password,
      requirePasswordChange,
      permissions,
      adminId,
    } = body;

    // 1. Create Firebase Auth Account via REST API
    // (Firebase Auth is the credential authority - NO passwords in Google Sheets)
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable.");
    }

    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: false }),
      }
    );

    const authData = await authRes.json();
    if (!authRes.ok) {
      throw new Error(authData.error?.message || "Failed to create Firebase Auth user.");
    }
    const firebaseUid = authData.localId;

    // 2. Generate Authoritative Field Agent ID
    const existingAgents = await fieldAgentRepository.getAll();
    const nextIdx = existingAgents.length + 1;
    const newId = `FA${String(nextIdx).padStart(3, "0")}`;

    const nowIso = new Date().toISOString();

    // 3. Construct Operational Profile (Strictly NO rawPassword)
    const newAgent = {
      id: newId,
      firebaseUid,
      name,
      email,
      phone: phone || "",
      country: country || "India",
      state: state || "",
      district: district || "",
      city: city || "",
      address: address || "",
      role: role || "field_agent",
      region: region || "",
      status: status || "active",
      assignedSupervisor: assignedSupervisor || "",
      avatarUrl: "",
      joinDate: nowIso,
      requirePasswordChange: requirePasswordChange ?? true,
      permissions: permissions || [
        "submitReports",
        "uploadEvidence",
        "viewOwnReports",
        "replyConversations",
        "receiveNotifications",
      ],
      stats: {
        reportsSubmitted: 0,
        tasksCompleted: 0,
        activeCases: 0,
        hoursLogged: 0,
      },
    };

    // 4. Save to Authoritative Google Sheets
    await fieldAgentRepository.save(newAgent);

    // 5. Broadcast Realtime SSE Event
    realtimeBroadcaster.broadcast("FIELD_AGENT_CREATED", newAgent);

    // 6. Persist Welcome Notification
    const notifId = `NOTIF-${Date.now()}`;
    await notificationRepository.save({
      id: notifId,
      recipientType: "FieldAgent",
      recipientId: newId,
      type: "SYSTEM",
      title: "Welcome to Daarayn Field Operations",
      message: "Your agent portal is ready. Please ensure your profile is up to date.",
      read: false,
      relatedEntityId: newId,
      createdAt: nowIso,
    });

    // 7. Persist Audit Event in Google Sheets
    const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await auditLogRepository.save({
      id: auditId,
      actor_id: adminId || "admin",
      actor_role: "admin",
      action: "CREATE_FIELD_AGENT",
      entity_type: "Field_Agent",
      entity_id: newId,
      before_state: null,
      after_state: { name, email, role, region },
      timestamp: nowIso,
      source: "admin_portal",
    });

    // 8. Temporary Dual-Write to Firestore Mirror with 1.5s timeout
    try {
      const mirrorDoc = {
        ...newAgent,
        migratedToSheets: true,
      };
      const writePromise = setDoc(doc(db, "field_agents", newId), mirrorDoc, { merge: true });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timed out")), 1500)
      );
      await Promise.race([writePromise, timeout]);
    } catch (e: any) {
      console.warn("[API/FieldAgents] Firestore dual-write skipped/timed out:", e.message);
    }

    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    console.error("[API/FieldAgents] Error creating field agent:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { agentId, email, requirePasswordChange, ...otherUpdates } = body;

    if (!agentId) {
      return NextResponse.json({ success: false, error: "Agent ID is required." }, { status: 400 });
    }

    const agent = await fieldAgentRepository.getById(agentId);
    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const updated = {
      ...agent,
      ...otherUpdates,
      ...(requirePasswordChange !== undefined ? { requirePasswordChange } : {}),
    };

    // 1. Authoritative Save to Google Sheets
    await fieldAgentRepository.save(updated);

    // 2. Realtime SSE Broadcast
    realtimeBroadcaster.broadcast("FIELD_AGENT_UPDATED", updated);

    // 3. Send Firebase Auth Password Reset Email if requested
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (apiKey && email) {
      try {
        await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
          }
        );
      } catch (oobErr) {
        console.warn("[API/FieldAgents] OOB password reset notice:", oobErr);
      }
    }

    // 4. Temporary Dual-Write to Firestore Mirror with timeout
    try {
      const mirrorWrite = setDoc(doc(db, "field_agents", agentId), updated, { merge: true });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write timed out")), 1500)
      );
      await Promise.race([mirrorWrite, timeout]);
    } catch (e: any) {
      console.warn("[API/FieldAgents] Firestore mirror skipped:", e.message);
    }

    return NextResponse.json({
      success: true,
      message: "Agent credentials and profile updated successfully.",
      agent: updated,
    });
  } catch (error: any) {
    console.error("[API/FieldAgents] Error updating agent:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
