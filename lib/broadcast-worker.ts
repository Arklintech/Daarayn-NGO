import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";

export async function processBroadcast(broadcastId: string, recipients: any[], payload: any) {
  const { heading, eyebrow, dua, projectUpdateHtml, mediaUrls, causeName, stats, createdAt } = payload;
  let successCount = 0;
  let failCount = 0;
  const batchSize = 25; 

  const broadcastRef = doc(db, "broadcasts", broadcastId);
  const jobsRef = collection(db, "broadcast_email_jobs");

  try {
    await updateDoc(broadcastRef, {
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

        const jobDocRef = doc(db, "broadcast_email_jobs", job.jobId);
        if (delivered) {
          successCount++;
          await updateDoc(jobDocRef, {
            status: "Sent",
            completedTime: new Date().toISOString(),
            retryCount: attempts,
            lastAttempt: new Date().toISOString()
          });
        } else {
          failCount++;
          await updateDoc(jobDocRef, {
            status: "Failed",
            failureReason: lastError?.message || "Unknown error",
            retryCount: attempts,
            lastAttempt: new Date().toISOString()
          });
        }
      }));

      // Update Live Progress Panel (Step 5)
      await updateDoc(broadcastRef, {
        "stats.sent": successCount,
        "stats.failed": failCount,
        "stats.remaining": jobs.length - (successCount + failCount)
      });
      
      // Delay to respect provider limits
      await new Promise(res => setTimeout(res, 1500));
    }

    const processingDurationMs = Date.now() - new Date(createdAt).getTime();
    await updateDoc(broadcastRef, {
      status: "Completed",
      completedAt: new Date().toISOString(),
      processingDurationMs,
      "stats.sent": successCount,
      "stats.failed": failCount,
      "stats.remaining": 0
    });

  } catch (error: any) {
    console.error("Broadcast failed globally:", error);
    await updateDoc(broadcastRef, {
      status: "Failed",
      failureReason: error?.message || "Unknown error"
    });
  }
}
