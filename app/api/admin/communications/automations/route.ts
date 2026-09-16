import { NextResponse } from "next/server";
import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { communicationRepository } from "@/lib/repositories/communicationRepository";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";

const MILESTONES = [25, 50, 75, 100];

export async function POST(req: Request) {
  try {
    // 1. Fetch all active causes from Google Sheets
    const causes = await causeRepository.getAll();
    
    // 2. Fetch all completed donations to compute stats
    const allDonations = await donationRepository.getAll();
    const completedDonations = allDonations.filter((d: any) => 
      (d.status || "").toLowerCase() === "completed" || (d.status || "").toLowerCase() === "verified"
    );
    
    // 3. Fetch past automated milestone communications
    const pastComms = await communicationRepository.getAll();
    
    const processedMilestones: any[] = [];

    for (const cause of causes) {
      const causeId = cause.id;
      const safeGoalAmount = cause.targetAmount || 1;
      
      // Compute raised amount and unique donors for this cause
      let raised = 0;
      const uniqueDonorsMap = new Map<string, any>();
      
      for (const donation of completedDonations as any[]) {
        const selectedCauses = donation.selectedCauses || [];
        if (Array.isArray(selectedCauses)) {
          const matchedCause = selectedCauses.find((c: any) => c.causeId === causeId);
          if (matchedCause) {
            raised += Number(matchedCause.allocatedAmount || matchedCause.amount || 0);
            const email = donation.donorEmail || donation.donorId;
            if (email && !uniqueDonorsMap.has(email)) {
              uniqueDonorsMap.set(email, {
                id: donation.donorId,
                email: email,
                name: donation.donorName || "Anonymous Donor"
              });
            }
          }
        }
      }

      const percentage = Math.min(100, Math.floor((raised / safeGoalAmount) * 100));
      
      // Determine the highest milestone reached
      let reachedMilestone = 0;
      for (const m of MILESTONES) {
        if (percentage >= m) {
          reachedMilestone = m;
        }
      }

      if (reachedMilestone > 0) {
        // Check if we already sent a communication for this milestone for this cause
        const alreadySent = pastComms.some((c: any) => 
          c.selectedCauses?.includes(causeId) && (c as any).milestonePercentage === reachedMilestone
        );

        if (!alreadySent) {
          // Trigger the milestone communication
          const recipients = Array.from(uniqueDonorsMap.values());
          
          if (recipients.length > 0) {
            const causeName = cause.title || cause.category || causeId || "Daarayn Initiative";
            const heading = `Milestone Reached: ${reachedMilestone}% for ${causeName}`;
            const notes = `Alhamdulillah, thanks to your generous support, we have reached **${reachedMilestone}%** of our goal for ${causeName}. Your contribution is actively making an impact on the ground.`;
            
            const logData = {
              id: `COMM-AUTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
              type: "project_progress",
              subject: heading,
              bodyText: notes,
              selectedCauses: [causeId],
              recipientCount: recipients.length,
              sentCount: recipients.length,
              failedCount: 0,
              status: "Completed" as const,
              createdBy: "Daarayn Automations",
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };

            // Build HTML
            const html = generateLetterEmailTemplate({
              title: `${heading} — Daarayn Foundation`,
              eyebrow: "PROJECT PROGRESS UPDATE",
              headline: heading,
              greeting: "Assalamu Alaikum,",
              bodyParagraphs: [
                `This communication concerns your support for **${causeName}**.`,
                notes.replace(/\*\*(.*?)\*\*/g, "<strong style='color:#F2EEE3;'>$1</strong>"),
                `<br><strong>Current Campaign Status:</strong> We have reached **${reachedMilestone}%** of our goal (₹${raised.toLocaleString()} / ₹${safeGoalAmount.toLocaleString()}).`
              ],
              pullQuote: "Every rupee you donate is tracked, documented, and permanently recorded on our public ledger — ensuring complete transparency.",
              postQuoteParagraph: "You can view the full progress details and field notes on your secure donor dashboard.",
              ctaLink: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard`,
              ctaText: "View My Donor Dashboard",
              dua: {
                arabic: "رَبِّ زِدْنِي عِلْمًا",
                english: "My Lord, increase me in knowledge."
              },
              signOff: `With gratitude,<br><span style="color:#F2EEE3;">The Daarayn Foundation team</span>`
            });

            // Dispatch emails
            for (const recipient of recipients) {
              if (!recipient.email) continue;
              await sendEmail({
                to: recipient.email,
                subject: `${heading} — Daarayn Foundation`,
                html,
                attachments: attachDaaraynLogo()
              }).catch(err => console.error(`Automation failed for ${recipient.email}:`, err));
            }

            // Save log to Google Sheets repository
            await communicationRepository.save(logData);
            
            processedMilestones.push({ causeId, causeName, milestone: reachedMilestone, recipients: recipients.length });
          }
        }
      }
    }

    return NextResponse.json({ success: true, processedMilestones });
    
  } catch (error: any) {
    console.error("Automations trigger failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
