import { requireAdmin } from "@/lib/server/auth";
import { NextRequest, NextResponse } from "next/server";
import { allocationRepository } from "@/lib/repositories/allocationRepository";
import { createAllocation, reverseAllocation, AllocationError } from "@/lib/services/allocationService";
import { runWithPriority } from "@/lib/google/requestControl";

export const dynamic = "force-dynamic";
/** The lease for serialised allocation processing (75 s by default) must outlive the function: Vercel kills it at this limit, so a stale worker cannot outlive its lease. */
export const maxDuration = 60;

const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
const EVIDENCE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const donationId = request.nextUrl.searchParams.get("donationId");
    const all = await allocationRepository.getAll(true);
    const list = donationId ? all.filter((a) => a.donationId === donationId) : all;
    return NextResponse.json({ success: true, allocations: list }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[Allocations] read failed:", error?.message);
    return NextResponse.json({ success: false, error: "Allocations could not be read from Google Sheets." }, { status: 503 });
  }
}

/** Creates an allocation (JSON, or multipart with an optional evidence file). */
async function POST_handler(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    let fields: Record<string, any>;
    let evidence: { buffer: Buffer; filename: string; mimeType: string } | undefined;
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const fd = await request.formData();
      fields = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
      const file = fd.get("evidence") as File | null;
      if (file && file.size > 0) {
        if (!EVIDENCE_TYPES.includes(file.type)) return NextResponse.json({ success: false, error: "Evidence must be an image (PNG, JPEG, WebP) or a PDF." }, { status: 400 });
        if (file.size > MAX_EVIDENCE_BYTES) return NextResponse.json({ success: false, error: "Evidence must be 15 MB or smaller." }, { status: 400 });
        evidence = { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name || "evidence", mimeType: file.type };
      }
    } else {
      fields = await request.json();
    }
    const { allocation, duplicate } = await createAllocation({
      donationId: String(fields.donationId || ""),
      causeId: String(fields.causeId || ""),
      amount: Number(fields.amount),
      projectId: fields.projectId ? String(fields.projectId) : undefined,
      notes: fields.notes ? String(fields.notes).slice(0, 1000) : undefined,
      requestKey: fields.requestKey ? String(fields.requestKey) : undefined,
      actorEmail: admin.email,
      evidence,
    });
    return NextResponse.json({ success: true, allocation, duplicate });
  } catch (error: any) {
    if (error instanceof AllocationError) return NextResponse.json({ success: false, error: error.message }, { status: error.httpStatus });
    console.error("[Allocations] create failed:", error);
    return NextResponse.json({ success: false, error: "The allocation could not be recorded." }, { status: 500 });
  }
}

/** Reverses an allocation (kept, never deleted). Body: { id, reason }. */
async function PATCH_handler(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id, reason } = await request.json();
    const allocation = await reverseAllocation(String(id || ""), String(reason || ""), admin.email);
    return NextResponse.json({ success: true, allocation });
  } catch (error: any) {
    if (error instanceof AllocationError) return NextResponse.json({ success: false, error: error.message }, { status: error.httpStatus });
    console.error("[Allocations] reverse failed:", error);
    return NextResponse.json({ success: false, error: "The allocation could not be reversed." }, { status: 500 });
  }
}

/* D29: request priority for the shared Google budget (P0/P1 financial, P3 public catalogue). */
export const POST = (...args: Parameters<typeof POST_handler>) => runWithPriority("P0", () => POST_handler(...args));
export const PATCH = (...args: Parameters<typeof PATCH_handler>) => runWithPriority("P0", () => PATCH_handler(...args));
