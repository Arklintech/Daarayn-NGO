/**
 * lib/server/auth.ts
 *
 * Server-side authorization for admin and field-agent API routes.
 *
 * The browser sends its Firebase ID token either as an
 * `Authorization: Bearer <token>` header or in the `daarayn_token` cookie
 * (kept fresh by lib/AuthContext.tsx). The token signature is verified with
 * firebase-admin, which only needs the project ID for this.
 *
 *   - Admins:       verified email listed in ADMIN_EMAILS (comma-separated)
 *   - Field agents: verified account with an active row in the Field_Agents sheet
 */

import { NextResponse } from "next/server";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { fieldAgentRepository, type FieldAgentEntity } from "@/lib/repositories/fieldAgentRepository";

export const AUTH_COOKIE = "daarayn_token";

export interface AdminPrincipal {
  kind: "admin";
  uid: string;
  email: string;
}

export interface AgentPrincipal {
  kind: "agent";
  uid: string;
  email: string;
  agent: FieldAgentEntity;
}

export type Principal = AdminPrincipal | AgentPrincipal;

function getAdminAuth() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "daaraynorg-9165c";
  const app = getApps().find((a) => a.name === "daarayn-auth") || initializeApp({ projectId }, "daarayn-auth");
  return getAuth(app);
}

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function readToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || null;
  }
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AUTH_COOKIE) return decodeURIComponent(rest.join("=")) || null;
  }
  return null;
}

async function verifyRequest(request: Request): Promise<DecodedIdToken | null> {
  const token = readToken(request);
  if (!token) return null;
  try {
    return await getAdminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

const unauthorized = () =>
  NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

const forbidden = (message = "You do not have access to this resource.") =>
  NextResponse.json({ success: false, error: message }, { status: 403 });

function asAdmin(decoded: DecodedIdToken): AdminPrincipal | null {
  const email = (decoded.email || "").toLowerCase();
  if (!email || !getAdminEmails().includes(email)) return null;
  return { kind: "admin", uid: decoded.uid, email };
}

async function asAgent(decoded: DecodedIdToken): Promise<AgentPrincipal | null> {
  const email = (decoded.email || "").toLowerCase();
  const agent =
    (await fieldAgentRepository.getByFirebaseUid(decoded.uid)) ||
    (email ? await fieldAgentRepository.getByEmail(email) : null);
  if (!agent) return null;
  if (agent.status.toLowerCase() !== "active") return null;
  return { kind: "agent", uid: decoded.uid, email, agent };
}

/** Allows only allow-listed admins. Returns a response to send back on failure. */
export async function requireAdmin(request: Request): Promise<AdminPrincipal | NextResponse> {
  const decoded = await verifyRequest(request);
  if (!decoded) return unauthorized();
  if (getAdminEmails().length === 0) {
    console.error("[Auth] ADMIN_EMAILS is not configured — all admin access is denied.");
    return forbidden("Admin access is not configured on the server (ADMIN_EMAILS).");
  }
  return asAdmin(decoded) || forbidden();
}

/** Allows only active field agents. */
export async function requireAgent(request: Request): Promise<AgentPrincipal | NextResponse> {
  const decoded = await verifyRequest(request);
  if (!decoded) return unauthorized();
  return (await asAgent(decoded)) || forbidden("No active field agent profile for this account.");
}

/** Allows admins and active field agents; callers scope data by `principal.kind`. */
export async function requireAdminOrAgent(request: Request): Promise<Principal | NextResponse> {
  const decoded = await verifyRequest(request);
  if (!decoded) return unauthorized();
  return asAdmin(decoded) || (await asAgent(decoded)) || forbidden();
}
