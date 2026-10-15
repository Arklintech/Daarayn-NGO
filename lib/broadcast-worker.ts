import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { getSiteUrl } from "@/lib/email/deliverability";
import { driveService } from "@/lib/google/drive";
import { communicationRepository } from "@/lib/repositories/communicationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { broadcastStore, type BroadcastError, type BroadcastRecord } from "@/lib/broadcast-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

/** One entry per address: the same donor often appears under several donation rows. */
export function dedupeRecipients(recipients: any[]): { name: string; email: string }[] {
  const byEmail = new Map<string, { name: string; email: string }>();
  for (const r of recipients) {
    const email = String(r?.email || "").trim();
    const key = email.toLowerCase();
    if (!EMAIL_PATTERN.test(email) || byEmail.has(key)) continue;
    byEmail.set(key, { name: String(r.name || "").trim() || "Valued Donor", email });
  }
  return Array.from(byEmail.values());
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks);
}

/** Media uploaded from the admin panel is stored as `/api/media/<driveFileId>`; read it from Drive directly. */
async function resolveAttachment(url: string): Promise<{ filename: string; content: Buffer; contentType?: string } | null> {
  const driveMatch = url.match(/\/api\/media\/([^/?#]+)/);
  if (driveMatch) {
    const { stream, filename, mimeType } = await driveService.getFileStream(decodeURIComponent(driveMatch[1]));
    return { filename, content: await streamToBuffer(stream), contentType: mimeType };
  }

  const absolute = /^https?:\/\//i.test(url) ? url : `${getSiteUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
  const res = await fetch(absolute, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const filename = absolute.split("/").pop()?.split("?")[0] || "document";
  return { filename, content: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") || undefined };
}

function topErrors(errorCounts: Map<string, number>): BroadcastError[] {
  return Array.from(errorCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * Sends a broadcast to every recipient and returns the final record.
 * Runs inside the request (not after the response) so the function is never
 * frozen mid-send; `deadline` stops early enough to always persist the result.
 */
export async function processBroadcast(
  broadcastId: string,
  recipients: any[],
  payload: any,
  options: { deadline?: number } = {}
): Promise<BroadcastRecord> {
  const { heading, eyebrow, dua, projectUpdateHtml, mediaUrls, causeName, stats, createdAt } = payload;
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const errorCounts = new Map<string, number>();
  const recordError = (reason: string) => errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
  let successCount = 0;
  let failCount = 0;

  const jobs = dedupeRecipients(recipients);

  // Keep our own copy so the result never depends on the in-memory store entry
  let record: BroadcastRecord = broadcastStore.get(broadcastId) ?? {
    id: broadcastId,
    createdBy: "Administrator",
    createdAt: createdAt || new Date().toISOString(),
    communicationType: "general_communication",
    selectedCauseIds: [],
    causeName: causeName || "",
    totalRecipients: jobs.length,
    status: "Queued",
    stats: { sent: 0, failed: 0, remaining: jobs.length },
    startedAt: null,
    completedAt: null,
    processingDurationMs: 0,
  };
  const patch = (partial: Partial<BroadcastRecord>): BroadcastRecord => {
    record = { ...record, ...partial };
    broadcastStore.set(broadcastId, record);
    return record;
  };

  try {
    patch({
      status: "Processing",
      startedAt: new Date().toISOString(),
      totalRecipients: jobs.length,
      stats: { sent: 0, failed: 0, remaining: jobs.length },
    });

    // Resolve media attachments once for efficiency
    const resolvedAttachments: any[] = [...attachDaaraynLogo()];
    if (Array.isArray(mediaUrls)) {
      for (const url of mediaUrls) {
        try {
          const attachment = await resolveAttachment(url);
          if (attachment) resolvedAttachments.push(attachment);
        } catch (downloadErr: any) {
          console.error(`[Broadcast] Failed to attach ${url}:`, downloadErr?.message || downloadErr);
        }
      }
    }

    const subject = `${heading} — Daarayn Foundation`;

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      if (Date.now() > deadline) {
        const skipped = jobs.length - i;
        failCount += skipped;
        errorCounts.set("Not attempted: the send ran out of time. Send again to the remaining recipients.", skipped);
        break;
      }

      const batch = jobs.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (job) => {
        let lastError = "Send failed";
        try {
          const html = generateLetterEmailTemplate({
            title: subject,
            eyebrow: eyebrow,
            greeting: `Assalamu Alaikum, ${job.name},`,
            contributionSummary: [
              { label: "Target Causes", value: causeName || "Daarayn Initiatives" },
              { label: "Campaign Progress", value: stats?.percentage !== undefined ? `${stats.percentage}% Funded` : "Active" }
            ],
            projectUpdate: projectUpdateHtml,
            transparencySummary: "Every Rupee you donate is tracked, documented, and reported. This communication is permanently recorded on our public ledger for complete transparency.",
            ctaLink: `${getSiteUrl()}/donor/dashboard`,
            ctaText: "Track Your Impact",
            dua,
            signOff: ""
          });

          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              // Exponential backoff
              await new Promise(res => setTimeout(res, 500 * Math.pow(2, attempt)));
            }
            const result = await sendEmail({ to: job.email, subject, html, attachments: resolvedAttachments });
            if (result.success) {
              successCount++;
              return;
            }
            lastError = result.error || lastError;
            if (result.retryable === false) break;
          }
        } catch (e: any) {
          lastError = e?.message || lastError;
        }
        failCount++;
        recordError(lastError);
      }));

      const remainingCount = Math.max(0, jobs.length - (successCount + failCount));

      patch({
        stats: { sent: successCount, failed: failCount, remaining: remainingCount },
        errors: topErrors(errorCounts),
      });

      // Progress ticks are transient: keep them out of the shared event log.
      realtimeBroadcaster.broadcast("BROADCAST_PROGRESS", {
        broadcastId,
        sent: successCount,
        failed: failCount,
        remaining: remainingCount,
        status: "Processing"
      }, { durable: false });

      // Delay to respect provider limits
      if (i + BATCH_SIZE < jobs.length) {
        await new Promise(res => setTimeout(res, 300));
      }
    }

    const errors = topErrors(errorCounts);
    const status = successCount === 0 && failCount > 0 ? "Failed" : "Completed";
    const completedAt = new Date().toISOString();

    const finalRecord = patch({
      status,
      completedAt,
      processingDurationMs: Date.now() - new Date(createdAt).getTime(),
      stats: { sent: successCount, failed: failCount, remaining: 0 },
      errors,
      failureReason: errors[0]?.reason,
    });

    if (failCount > 0) {
      console.error(`[Broadcast] ${broadcastId}: ${failCount}/${jobs.length} failed`, errors);
    }

    // Persist durable history; a Sheets hiccup must not hide the send result from the admin
    try {
      await communicationRepository.save({
        id: broadcastId,
        type: "Email Broadcast",
        subject: heading || "Daarayn Dispatch",
        bodyText: eyebrow || "",
        selectedCauses: causeName ? [causeName] : [],
        recipientCount: jobs.length,
        sentCount: successCount,
        failedCount: failCount,
        status,
        createdBy: "Admin",
        createdAt: createdAt || new Date().toISOString(),
        completedAt,
        errorSummary: errors.map(e => `${e.count}× ${e.reason}`).join(" | "),
      });
    } catch (persistErr: any) {
      console.error(`[Broadcast] ${broadcastId}: failed to save history:`, persistErr?.message || persistErr);
    }

    realtimeBroadcaster.broadcast("BROADCAST_COMPLETED", {
      broadcastId,
      sent: successCount,
      failed: failCount,
      status
    });

    return finalRecord;
  } catch (error: any) {
    console.error("Broadcast failed globally:", error);
    return patch({
      status: "Failed",
      failureReason: error?.message || "Unknown error",
      stats: { sent: successCount, failed: jobs.length - successCount, remaining: 0 },
      errors: topErrors(errorCounts),
    });
  }
}
