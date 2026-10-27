import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { getSiteUrl } from "@/lib/email/deliverability";
import { driveService } from "@/lib/google/drive";
import { communicationRepository } from "@/lib/repositories/communicationRepository";
import { communicationRecipientRepository, type CommunicationRecipientEntity } from "@/lib/repositories/communicationRecipientRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { broadcastStore, type BroadcastError, type BroadcastRecord } from "@/lib/broadcast-store";
import { issueShareToken, shareUrl, type MediaItem } from "@/lib/communications/attachments";

const escapeHtmlText = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 2;
const BATCH_DELAY_MS = 50;

/**
 * The files section of one recipient's message. Attached files are listed by name (no link: the file is in the email);
 * files delivered as links get a personal, expiring link; external https addresses stay plain public links.
 */
export function attachmentSectionHtml(items: MediaItem[], ctx: { broadcastId: string; recipient: string }): string {
  if (!items.length) return "";
  const lis = items.map((i) => {
    if (i.kind === "external") return `<li><a href="${escapeHtmlText(i.url)}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${escapeHtmlText(i.name)}</a></li>`;
    if (i.delivery === "attach") return `<li>${escapeHtmlText(i.name)} <span style="color:#9ca3af;">(attached to this email)</span></li>`;
    const href = shareUrl(getSiteUrl(), issueShareToken({ driveId: i.driveId!, fingerprint: i.fingerprint, broadcastId: ctx.broadcastId, recipient: ctx.recipient }));
    return `<li><a href="${escapeHtmlText(href)}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${escapeHtmlText(i.name)}</a> <span style="color:#9ca3af;">(personal secure link)</span></li>`;
  });
  return `<br><br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:20px 0;"><strong style="color:#D4AF37; font-family:Georgia, serif; font-size:14px;">Documents:</strong><ul style="margin:10px 0 0; padding-left:20px; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">${lis.join("")}</ul>`;
}

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

/** An approved attachment that cannot be delivered exactly as approved. Nothing is sent when this is thrown. */
export class AttachmentError extends Error {}

/** Gmail rejects messages over 25 MB; attachments are base64-encoded (about +33%), so keep raw files well under that. */
export const MAX_ATTACHMENT_BYTES_TOTAL = 18 * 1024 * 1024;

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;
/** Only http(s) URLs to public hosts are fetched; the server never reaches into the local or private network for an attachment. */
export function isSafeAttachmentUrl(url: string): boolean {
  if (url.startsWith("/")) return true; // same site (resolved against the configured site URL)
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host)) return false;
  if (host === "::1" || /^(fc|fd|fe80)/i.test(host)) return false;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return true;
}

/**
 * Resolves every approved attachment or throws AttachmentError naming the ones that failed. A message must never go out
 * with fewer files than the administrator approved, so there is no "skip and continue".
 */
export async function resolveAttachments(mediaUrls: string[]): Promise<{ filename: string; content: Buffer; contentType?: string }[]> {
  const label = (url: string) => decodeURIComponent(url.split("?")[0].split("/").filter(Boolean).pop() || url);
  const unsafe = mediaUrls.filter((u) => !isSafeAttachmentUrl(u));
  if (unsafe.length) throw new AttachmentError(`Attachment not allowed (only public https links and uploaded files can be attached): ${unsafe.map(label).join(", ")}. Nothing was sent.`);

  const settled = await Promise.allSettled(mediaUrls.map(resolveAttachment));
  const failed = settled.flatMap((r, i) => (r.status === "rejected" || !r.value ? [label(mediaUrls[i])] : []));
  if (failed.length) throw new AttachmentError(`Attachment could not be read: ${failed.join(", ")}. Nothing was sent; fix or remove it and approve again.`);

  const files = settled.map((r) => (r as PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof resolveAttachment>>>>).value);
  const total = files.reduce((n, f) => n + f.content.length, 0);
  if (total > MAX_ATTACHMENT_BYTES_TOTAL) {
    throw new AttachmentError(`The attachments total ${(total / 1048576).toFixed(1)} MB, which is too large to email (limit ${MAX_ATTACHMENT_BYTES_TOTAL / 1048576} MB). Remove some, or share the documents as links. Nothing was sent.`);
  }
  return files;
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
  const mediaItems: MediaItem[] = Array.isArray(payload.mediaItems) ? payload.mediaItems : [];
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const errorCounts = new Map<string, number>();
  const recordError = (reason: string) => errorCounts.set(reason, (errorCounts.get(reason) || 0) + 1);
  let successCount = 0;
  let failCount = 0;
  let unresolvedCount = 0;

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
    // The send route resolves (and validates) them before anything is recorded; resolving here is strict too.
    const resolvedAttachments: any[] = [...attachDaaraynLogo()];
    if (Array.isArray(payload.resolvedAttachments)) resolvedAttachments.push(...payload.resolvedAttachments);
    else if (Array.isArray(mediaUrls) && mediaUrls.length > 0) resolvedAttachments.push(...(await resolveAttachments(mediaUrls)));

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
            projectUpdate: baseTemplate.projectUpdate + attachmentSectionHtml(mediaItems, { broadcastId, recipient: job.id || job.email }),
            greeting: `Assalamu Alaikum, ${escapeHtmlText(job.name)},`
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
            if (result.ambiguous) {
              // The server may already have accepted it: never resend automatically (it could arrive twice).
              unresolvedCount++;
              record({ status: "unresolved", lastError: lastError.slice(0, 500) });
              return;
            }
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

      const remainingCount = Math.max(0, jobs.length - (successCount + failCount + unresolvedCount));

      patch({
        stats: { sent: successCount, failed: failCount, unresolved: unresolvedCount, remaining: remainingCount },
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
      stats: { sent: successCount, failed: failCount, unresolved: unresolvedCount, remaining: 0 },
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
        unresolvedCount,
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
      stats: { sent: successCount, failed: jobs.length - successCount - unresolvedCount, unresolved: unresolvedCount, remaining: 0 },
      errors: topErrors(errorCounts),
    });
  }
}
