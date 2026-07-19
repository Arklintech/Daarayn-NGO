import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection } from "firebase/firestore";
import { addDoc } from "@/lib/db-sync";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { resolveRecipients } from "@/lib/communication-resolver";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { causeIds, type, heading, notes, media } = body;

    if (!causeIds || !Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Missing selected causes." }, { status: 400 });
    }

    const { uniqueDonors, stats, causeNames } = await resolveRecipients(causeIds, type || "general_communication");
    
    if (uniqueDonors.length === 0) {
      return NextResponse.json({ success: false, error: "No eligible recipients found." }, { status: 400 });
    }

    const recipients = uniqueDonors;
    const causeName = causeNames.join(", ");

    // Map communication type to institutional formatting
    let eyebrow = "VERIFIED UPDATE";
    let dua = { arabic: "", english: "" };
    
    if (type === "contribution_confirmation") {
      eyebrow = "CONTRIBUTION CONFIRMED";
      dua = {
        arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ",
        english: "Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing."
      };
    } else if (type === "project_progress") {
      eyebrow = "PROJECT PROGRESS UPDATE";
      dua = {
        arabic: "رَبِّ زِدْنِي عِلْمًا",
        english: "My Lord, increase me in knowledge."
      };
    } else if (type === "allocation_confirmation") {
      eyebrow = "FUNDS ALLOCATED";
      dua = {
        arabic: "اللَّهُمَّ بَارِكْ لَهُمْ فِيمَا رَزَقْتَهُمْ",
        english: "O Allah, bless them in what You have provided them."
      };
    } else if (type === "completion_report") {
      eyebrow = "COMPLETION & IMPACT REPORT";
      dua = {
        arabic: "الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ",
        english: "All praise is to Allah by whose grace good deeds are completed."
      };
    } else {
      eyebrow = "OFFICIAL COMMUNICATION";
      dua = {
        arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
        english: "Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire."
      };
    }

    const formattedNotes = notes.split('\n\n').map((p: string) => 
      p.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong style='color:#F2EEE3;'>$1</strong>")
    );

    // Format project update and append links to media files
    let projectUpdateHtml = formattedNotes.join('<br><br>');
    if (media && Array.isArray(media) && media.length > 0) {
      projectUpdateHtml += '<br><br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:20px 0;"><strong style="color:#D4AF37; font-family:Georgia, serif; font-size:14px;">Attached Documents & Media:</strong><ul style="margin:10px 0 0; padding-left:20px; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">';
      media.forEach((url: string, idx: number) => {
        const filename = url.split("/").pop()?.split("?")[0] || `document-${idx + 1}`;
        projectUpdateHtml += `<li><a href="${url}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${filename}</a></li>`;
      });
      projectUpdateHtml += '</ul>';
    }

    // Resolve and download remote attachments once for efficiency
    const resolvedAttachments: any[] = [...attachDaaraynLogo()];
    if (media && Array.isArray(media)) {
      for (const url of media) {
        try {
          console.log(`[Send Communication] Downloading attachment: ${url}`);
          const res = await fetch(url);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const filename = url.split("/").pop()?.split("?")[0] || "document";
            resolvedAttachments.push({
              filename,
              content: buffer
            });
            console.log(`[Send Communication] Successfully attached: ${filename}`);
          } else {
            console.warn(`[Send Communication] Download failed for ${url} with status: ${res.status}`);
          }
        } catch (downloadErr) {
          console.error(`Failed to download attachment ${url}:`, downloadErr);
        }
      }
    }

    const commId = `COMM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    let successCount = 0;
    let failCount = 0;
    
    // Dispatch emails in batches
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      await Promise.allSettled(batch.map(async (recipient) => {
        if (!recipient.email) return;
        
        // Personalize for each recipient
        const html = generateLetterEmailTemplate({
          title: `${heading} — Daarayn Foundation`,
          eyebrow: eyebrow,
          greeting: `Assalamu Alaikum, ${recipient.name},`,
          contributionSummary: [
            { label: "Target Causes", value: causeName || "Daarayn Initiatives" },
            { label: "Campaign Progress", value: stats?.percentage !== undefined ? `${stats.percentage}% Funded` : "Active" }
          ],
          projectUpdate: projectUpdateHtml,
          transparencySummary: "Every Rupee you donate is tracked, documented, and reported. This communication is permanently recorded on our public ledger for complete transparency.",
          ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
          ctaText: "Track Your Impact",
          dua,
          signOff: "" // Let the footer handle it in the new theme
        });

        let attempts = 0;
        const maxRetries = 3;
        let delivered = false;
        let lastError: any = null;

        while (attempts < maxRetries && !delivered) {
          try {
            const result = await sendEmail({
              to: recipient.email,
              subject: `${heading} — Daarayn Foundation`,
              html,
              attachments: resolvedAttachments
            });
            
            if (result.success) {
              delivered = true;
              successCount++;
            } else {
              throw new Error("Provider returned unsuccessful response");
            }
          } catch (err: any) {
            attempts++;
            lastError = err;
            if (attempts < maxRetries) {
              // Wait before retry
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }

        if (!delivered) {
          failCount++;
          console.error(`Failed to send to ${recipient.email} after ${maxRetries} attempts:`, lastError);
          // Log failure to communication_jobs
          await addDoc(collection(db, "communication_jobs"), {
            communicationId: commId,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            status: "failed",
            error: lastError?.message || "Unknown error",
            timestamp: new Date().toISOString()
          });
        } else {
          // Log success to communication_jobs
          await addDoc(collection(db, "communication_jobs"), {
            communicationId: commId,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            status: "sent",
            timestamp: new Date().toISOString()
          });
        }
      }));

      // Delay between batches
      if (i + batchSize < recipients.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Save to Firestore Communication Log
    const logData = {
      id: commId,
      causeIds,
      type,
      recipientsCount: recipients.length,
      successfulDeliveries: successCount,
      failedDeliveries: failCount,
      subject: heading,
      message: notes,
      media: media || [],
      sentDate: new Date().toISOString(),
      createdBy: "Administrator", // Can be pulled from auth session
      status: "completed"
    };

    await addDoc(collection(db, "communications"), logData);

    // Sync is automatically queued by lib/db-sync wrapper
    
    return NextResponse.json({ 
      success: true, 
      sent: successCount,
      failed: failCount,
      total: recipients.length 
    });
    
  } catch (error: any) {
    console.error("Communication dispatch failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
