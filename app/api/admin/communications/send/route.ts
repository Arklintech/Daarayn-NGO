import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { resolveRecipients } from "@/lib/communication-resolver";
import { waitUntil } from "@vercel/functions";
import { processBroadcast } from "@/lib/broadcast-worker";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { causeIds, type, heading, notes, media } = body;

    if (!causeIds || !Array.isArray(causeIds) || causeIds.length === 0) {
      return NextResponse.json({ success: false, error: `Missing selected causes. Received: ${JSON.stringify(causeIds)}` }, { status: 400 });
    }

    const { uniqueDonors, stats, causeNames } = await resolveRecipients(causeIds, type || "general_communication");
    
    if (uniqueDonors.length === 0) {
      return NextResponse.json({ success: false, error: `No eligible recipients found for causes ${JSON.stringify(causeIds)} and type ${type}.` }, { status: 400 });
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

    let projectUpdateHtml = formattedNotes.join('<br><br>');
    if (media && Array.isArray(media) && media.length > 0) {
      projectUpdateHtml += '<br><br><hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:20px 0;"><strong style="color:#D4AF37; font-family:Georgia, serif; font-size:14px;">Attached Documents & Media:</strong><ul style="margin:10px 0 0; padding-left:20px; font-family:Arial, sans-serif; font-size:13px; color:#f3f4f6; line-height:1.6;">';
      media.forEach((url: string, idx: number) => {
        const filename = url.split("/").pop()?.split("?")[0] || `document-${idx + 1}`;
        projectUpdateHtml += `<li><a href="${url}" target="_blank" style="color:#C9A24B; text-decoration:underline;">${filename}</a></li>`;
      });
      projectUpdateHtml += '</ul>';
    }

    const broadcastId = `BCAST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const createdAt = new Date().toISOString();

    // 1. Create Broadcast Job Document
    const broadcastRef = doc(db, "broadcasts", broadcastId);
    await setDoc(broadcastRef, {
      id: broadcastId,
      createdBy: "Administrator",
      createdAt,
      communicationType: type || "general_communication",
      selectedCauseIds: causeIds,
      causeName,
      totalRecipients: recipients.length,
      status: "Queued",
      stats: { sent: 0, failed: 0, remaining: recipients.length },
      startedAt: null,
      completedAt: null,
      processingDurationMs: 0
    });

    // 2. Setup Background Processing via waitUntil
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

    waitUntil(processBroadcast(broadcastId, recipients, payload));

    return NextResponse.json({ 
      success: true, 
      broadcastId,
      total: recipients.length 
    });
    
  } catch (error: any) {
    console.error("Communication dispatch setup failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
