import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { communicationRepository } from "@/lib/repositories/communicationRepository";
import { realtimeBroadcaster } from "@/lib/realtime/broadcaster";
import { broadcastStore } from "@/lib/broadcast-store";

// Helper for non-blocking Firestore updates
async function safeFirestoreUpdate(docRef: any, data: any) {
  try {
    await Promise.race([
      updateDoc(docRef, data),
      new Promise(res => setTimeout(res, 1200))
    ]);
  } catch (err: any) {
    // Non-blocking mirror
  }
}

export async function processBroadcast(broadcastId: string, recipients: any[], payload: any) {
  const { heading, eyebrow, dua, projectUpdateHtml, mediaUrls, causeName, stats, createdAt } = payload;
  let successCount = 0;
  let failCount = 0;
  const batchSize = 25; 

  const broadcastRef = doc(db, "broadcasts", broadcastId);
  const jobsRef = collection(db, "broadcast_email_jobs");

  try {
    broadcastStore.update(broadcastId, {
      status: "Processing",
      startedAt: new Date().toISOString()
    });

    safeFirestoreUpdate(broadcastRef, {
      status: "Processing",
      startedAt: new Date().toISOString()
    });

    // Resolve media attachments once for efficiency
    const resolvedAttachments: any[] = [...attachDaaraynLogo()];
    if (mediaUrls && Array.isArray(mediaUrls)) {
      for (const url of mediaUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filename = url.split("/").pop()?.split("?")[0] || "document";
            resolvedAttachments.push({ filename, content: buffer });
          }
        } catch (downloadErr) {
          console.error(`Failed to download attachment ${url}:`, downloadErr);
        }
      }
    }

    // Generate Email Queue (Step 3)
    const jobs: any[] = [];
    for (const r of recipients) {
      if (!r.email) continue;
      const jobDoc = await addDoc(jobsRef, {
        broadcastId,
        recipientId: r.id,
        recipientEmail: r.email,
        recipientName: r.name,
        status: "Pending",
        retryCount: 0,
        lastAttempt: null,
        completedTime: null,
        failureReason: null
      });
      jobs.push({ jobId: jobDoc.id, ...r });
    }

    // Step 4: Batch Processing
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      
      await Promise.allSettled(batch.map(async (job) => {
        const html = generateLetterEmailTemplate({
          title: `${heading} — Daarayn Foundation`,
          eyebrow: eyebrow,
          greeting: `Assalamu Alaikum, ${job.name},`,
          contributionSummary: [
            { label: "Target Causes", value: causeName || "Daarayn Initiatives" },
            { label: "Campaign Progress", value: stats?.percentage !== undefined ? `${stats.percentage}% Funded` : "Active" }
          ],
          projectUpdate: projectUpdateHtml,
          transparencySummary: "Every Rupee you donate is tracked, documented, and reported. This communication is permanently recorded on our public ledger for complete transparency.",
          ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
          ctaText: "Track Your Impact",
          dua,
          signOff: "" 
        });

        let attempts = 0;
        const maxRetries = 3;
        let delivered = false;
        let lastError: any = null;

        while (attempts < maxRetries && !delivered) {
          try {
            if (attempts > 0) {
               // Exponential backoff
               await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempts)));
            }
            const result = await sendEmail({
              to: job.email,
              subject: `${heading} — Daarayn Foundation`,
              html,
              attachments: resolvedAttachments
            });
            
            if (result.success) {
              delivered = true;
            } else {
              throw new Error(result.error || "Send failed");
            }
          } catch (e: any) {
            attempts++;
            lastError = e;
          }
        }

        if (job.jobId) {
          const jobDocRef = doc(db, "broadcast_email_jobs", job.jobId);
          if (delivered) {
            successCount++;
            safeFirestoreUpdate(jobDocRef, {
              status: "Sent",
              completedTime: new Date().toISOString(),
              retryCount: attempts,
              lastAttempt: new Date().toISOString()
            });
          } else {
            failCount++;
            safeFirestoreUpdate(jobDocRef, {
              status: "Failed",
              failureReason: lastError?.message || "Unknown error",
              retryCount: attempts,
              lastAttempt: new Date().toISOString()
            });
          }
        } else {
          if (delivered) successCount++;
          else failCount++;
        }
      }));

      const remainingCount = Math.max(0, jobs.length - (successCount + failCount));

      // Update broadcastStore in-memory state
      broadcastStore.update(broadcastId, {
        stats: {
          sent: successCount,
          failed: failCount,
          remaining: remainingCount
        }
      });

      // Update Live Progress Panel via SSE Realtime Broadcaster
      realtimeBroadcaster.broadcast("BROADCAST_PROGRESS", {
        broadcastId,
        sent: successCount,
        failed: failCount,
        remaining: remainingCount,
        status: "Processing"
      });

      // Mirror to Firestore non-blocking
      safeFirestoreUpdate(broadcastRef, {
        "stats.sent": successCount,
        "stats.failed": failCount,
        "stats.remaining": remainingCount
      });
      
      // Delay to respect provider limits
      await new Promise(res => setTimeout(res, 800));
    }

    const processingDurationMs = Date.now() - new Date(createdAt).getTime();

    // 1. Update in-memory broadcastStore
    broadcastStore.update(broadcastId, {
      status: "Completed",
      completedAt: new Date().toISOString(),
      processingDurationMs,
      stats: {
        sent: successCount,
        failed: failCount,
        remaining: 0
      }
    });

    // 2. Safe Firestore mirror update
    safeFirestoreUpdate(broadcastRef, {
      status: "Completed",
      completedAt: new Date().toISOString(),
      processingDurationMs,
      "stats.sent": successCount,
      "stats.failed": failCount,
      "stats.remaining": 0
    });

    // 3. Persist authoritative durable history to Google Sheets
    await communicationRepository.save({
      id: broadcastId,
      type: "Email Broadcast",
      subject: heading || "Daarayn Dispatch",
      bodyText: eyebrow || "",
      selectedCauses: causeName ? [causeName] : [],
      recipientCount: recipients.length,
      sentCount: successCount,
      failedCount: failCount,
      status: "Completed",
      createdBy: "Admin",
      createdAt: createdAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // 4. Notify connected client listeners in real-time over SSE
    realtimeBroadcaster.broadcast("BROADCAST_COMPLETED", {
      broadcastId,
      sent: successCount,
      failed: failCount,
      status: "Completed"
    });

  } catch (error: any) {
    console.error("Broadcast failed globally:", error);
    broadcastStore.update(broadcastId, {
      status: "Failed",
      failureReason: error?.message || "Unknown error"
    });
    safeFirestoreUpdate(broadcastRef, {
      status: "Failed",
      failureReason: error?.message || "Unknown error"
    });
  }
}

