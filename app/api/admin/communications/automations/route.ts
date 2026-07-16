import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { generateLetterEmailTemplate, attachDaaraynLogo } from "@/lib/email/resend";
import { sendEmail } from "@/lib/email/providerManager";
import { addDoc } from "@/lib/db-sync";

const MILESTONES = [25, 50, 75, 100];

export async function POST(req: Request) {
  try {
    // 1. Fetch all active causes
    const causesSnap = await getDocs(collection(db, "causes"));
    
    // 2. Fetch all completed donations to compute stats
    const donationsSnap = await getDocs(
      query(collection(db, "donations"), where("status", "==", "completed"))
    );
    
    const donations = donationsSnap.docs.map(d => d.data());
    
    // 3. Fetch past automated milestone communications to prevent duplicate sends
    const commsSnap = await getDocs(
      query(collection(db, "communications"), where("type", "==", "project_progress"))
    );
    const pastComms = commsSnap.docs.map(d => d.data());
    
    const processedMilestones: any[] = [];

    for (const causeDoc of causesSnap.docs) {
      const cause = causeDoc.data();
      const causeId = causeDoc.id;
      const safeGoalAmount = cause.goalAmount || 1;
      
      // Compute raised amount and unique donors for this cause
      let raised = 0;
      const uniqueDonorsMap = new Map<string, any>();
      
      for (const donation of donations) {
        if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
          const matchedCause = donation.selectedCauses.find((c: any) => c.causeId === causeId);
          if (matchedCause) {
            raised += matchedCause.allocatedAmount;
            const email = donation.donorEmail || donation.donorId;
            if (!uniqueDonorsMap.has(email)) {
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
        const alreadySent = pastComms.some(c => 
          c.causeId === causeId && c.milestonePercentage === reachedMilestone
        );

        if (!alreadySent) {
          // Trigger the milestone communication
          const recipients = Array.from(uniqueDonorsMap.values());
          
          if (recipients.length > 0) {
            const heading = `Milestone Reached: ${reachedMilestone}% for ${cause.name}`;
            const notes = `Alhamdulillah, thanks to your generous support, we have reached **${reachedMilestone}%** of our goal for ${cause.name}. Your contribution is actively making an impact on the ground.`;
            
            const logData = {
              id: `COMM-AUTO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
              causeId,
              type: "project_progress",
              milestonePercentage: reachedMilestone,
              recipientsCount: recipients.length,
              subject: heading,
              message: notes,
              media: [],
              sentDate: new Date().toISOString(),
              createdBy: "Daarayn Automations",
              status: "sent"
            };

            // Build HTML
            const html = generateLetterEmailTemplate({
              title: `${heading} — Daarayn Foundation`,
              eyebrow: "PROJECT PROGRESS UPDATE",
              headline: heading,
              greeting: "Assalamu Alaikum,",
              bodyParagraphs: [
                `This communication concerns your support for **${cause.name}**.`,
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

            // Save log
            await addDoc(collection(db, "communications"), logData);
            
            processedMilestones.push({ causeId, causeName: cause.name, milestone: reachedMilestone, recipients: recipients.length });
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
