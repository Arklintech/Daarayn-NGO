import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { getSiteUrl } from "@/lib/email/deliverability";
import { driveService } from "@/lib/google/drive";
import { communicationRepository } from "@/lib/repositories/communicationRepository";
import { communicationRecipientRepository, type CommunicationRecipientEntity } from "@/lib/repositories/communicationRecipientRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { broadcastStore, type BroadcastError, type BroadcastRecord } from "@/lib/broadcast-store";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 2;
const BATCH_DELAY_MS = 50;

/** One entry per address: the same donor often appears under several donation rows. */
export function dedupeRecipients(recipients: any[]): { id?: string; name: string; email: string }[] {
  const byEmail = new Map<string, { id?: string; name: string; email: string }>();
  for (const r of recipients) {
    const email = String(r?.email || "").trim();
    const key = email.toLowerCase();
    if (!EMAIL_PATTERN.test(email) || byEmail.has(key)) continue;
    byEmail.set(key, { id: r.id ? String(r.id) : undefined, name: String(r.name || "").trim() || "Valued Donor", email });
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
  options: { deadline?: number; rows?: { entity: CommunicationRecipientEntity; rowNumber: number }[] } = {}
): Promise<BroadcastRecord> {
  const { heading, eyebrow, dua, projectUpdateHtml, mediaUrls, causeName, stats, createdAt } = payload;
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const errorCounts = new Map<string, number>();
  const recordError = (reason: string) => errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
  let successCount = 0;
  let failCount = 0;

  const jobs = dedupeRecipients(recipients);
  // Per-recipient history rows (Communication_Recipients), keyed by Donor Token.
  const rowByDonor = new Map((options.rows || []).map((r) => [r.entity.donorId, r]));
  const persistRows = async (rows: { entity: CommunicationRecipientEntity; rowNumber: number }[]) => {
    if (rows.length === 0) return;
    try {
      await communicationRecipientRepository.writeOutcomes(rows);
    } catch (err: any) {
      console.error(`[Broadcast] ${broadcastId}: could not save recipient outcomes:`, err?.message || err);
    }
  };

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

    // Resolve media attachments once for efficiency (in parallel)
    const resolvedAttachments: any[] = [...attachDaaraynLogo()];
    if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
      const attachmentPromises = mediaUrls.map(async (url) => {
        try {
          return await resolveAttachment(url);
        } catch (downloadErr: any) {
          console.error(`[Broadcast] Failed to attach ${url}:`, downloadErr?.message || downloadErr);
          return null;
        }
      });

      const attachments = await Promise.all(attachmentPromises);
      resolvedAttachments.push(...attachments.filter(Boolean));
    }

    const subject = `${heading} — Daarayn Foundation`;

    // Generate base template once - only the greeting changes per recipient
    const baseTemplate = {
      title: subject,
      eyebrow: eyebrow,
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
    };

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      if (Date.now() > deadline) {
        const skipped = jobs.length - i;
        failCount += skipped;
        const reason = "Not attempted: the send ran out of time. Retry failed recipients to send to the remaining recipients.";
        errorCounts.set(reason, skipped);
        const skippedRows = jobs.slice(i).map((j) => (j.id ? rowByDonor.get(j.id) : undefined)).filter(Boolean) as { entity: CommunicationRecipientEntity; rowNumber: number }[];
        skippedRows.forEach((r) => { r.entity = { ...r.entity, status: "failed", lastError: reason, updatedAt: new Date().toISOString() }; });
        await persistRows(skippedRows);
        break;
      }

      const batch = jobs.slice(i, i + BATCH_SIZE);
      const batchRows = batch.map((j) => (j.id ? rowByDonor.get(j.id) : undefined)).filter(Boolean) as { entity: CommunicationRecipientEntity; rowNumber: number }[];
      batchRows.forEach((r) => { r.entity = { ...r.entity, status: "attempted", updatedAt: new Date().toISOString() }; });
      await persistRows(batchRows);

      await Promise.allSettled(batch.map(async (job) => {
        let lastError = "Send failed";
        const row = job.id ? rowByDonor.get(job.id) : undefined;
        const record = (patch: Partial<CommunicationRecipientEntity>) => {
          if (row) row.entity = { ...row.entity, ...patch, updatedAt: new Date().toISOString() };
        };
        try {
          // Only personalize the greeting - generate HTML once
          const html = generateLetterEmailTemplate({
            ...baseTemplate,
            greeting: `Assalamu Alaikum, ${job.name},`
          });

          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            if (attempt > 0) {
              // Minimal backoff for retries (25ms only)
              await new Promise(res => setTimeout(res, 25));
            }
            record({ attempts: (row?.entity.attempts || 0) + 1 });
            const result = await sendEmail({ to: job.email, subject, html, attachments: resolvedAttachments });

            // Note: result.success means SMTP server accepted the email (250 OK),
            // NOT that it arrived in the recipient's mailbox. This is provider semantics.
            // We record SMTP acceptance here; inbox delivery is not automatically verifiable.
            if (result.success) {
              successCount++;
              record({ status: "smtp_accepted", lastError: "", providerMessageId: result.providerMessageId || "" });
              console.log(`[Broadcast] Email SMTP-accepted for ${job.email}, MessageId: ${result.providerMessageId}`);
              return;
            }
            lastError = result.error || lastError;
            if (result.retryable === false) {
              console.warn(`[Broadcast] Permanent failure for ${job.email}: ${lastError}`);
              break;
            }
          }
        } catch (e: any) {
          lastError = e?.message || lastError;
        }
        failCount++;
        recordError(lastError);
        record({ status: "failed", lastError: lastError.slice(0, 500) });
      }));
      await persistRows(batchRows);

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

      // Minimal delay to respect provider rate limits while maximizing throughput
      if (i + BATCH_SIZE < jobs.length) {
        await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
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
      console.error(`[Broadcast] ${broadcastId}: ${failCount}/${jobs.length} failed (SMTP rejection)`, errors);
    }

    console.log(`[Broadcast] ${broadcastId}: ${successCount}/${jobs.length} SMTP-accepted (not inbox-delivery-verified)`);

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
        createdBy: record.createdBy || "Admin",
        createdAt: createdAt || new Date().toISOString(),
        completedAt,
        errorSummary: errors.map(e => `${e.count}× ${e.reason}`).join(" | "),
        communicationType: record.communicationType,
        causeIds: record.selectedCauseIds,
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
