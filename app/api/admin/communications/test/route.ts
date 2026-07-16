import { NextResponse } from "next/server";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";

const TEST_RECIPIENT = "alifuelhp@gmail.com";
const TEST_CAUSE = "Family Relief Bundle";

const communications = [
  {
    type: "contribution_confirmation",
    eyebrow: "CONTRIBUTION CONFIRMED",
    heading: "Your Donation Has Been Received",
    notes: "We are pleased to confirm that your generous contribution has been successfully received and verified. Your Amanah is safe with us and will be deployed with full transparency.",
    dua: {
      arabic: "رَبَّنَا تَقَبَّلْ مِنَّا ۖ إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ",
      english: "Our Lord, accept [this] from us. Indeed You are the Hearing, the Knowing."
    }
  },
  {
    type: "project_progress",
    eyebrow: "PROJECT PROGRESS UPDATE",
    heading: "Field Update — Phase 1 Complete",
    notes: "Alhamdulillah, Phase 1 of the Family Relief Bundle has been completed successfully. Materials have been procured and distributed to 12 verified families. Field documentation has been recorded.",
    dua: {
      arabic: "رَبِّ زِدْنِي عِلْمًا",
      english: "My Lord, increase me in knowledge."
    }
  },
  {
    type: "allocation_confirmation",
    eyebrow: "FUNDS ALLOCATED",
    heading: "Allocation Confirmed to Active Project",
    notes: "A portion of your donation has been officially allocated and deployed to an active project under the Family Relief Bundle cause. Every rupee is tracked and reported.",
    dua: {
      arabic: "اللَّهُمَّ بَارِكْ لَهُمْ فِيمَا رَزَقْتَهُمْ",
      english: "O Allah, bless them in what You have provided them."
    }
  },
  {
    type: "completion_report",
    eyebrow: "COMPLETION & IMPACT REPORT",
    heading: "Project Completed — Full Impact Report",
    notes: "We are pleased to announce that the Family Relief Bundle initiative has been completed. 47 families received direct aid. 100% of allocated funds were deployed. Full ledger available on the public dashboard.",
    dua: {
      arabic: "الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ",
      english: "All praise is to Allah by whose grace good deeds are completed."
    }
  },
  {
    type: "general_communication",
    eyebrow: "OFFICIAL COMMUNICATION",
    heading: "An Important Update From Daarayn",
    notes: "Assalamu Alaikum. This is a general institutional communication from Daarayn Foundation. We want to take a moment to thank you for your continued trust and Amanah in our work. Jazak Allah Khairan.",
    dua: {
      arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
      english: "Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire."
    }
  }
];

export const maxDuration = 60; // seconds – allows longer serverless execution

export async function GET() {
  // Fire all emails in parallel — don't wait sequentially
  const promises = communications.map(async (comm) => {
    try {
      const html = generateLetterEmailTemplate({
        title: `${comm.heading} — Daarayn Foundation`,
        eyebrow: comm.eyebrow,
        greeting: `Assalamu Alaikum, Ahmed Khan,`,
        contributionSummary: [
          { label: "Project / Cause", value: TEST_CAUSE },
          { label: "Amount", value: "₹15,000.00" },
          { label: "Status", value: "Active Deployment" },
        ],
        projectUpdate: comm.notes,
        transparencySummary: "Every Rupee you donate is tracked, documented, and reported. This allocation is permanently recorded on our public ledger for complete transparency.",
        ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
        ctaText: "Track Your Impact",
        dua: comm.dua,
      });

      const result = await sendEmail({
        to: TEST_RECIPIENT,
        subject: `[${comm.eyebrow}] ${comm.heading} — Daarayn Foundation`,
        html,
        attachments: attachDaaraynLogo()
      });

      return { type: comm.type, success: result.success, error: result.error };
    } catch (err: any) {
      return { type: comm.type, success: false, error: err.message };
    }
  });

  const results = await Promise.all(promises);
  const sent = results.filter(r => r.success).length;

  return NextResponse.json({
    message: `Sent ${sent}/${communications.length} test emails to ${TEST_RECIPIENT}`,
    results
  });
}
