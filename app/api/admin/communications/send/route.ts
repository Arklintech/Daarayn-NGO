import { requireAdmin } from "@/lib/server/auth";
import { NextResponse } from "next/server";
import { resolveRecipients, isCommunicationType, scopeKeyFor, type CommunicationType } from "@/lib/communication-resolver";
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
    const { causeIds, type, heading, notes, media, recipientIds, includePreviouslySent, retryBroadcastId } = body;

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

    // Explicit administrator approval: the exact list that was previewed.
    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ success: false, error: "Approve the recipient list before sending (recipientIds is required)." }, { status: 400 });
    }

    // Fail fast on bad credentials instead of reporting every donor as failed
    const providerCheck = await verifyEmailProvider();
    if (!providerCheck.ok) {
      return NextResponse.json({
        success: false,
        error: `Email provider "${providerCheck.provider}" is not ready: ${providerCheck.error}`,
      }, { status: 503 });
    }

    const scopeKey = scopeKeyFor(causeIds);
    let uniqueDonors: any[] = [];
    let stats = { raised: 0, goalAmount: 0, percentage: 0 };
    let causeNames: string[] = [];

    if (retryBroadcastId) {
      // Retry sends only to recipients of that broadcast whose send failed or never finished,
      // and never to anyone who has since had the same message accepted.
      const history = (await communicationRecipientRepository.readFresh()).map((h) => h.entity);
      uniqueDonors = history
        .filter((h) => h.broadcastId === retryBroadcastId && h.status !== "smtp_accepted" && recipientIds.includes(h.donorId))
        .filter((h) => !history.some((o) => o.donorId === h.donorId && o.communicationType === h.communicationType && o.scopeKey === h.scopeKey && o.status === "smtp_accepted"))
        .map((h) => ({ id: h.donorId, name: h.donorName, email: h.email, donationIds: h.donationIds ? h.donationIds.split(",") : [] }));
      causeNames = [String(body.causeName || "Selected causes")];
      if (uniqueDonors.length === 0) {
        return NextResponse.json({ success: false, error: "No failed recipients remain to retry for this broadcast." }, { status: 409 });
      }
    } else {
      // Recipients are decided on the server from fresh records and must match what was approved.
      const resolution = await resolveRecipients(causeIds, commType, { includePreviouslySent: Boolean(includePreviouslySent) });
      if (!resolution.ok) {
        return NextResponse.json({ success: false, error: resolution.error }, { status: 400 });
      }
      const eligibleIds = new Set(resolution.recipients.map((r) => r.id));
      const notEligible = recipientIds.filter((id: string) => !eligibleIds.has(id));
      if (notEligible.length > 0) {
        return NextResponse.json({
          success: false,
          error: "The recipient list changed since it was previewed. Preview again before sending.",
          notEligible,
        }, { status: 409 });
      }
      uniqueDonors = resolution.recipients.filter((r) => recipientIds.includes(r.id));
      stats = resolution.stats;
      causeNames = resolution.causeNames;
    }

    const recipients = dedupeRecipients(uniqueDonors);
    if (recipients.length === 0) {
      return NextResponse.json({ success: false, error: `No eligible recipients found for ${causeNames.join(", ")} (${commType}).` }, { status: 400 });
    }

    const causeName = causeNames.join(", ");
    const { eyebrow, dua } = EYEBROWS[commType];

    const formattedNotes = notes.split('\n\n').map((p: string) =>
      p.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong style='color:#F2EEE3;'>$1</strong>")
    );

    let projectUpdateHtml = formattedNotes.join('<br><br>');
    if (media && Array.isArray(media) && media.length > 0) {
      projectUpdateHtml += '<br><br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:20px 0;"><strong style="color:#D4AF37; font-family:Georgia, serif; font-size:14px;">Attached Documents & Media:</strong><ul style="margin:10px 0 0; padding-left:20px; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">';
      media.forEach((url: string, idx: number) => {
        // Links inside an email must be absolute; uploads are stored as /api/media/<id>
        const href = /^https?:\/\//i.test(url) ? url : `${getSiteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
        const filename = url.split("/").pop()?.split("?")[0] || `document-${idx + 1}`;
        projectUpdateHtml += `<li><a href="${href}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${filename}</a></li>`;
      });
      projectUpdateHtml += '</ul>';
    }

    const broadcastId = `BCAST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = new Date().toISOString();

    const broadcastRecord = {
      id: broadcastId,
      createdBy: adminAuth.email,
      createdAt,
      communicationType: commType,
      selectedCauseIds: causeIds,
      causeName,
      totalRecipients: recipients.length,
      status: "Queued" as const,
      stats: { sent: 0, failed: 0, remaining: recipients.length },
      startedAt: null,
      completedAt: null,
      processingDurationMs: 0
    };
    broadcastStore.set(broadcastId, broadcastRecord);

    // Persist the approved list as "queued" history BEFORE any email is attempted.
    // If this fails nothing is sent, so history can never be missing for a sent email.
    let rows: Awaited<ReturnType<typeof communicationRecipientRepository.createQueued>>;
    try {
      rows = await communicationRecipientRepository.createQueued(
        recipients.map((r) => ({
          id: `${broadcastId}:${r.id}`,
          broadcastId,
          communicationType: commType,
          scopeKey,
          donorId: r.id || "",
          donorName: r.name,
          email: r.email,
          donationIds: ((uniqueDonors.find((u) => u.id === r.id)?.donationIds as string[] | undefined) || []).join(","),
          status: "queued" as const,
          attempts: 0,
          lastError: "",
          providerMessageId: "",
          createdAt,
          updatedAt: createdAt,
        }))
      );
    } catch (err: any) {
      console.error("[Communications/Send] Could not record queued recipients; nothing was sent:", err?.message);
      return NextResponse.json({ success: false, error: "Could not record the recipient history in Google Sheets, so nothing was sent." }, { status: 503 });
    }

    const payload = {
      heading,
      eyebrow,
      dua,
      projectUpdateHtml,
      mediaUrls: media || [],
      causeName,
      stats,
      createdAt
    };

    const broadcast = await processBroadcast(broadcastId, recipients, payload, {
      deadline: requestStartedAt + SEND_BUDGET_MS,
      rows,
    });

    const sent = broadcast?.stats.sent ?? 0;
    const response = NextResponse.json({
      success: sent > 0,
      broadcastId,
      total: recipients.length,
      broadcast,
      ...(sent === 0 && { error: broadcast?.failureReason || "No emails could be delivered." }),
    });
    // A send result must never be served from a cache.
    response.headers.set('Cache-Control', 'no-store');
    return response;

  } catch (error: any) {
    console.error("Communication dispatch setup failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
