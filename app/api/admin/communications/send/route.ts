import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { isCommunicationType, scopeKeyFor, type CommunicationType } from "@/lib/communication-resolver";
import { resolveAudience } from "@/lib/communications/audience";
import { verifyApproval } from "@/lib/communications/approval";
import { dedupeRecipients, processBroadcast } from "@/lib/broadcast-worker";
import { broadcastStore } from "@/lib/broadcast-store";
import { verifyEmailProvider } from "@/lib/email/providerManager";
import { getSiteUrl } from "@/lib/email/deliverability";
import { communicationRecipientRepository } from "@/lib/repositories/communicationRecipientRepository";

// The broadcast is sent inside this request. Work scheduled after the response
// (waitUntil) was being frozen by the platform before any email went out.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Leave headroom under maxDuration to save the result and respond
const SEND_BUDGET_MS = 250_000;

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

const EYEBROWS: Record<CommunicationType, { eyebrow: string; dua: { arabic: string; english: string } }> = {
  contribution_confirmation: {
    eyebrow: "CONTRIBUTION CONFIRMED",
    dua: { arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ", english: "Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing." },
  },
  project_progress: {
    eyebrow: "PROJECT PROGRESS UPDATE",
    dua: { arabic: "رَبِّ زِدْنِي عِلْمًا", english: "My Lord, increase me in knowledge." },
  },
  allocation_confirmation: {
    eyebrow: "FUNDS ALLOCATED",
    dua: { arabic: "اللَّهُمَّ بَارِكْ لَهُمْ فِيمَا رَزَقْتَهُمْ", english: "O Allah, bless them in what You have provided them." },
  },
  completion_report: {
    eyebrow: "COMPLETION & IMPACT REPORT",
    dua: { arabic: "الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ", english: "All praise is to Allah by whose grace good deeds are completed." },
  },
  general_communication: {
    eyebrow: "OFFICIAL COMMUNICATION",
    dua: { arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", english: "Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire." },
  },
};

export async function POST(req: Request) {
  const adminAuth = await requireAdmin(req);
  if (adminAuth instanceof NextResponse) return adminAuth;

  const requestStartedAt = Date.now();

  try {
    const body = await req.json();
    const { causeIds, type, heading, notes, recipientIds, approvalToken, includePreviouslySent, includeUnresolved, retryBroadcastId } = body;
    const media: string[] = Array.isArray(body.media) ? body.media.map(String) : [];

    if (!heading || !notes || typeof notes !== "string") {
      return NextResponse.json({ success: false, error: "Heading and message are required." }, { status: 400 });
    }
    if (!causeIds || !Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one cause before sending." }, { status: 400 });
    }
    const requestedType = type || "general_communication";
    if (!isCommunicationType(requestedType)) {
      return NextResponse.json({ success: false, error: `Unknown communication type "${requestedType}".` }, { status: 400 });
    }
    const commType: CommunicationType = requestedType;
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ success: false, error: "Approve the recipient list before sending (recipientIds is required)." }, { status: 400 });
    }

    // Approval is bound to THIS content and THIS recipient set.
    const approval = verifyApproval(approvalToken, adminAuth.email, { type: commType, causeIds, heading, notes, media, recipientIds });
    if (!approval.ok) return NextResponse.json({ success: false, error: approval.reason, code: "APPROVAL_REQUIRED" }, { status: 403 });

    // Fail fast on bad credentials instead of reporting every donor as failed
    const providerCheck = await verifyEmailProvider();
    if (!providerCheck.ok) {
      return NextResponse.json({ success: false, error: `Email provider "${providerCheck.provider}" is not ready: ${providerCheck.error}` }, { status: 503 });
    }

    // The audience is recomputed server-side now; every approved recipient must STILL be eligible.
    const audience = await resolveAudience({ causeIds, type: commType, includePreviouslySent: Boolean(includePreviouslySent), includeUnresolved: Boolean(includeUnresolved), retryBroadcastId });
    if (!audience.ok) return NextResponse.json({ success: false, error: audience.error }, { status: audience.status || 400 });
    const eligible = new Map(audience.recipients.map((r) => [r.id, r]));
    const notEligible = recipientIds.filter((id: string) => !eligible.has(id));
    if (notEligible.length > 0) {
      return NextResponse.json({ success: false, error: "The eligible recipients changed since approval. Review and approve again.", notEligible }, { status: 409 });
    }
    const chosen = [...new Set<string>(recipientIds)].map((id) => eligible.get(id)!);
    const recipients = dedupeRecipients(chosen);
    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: `No eligible recipients found for ${audience.causeNames.join(", ")} (${commType}).` }, { status: 400 });
    }

    const causeName = audience.causeNames.join(", ");
    const { eyebrow, dua } = EYEBROWS[commType];

    // Admin-typed text is escaped BEFORE the limited **bold** markup is applied, so it cannot inject HTML.
    const formattedNotes = escapeHtml(notes).split("\n\n").map((p: string) => p.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong style='color:#F2EEE3;'>$1</strong>"));
    let projectUpdateHtml = formattedNotes.join("<br><br>");
    if (media.length > 0) {
      projectUpdateHtml += '<br><br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:20px 0;"><strong style="color:#D4AF37; font-family:Georgia, serif; font-size:14px;">Attached Documents & Media:</strong><ul style="margin:10px 0 0; padding-left:20px; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">';
      media.forEach((url: string, idx: number) => {
        const href = /^https?:\/\//i.test(url) ? url : `${getSiteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
        const filename = url.split("/").pop()?.split("?")[0] || `document-${idx + 1}`;
        projectUpdateHtml += `<li><a href="${escapeHtml(href)}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${escapeHtml(filename)}</a></li>`;
      });
      projectUpdateHtml += "</ul>";
    }

    const broadcastId = `BCAST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = new Date().toISOString();
    const scopeKey = scopeKeyFor(causeIds);

    broadcastStore.set(broadcastId, {
      id: broadcastId,
      createdBy: adminAuth.email,
      createdAt,
      communicationType: commType,
      selectedCauseIds: causeIds,
      causeName,
      totalRecipients: recipients.length,
      status: "Queued" as const,
      stats: { sent: 0, failed: 0, unresolved: 0, remaining: recipients.length },
      startedAt: null,
      completedAt: null,
      processingDurationMs: 0,
    });

    // Persist the approved list as "queued" history BEFORE any email is attempted. If this fails nothing is sent.
    let rows: Awaited<ReturnType<typeof communicationRecipientRepository.createQueued>>;
    try {
      rows = await communicationRecipientRepository.createQueued(
        recipients.map((r) => {
          const e = eligible.get(r.id as string)!;
          return {
            id: `${broadcastId}:${r.id}`,
            broadcastId,
            communicationType: commType,
            scopeKey,
            donorId: r.id || "",
            donorName: r.name,
            email: r.email,
            donationIds: e.donationIds.join(","),
            status: "queued" as const,
            attempts: 0,
            lastError: "",
            providerMessageId: "",
            eligibility: JSON.stringify({ causeIds: e.causeIds, donationIds: e.donationIds }),
            approvedBy: adminAuth.email,
            contentHash: approval.hash,
            createdAt,
            updatedAt: createdAt,
          };
        })
      );
    } catch (err: any) {
      console.error("[Communications/Send] Could not record queued recipients; nothing was sent:", err?.message);
      return NextResponse.json({ success: false, error: "Could not record the recipient history in Google Sheets, so nothing was sent." }, { status: 503 });
    }

    const broadcast = await processBroadcast(
      broadcastId,
      recipients,
      { heading, eyebrow, dua, projectUpdateHtml, mediaUrls: media, causeName, stats: audience.stats, createdAt },
      { deadline: requestStartedAt + SEND_BUDGET_MS, rows }
    );

    const sent = broadcast?.stats.sent ?? 0;
    const unresolved = broadcast?.stats.unresolved ?? 0;
    const response = NextResponse.json({
      success: sent > 0 || unresolved > 0,
      broadcastId,
      total: recipients.length,
      broadcast,
      ...(sent === 0 && unresolved === 0 && { error: broadcast?.failureReason || "No emails could be delivered." }),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error: any) {
    console.error("Communication dispatch setup failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
