import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { resolveAudience } from "@/lib/communications/audience";
import { issueApproval } from "@/lib/communications/approval";
import { TYPE_RULES, isCommunicationType } from "@/lib/communication-resolver";
import { inspectMedia, mediaFingerprints, MediaError, directBudgetBytes } from "@/lib/communications/attachments";

export const dynamic = "force-dynamic";

/**
 * Review step. Recomputes the audience on the server, returns the exact recipients, the exclusions with reasons and
 * warnings, and issues a signed approval bound to THIS message and THIS recipient set. Nothing is sent here.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const { causeIds, type, heading, notes, includePreviouslySent, includeUnresolved, retryBroadcastId } = body;
    const media: string[] = Array.isArray(body.media) ? body.media.map(String) : [];
    if (!heading || !notes || typeof notes !== "string") {
      return NextResponse.json({ success: false, error: "Heading and message are required." }, { status: 400 });
    }
    if (!Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one cause." }, { status: 400 });
    }
    const commType = type || "general_communication";
    if (!isCommunicationType(commType)) {
      return NextResponse.json({ success: false, error: `Unknown communication type "${commType}".` }, { status: 400 });
    }

    let items: Awaited<ReturnType<typeof inspectMedia>> = [];
    try {
      items = await inspectMedia(media);
    } catch (err: any) {
      if (err instanceof MediaError) return NextResponse.json({ success: false, error: err.message, code: "ATTACHMENT_INVALID" }, { status: 422 });
      throw err;
    }

    const audience = await resolveAudience({ causeIds, type: commType, includePreviouslySent: Boolean(includePreviouslySent), includeUnresolved: Boolean(includeUnresolved), retryBroadcastId });
    if (!audience.ok) return NextResponse.json({ success: false, error: audience.error }, { status: audience.status || 400 });

    const recipientIds = audience.recipients.map((r) => r.id);
    const warnings: string[] = [];
    if (recipientIds.length === 0) warnings.push("No eligible recipients. Nothing will be sent; the audience is never widened automatically.");
    const failed = audience.recipients.filter((r) => r.previouslyFailed).length;
    if (failed) warnings.push(`${failed} recipient(s) failed in an earlier attempt and will be tried again.`);
    if (includeUnresolved) warnings.push("Recipients with an unknown earlier outcome are included; they may receive a duplicate.");

    const linked = items.filter((i) => i.delivery === "link");
    if (linked.length) warnings.push(`${linked.length} file(s) exceed the ${directBudgetBytes() / 1048576} MB e-mail attachment budget and will be sent as personal secure links (valid for ${Number(process.env.ATTACHMENT_LINK_TTL_DAYS) || 30} days): ${linked.map((i) => i.name).join(", ")}.`);

    const approval = recipientIds.length ? issueApproval(admin.email, { type: commType, causeIds, heading, notes, media, recipientIds, mediaFingerprints: mediaFingerprints(items) }) : null;

    return NextResponse.json(
      {
        success: true,
        count: recipientIds.length,
        recipients: audience.recipients,
        excluded: audience.excluded,
        causeNames: audience.causeNames,
        rule: TYPE_RULES[commType],
        stats: audience.stats,
        warnings,
        attachments: items.map((i) => ({ name: i.name, sizeBytes: i.size, delivery: i.kind === "external" ? "public-link" : i.delivery === "attach" ? "attached" : "secure-link" })),
        approvalToken: approval?.token ?? null,
        approvalExpiresAt: approval?.expiresAt ?? null,
        // What the recipients will be told, so the reviewer sees the facts being used.
        preview: { subject: `${heading} — Daarayn Foundation`, purpose: commType, causes: audience.causeNames, body: notes },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[Approve] failed:", error?.message);
    return NextResponse.json({ success: false, error: "Could not read donor records from Google Sheets, so the audience cannot be determined. Nothing was approved." }, { status: 503 });
  }
}
