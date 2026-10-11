import { NextResponse } from "next/server";
import { fieldAgentRepository } from "@/lib/repositories/fieldAgentRepository";
import { auditLogRepository } from "@/lib/repositories/auditLogRepository";
import { notificationRepository } from "@/lib/repositories/notificationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { requireAdmin } from "@/lib/server/auth";
import { nextSequentialId } from "@/lib/repositories/ids";

// Profile fields an admin may edit; id, firebaseUid, email and joinDate stay fixed.
const EDITABLE_FIELDS = [
  "name", "phone", "country", "state", "district", "city", "address", "role", "region",
  "status", "assignedSupervisor", "avatarUrl", "requirePasswordChange", "permissions",
] as const;

async function sendPasswordResetEmail(email: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return "Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable.";
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    }
  );
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error?.message || "Firebase rejected the password reset request.";
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return admin;

    const agents = await fieldAgentRepository.getAll();
    return NextResponse.json({ success: true, agents });
  } catch (error: any) {
    console.error("[API/FieldAgents] Failed to retrieve agents:", error);
    return NextResponse.json({ success: false, error: "Failed to retrieve field agents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return admin;

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
    } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: "Name, email and password are required." }, { status: 400 });
    }

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

    // 2. Generate Authoritative Field Agent ID from fresh data
    const existingAgents = await fieldAgentRepository.getAll(true);
    const newId = nextSequentialId("FA", existingAgents.map((a) => a.id));

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
      actor_id: admin.email,
      actor_role: "admin",
      action: "CREATE_FIELD_AGENT",
      entity_type: "Field_Agent",
      entity_id: newId,
      before_state: null,
      after_state: { name, email, role, region },
      timestamp: nowIso,
      source: "admin_portal",
    });

    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    console.error("[API/FieldAgents] Error creating field agent:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (admin instanceof NextResponse) return admin;

    const body = await req.json();
    const { agentId, sendPasswordReset } = body;

    if (!agentId) {
      return NextResponse.json({ success: false, error: "Agent ID is required." }, { status: 400 });
    }

    const agent = await fieldAgentRepository.getById(agentId);
    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    let updated = agent;
    if (Object.keys(updates).length > 0) {
      updated = { ...agent, ...updates };
      // 1. Authoritative Save to Google Sheets
      await fieldAgentRepository.save(updated);
      // 2. Realtime SSE Broadcast
      realtimeBroadcaster.broadcast("FIELD_AGENT_UPDATED", updated);
    }

    // 3. Firebase Auth password reset email, only when explicitly requested
    if (sendPasswordReset) {
      const resetError = await sendPasswordResetEmail(agent.email);
      if (resetError) {
        return NextResponse.json({ success: false, error: `Password reset email failed: ${resetError}` }, { status: 502 });
      }
    }

    return NextResponse.json({
      success: true,
      message: sendPasswordReset ? "Password reset link sent." : "Agent profile updated successfully.",
      agent: updated,
    });
  } catch (error: any) {
    console.error("[API/FieldAgents] Error updating agent:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
