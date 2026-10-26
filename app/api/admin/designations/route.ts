import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { recordDesignation } from "@/lib/services/designationService";
import { DesignationError } from "@/lib/donations/designations";

export const dynamic = "force-dynamic";

/** Records the monetary split of one donation across its related causes. Body: { donationId, split: [{causeId, amount}] }. */
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const { donationId, split } = await request.json();
    if (!donationId || !Array.isArray(split)) return NextResponse.json({ success: false, error: "donationId and split are required." }, { status: 400 });
    const result = await recordDesignation(String(donationId), split.map((s: any) => ({ causeId: String(s.causeId || ""), amount: Number(s.amount) })), admin.email);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error instanceof DesignationError) return NextResponse.json({ success: false, error: error.message }, { status: error.httpStatus });
    console.error("[Designations] failed:", error);
    return NextResponse.json({ success: false, error: "The designation could not be recorded." }, { status: 500 });
  }
}
