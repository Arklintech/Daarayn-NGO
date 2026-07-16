/**
 * app/api/admin/ai/drafts/[id]/route.ts
 *
 * Endpoint to manage individual AI drafts: Approve, Edit, Regenerate, Cancel/Reject.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from "firebase/firestore";
import { sendEmail } from "@/lib/email/providerManager";
import { generateLetterEmailTemplate } from "@/lib/email/resend";
import { draftCommunication } from "@/lib/ai/services/communication";
import { validateResponse } from "@/lib/ai/validator";
import { checkCompliance } from "@/lib/ai/compliance";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, updatedPayload, adminEmail } = body;

    const draftRef = doc(db, "ai_drafts", id);
    const draftSnap = await getDoc(draftRef);

    if (!draftSnap.exists()) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }

    const draft = draftSnap.data();

    // ─────────────────────────────────────────────
    // ACTION: EDIT (INLINE CHANGES BY ADMIN)
    // ─────────────────────────────────────────────
    if (action === "edit") {
      if (!updatedPayload) {
        return NextResponse.json({ success: false, error: "Missing updatedPayload." }, { status: 400 });
      }

      // Re-run validation and compliance audits on the edited copy
      const validation = validateResponse(updatedPayload, draft.donorName);
      
      // Re-construct mock verified context to run compliance checks
      let rawDonor: any = null;
      let rawDonation: any = null;
      let rawAllocation: any = null;
      let rawProgram: any = null;
      let rawUpdate: any = null;

      if (draft.donorId) {
        const snap = await getDoc(doc(db, "donors", draft.donorId));
        if (snap.exists()) rawDonor = snap.data();
      }
      if (draft.donationId) {
        const snap = await getDoc(doc(db, "donations", draft.donationId));
        if (snap.exists()) rawDonation = snap.data();
      }
      if (draft.allocationId) {
        const snap = await getDoc(doc(db, "allocations", draft.allocationId));
        if (snap.exists()) rawAllocation = snap.data();
      }
      if (draft.programId) {
        const snap = await getDoc(doc(db, "programs", draft.programId));
        if (snap.exists()) {
          rawProgram = snap.data();
          if (draft.updateId && Array.isArray(rawProgram.updates)) {
            rawUpdate = rawProgram.updates.find((u: any) => u.id === draft.updateId);
          }
        }
      }

      const verifiedContext = {
        donor: rawDonor ? { id: rawDonor.id, name: rawDonor.name, email: rawDonor.email, preferredLanguage: rawDonor.preferredLanguage || "English", communicationPreference: rawDonor.communicationPreference || "Email", totalAmountDonated: rawDonor.totalAmountDonated || 0 } : undefined,
        donation: rawDonation ? { id: rawDonation.id, amount: rawDonation.amount, currency: rawDonation.currency || "INR", date: rawDonation.date, paymentMethod: rawDonation.paymentMethod || "UPI", donationType: rawDonation.donationType || "General" } : undefined,
        allocation: rawAllocation ? { id: rawAllocation.id, allocatedAmount: rawAllocation.allocatedAmount || rawAllocation.amount, allocationDate: rawAllocation.allocationDate || rawAllocation.date, targetTitle: rawAllocation.targetTitle } : undefined,
        program: rawProgram ? { id: rawProgram.id, title: rawProgram.title, description: rawProgram.description, location: rawProgram.location, amountRequired: rawProgram.amountRequired, amountCollected: rawProgram.amountCollected, progress: rawProgram.progress, status: rawProgram.status, beneficiaryCount: rawProgram.beneficiaryCount } : undefined,
        projectUpdate: rawUpdate ? { id: rawUpdate.id, title: rawUpdate.title, content: rawUpdate.content, date: rawUpdate.date, progress: rawUpdate.progress, mediaCount: rawUpdate.media?.length || 0, receipts: rawUpdate.receipts || [], beneficiaryConfirmation: rawUpdate.beneficiaryConfirmation || "" } : undefined,
      };

      const compliance = checkCompliance(updatedPayload, verifiedContext);

      // Save updated payload
      const nextVersion = draft.version + 1;
      const historyItem = {
        version: nextVersion,
        payload: updatedPayload,
        validation,
        compliance,
        createdAt: new Date().toISOString(),
        editedBy: adminEmail || "admin",
      };

      await updateDoc(draftRef, {
        payload: updatedPayload,
        validation,
        compliance,
        version: nextVersion,
        edited: true,
        history: arrayUnion(historyItem),
      });

      return NextResponse.json({ success: true, validation, compliance });
    }

    // ─────────────────────────────────────────────
    // ACTION: REGENERATE (RERUN AI GENERATION)
    // ─────────────────────────────────────────────
    if (action === "regenerate") {
      let rawDonor: any = null;
      let rawDonation: any = null;
      let rawAllocation: any = null;
      let rawProgram: any = null;
      let rawUpdate: any = null;

      if (draft.donorId) {
        const snap = await getDoc(doc(db, "donors", draft.donorId));
        if (snap.exists()) rawDonor = snap.data();
      }
      if (draft.donationId) {
        const snap = await getDoc(doc(db, "donations", draft.donationId));
        if (snap.exists()) rawDonation = snap.data();
      }
      if (draft.allocationId) {
        const snap = await getDoc(doc(db, "allocations", draft.allocationId));
        if (snap.exists()) rawAllocation = snap.data();
      }
      if (draft.programId) {
        const snap = await getDoc(doc(db, "programs", draft.programId));
        if (snap.exists()) {
          rawProgram = snap.data();
          if (draft.updateId && Array.isArray(rawProgram.updates)) {
            rawUpdate = rawProgram.updates.find((u: any) => u.id === draft.updateId);
          }
        }
      }

      // Re-draft using the intelligence service
      const draftResult = await draftCommunication({
        category: draft.category,
        rawDonor,
        rawDonation,
        rawAllocation,
        rawProgram,
        rawUpdate,
        customNotes: draft.customNotes,
        language: draft.language,
      });

      const nextVersion = draft.version + 1;
      const historyItem = {
        version: nextVersion,
        payload: draftResult.payload,
        validation: draftResult.validation,
        compliance: draftResult.compliance,
        createdAt: new Date().toISOString(),
      };

      await updateDoc(draftRef, {
        payload: draftResult.payload,
        validation: draftResult.validation,
        compliance: draftResult.compliance,
        version: nextVersion,
        history: arrayUnion(historyItem),
      });

      return NextResponse.json({
        success: true,
        payload: draftResult.payload,
        validation: draftResult.validation,
        compliance: draftResult.compliance,
      });
    }

    // ─────────────────────────────────────────────
    // ACTION: APPROVE & DISPATCH EMAIL
    // ─────────────────────────────────────────────
    if (action === "approve") {
      // 1. Double check compliance before sending
      if (!draft.compliance.isCompliant) {
        return NextResponse.json({
          success: false,
          error: "Approval blocked: Draft has outstanding compliance mismatches.",
          mismatches: draft.compliance.mismatches,
        }, { status: 400 });
      }

      if (!draft.donorId) {
        return NextResponse.json({ success: false, error: "Approval failed: No donor profile linked to draft." }, { status: 400 });
      }

      // Fetch donor profile to get email
      const donorRef = doc(db, "donors", draft.donorId);
      const donorSnap = await getDoc(donorRef);
      if (!donorSnap.exists()) {
        return NextResponse.json({ success: false, error: "Approval failed: Linked donor profile was not found." }, { status: 404 });
      }
      const donor = donorSnap.data();
      const recipientEmail = donor.email;

      if (!recipientEmail) {
        return NextResponse.json({ success: false, error: "Approval failed: Donor has no registered email address." }, { status: 400 });
      }

      // 2. Wrap AI payload into Daarayn's signature dark glassmorphism template
      const formattedBody = draft.payload.body
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

      const emailHtml = generateLetterEmailTemplate({
        title: draft.payload.subject,
        eyebrow: "COMMUNICATION",
        headline: draft.payload.subject,
        greeting: draft.payload.greeting,
        bodyParagraphs: [formattedBody],
        dua: draft.payload.dua ? { arabic: draft.payload.dua, english: "" } : undefined,
        ctaLink: draft.payload.cta ? `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/donor/dashboard` : undefined,
        ctaText: draft.payload.cta || undefined,
        signOff: "With gratitude,\nThe Daarayn Foundation team"
      });

      // 3. Send email using abstract email provider layer
      const emailResult = await sendEmail({
        to: recipientEmail,
        subject: draft.payload.subject,
        html: emailHtml,
      });

      let deliveryStatus = "sent";
      let providerMessageId = "";
      let failureReason = "";

      if (emailResult.success) {
        providerMessageId = emailResult.providerMessageId || "unknown";
      } else {
        deliveryStatus = "failed";
        failureReason = emailResult.error || "Mail transmission failed.";
      }

      // 4. Create communication audit log (COMM-xxxx)
      const commId = `COMM-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const newLog = {
        id: commId,
        donorId: draft.donorId,
        donorEmail: recipientEmail,
        subject: draft.payload.subject,
        message: draft.payload.body,
        generatedByAI: true,
        aiModel: "Grok-2-1212",
        aiDraftId: draft.id,
        approvedByAdmin: true,
        approvedBy: adminEmail || "admin@daarayn.org",
        approvedAt: new Date().toISOString(),
        sentDate: new Date().toISOString(),
        deliveryStatus,
        openStatus: "unread",
        clickStatus: "none",
        provider: process.env.EMAIL_PROVIDER || "gmail",
        providerMessageId,
        failureReason,
      };

      // Save COMM audit log globally
      await setDoc(doc(db, "communications", commId), newLog);

      // Append to donor record list
      await updateDoc(donorRef, {
        communicationHistory: arrayUnion(newLog),
      });

      // 5. Update AI draft status to approved
      await updateDoc(draftRef, {
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: adminEmail || "admin@daarayn.org",
        communicationId: commId,
      });

      return NextResponse.json({
        success: true,
        communicationId: commId,
        deliveryStatus,
      });
    }

    // ─────────────────────────────────────────────
    // ACTION: REJECT / CANCEL
    // ─────────────────────────────────────────────
    if (action === "reject" || action === "cancel") {
      await updateDoc(draftRef, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancelledBy: adminEmail || "admin@daarayn.org",
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: `Invalid action: "${action}"` }, { status: 400 });
  } catch (error) {
    console.error("[DraftPATCHAPI] Error:", error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
