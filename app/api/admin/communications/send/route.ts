import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection } from "firebase/firestore";
import { addDoc } from "@/lib/db-sync";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { causeId, causeName, type, heading, notes, media, recipients, stats } = body;

    if (!causeId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ success: false, error: "Missing required fields or no recipients." }, { status: 400 });
    }

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

    let successCount = 0;
    
    // Dispatch emails
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      
      // Personalize for each recipient
      const html = generateLetterEmailTemplate({
        title: `${heading} — Daarayn Foundation`,
        eyebrow: eyebrow,
        greeting: `Assalamu Alaikum, ${recipient.name},`,
        contributionSummary: [
          { label: "Project / Cause", value: causeName || "Daarayn Initiatives" },
          { label: "Campaign Progress", value: stats?.percentage !== undefined ? `${stats.percentage}% Funded` : "Active" }
        ],
        projectUpdate: formattedNotes.join('<br><br>'),
        transparencySummary: "Every Rupee you donate is tracked, documented, and reported. This communication is permanently recorded on our public ledger for complete transparency.",
        ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
        ctaText: "Track Your Impact",
        dua,
        signOff: "" // Let the footer handle it in the new theme
      });

      try {
        const result = await sendEmail({
          to: recipient.email,
          subject: `${heading} — Daarayn Foundation`,
          html,
          attachments: attachDaaraynLogo()
        });
        
        if (result.success) successCount++;
      } catch (err) {
        console.error(`Failed to send to ${recipient.email}:`, err);
      }
    }

    // Save to Firestore Communication Log
    const logData = {
      id: `COMM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      causeId,
      type,
      recipientsCount: recipients.length,
      subject: heading,
      message: notes,
      media: media || [],
      sentDate: new Date().toISOString(),
      createdBy: "Administrator", // Can be pulled from auth session
      status: "sent"
    };

    await addDoc(collection(db, "communications"), logData);

    // Sync is automatically queued by lib/db-sync wrapper
    
    return NextResponse.json({ 
      success: true, 
      sent: successCount, 
      total: recipients.length 
    });
    
  } catch (error: any) {
    console.error("Communication dispatch failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
