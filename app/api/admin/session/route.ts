import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";

/** Confirms whether the signed-in account is an allow-listed administrator. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ success: true, admin: { email: admin.email } });
}

export const dynamic = "force-dynamic";
