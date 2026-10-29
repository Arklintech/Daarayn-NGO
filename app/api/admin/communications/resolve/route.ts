import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { resolveRecipients, TYPE_RULES, isCommunicationType } from "@/lib/communication-resolver";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Sheets/Drive/SMTP calls can outlast the platform default

/**
 * Preview: the exact recipients (and the excluded donors with reasons) for the
 * selected cause(s) and communication type. Nothing is sent from here.
 */
export async function POST(req: Request) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const { causeIds, type, includePreviouslySent } = await req.json();

    if (!causeIds || !Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Missing selected causes." }, { status: 400 });
    }
    const commType = type || "general_communication";
    if (!isCommunicationType(commType)) {
      return NextResponse.json({ success: false, error: `Unknown communication type "${commType}".` }, { status: 400 });
    }

    const resolution = await resolveRecipients(causeIds, commType, { includePreviouslySent: Boolean(includePreviouslySent) });
    if (!resolution.ok) {
      return NextResponse.json({ success: false, error: resolution.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        count: resolution.recipients.length,
        recipients: resolution.recipients,
        excluded: resolution.excluded,
        causeNames: resolution.causeNames,
        rule: TYPE_RULES[commType],
        stats: resolution.stats,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[Resolve] Failed to resolve recipients:", error?.message);
    // Recipients cannot be established without Sheets: fail safely, never guess.
    return NextResponse.json(
      { success: false, error: "Could not read donor records from Google Sheets, so recipients cannot be determined. Nothing was selected.", code: "RESOLUTION_ERROR" },
      { status: 503 }
    );
  }
}
