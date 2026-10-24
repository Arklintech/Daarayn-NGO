import { donationRepository } from "../repositories/donationRepository";
import { donorRepository } from "../repositories/donorRepository";
import { causeRepository } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { driveService } from "../google/drive";
import { realtimeBroadcaster, type PublishResult } from "../realtime/broadcaster";
import { RealtimeEvent } from "../realtime/events";
import { resolveCauseId } from "../donations/metrics";
import { sendDonationEmail } from "../email";
import { contactKeys } from "../donors/normalize";

import { Donation, DonorProfile } from "../db";

export interface ProcessDonationInput {
  donorName: string;
  donorContact: string;
  upiRef?: string;
  amount: number;
  currency?: string;
  cause: string;
  selectedCauses?: string[];
  screenshotBuffer?: Buffer;
  screenshotFilename?: string;
  screenshotMimeType?: string;
  /** Identifies one submission so retries and double-submits are not recorded twice. */
  submissionKey?: string;
}

export interface ProcessDonationResult {
  success: boolean;
  trackingId: string;
  donorId: string;
  donationId: string;
  proofDriveFileId?: string;
  /** True when this submission had already been recorded; nothing new was written. */
  duplicate?: boolean;
  realtime?: PublishResult["delivered"];
  error?: string;
  /** Email confirmation delivery status */
  confirmationEmailSent?: boolean;
  confirmationEmailError?: string;
}

/** Fixed operating split recorded in each donation's notes (90% direct aid, 10% operations). */
function allocationSplits(amount: number) {
  return { directAid: Math.floor(amount * 0.9), opsCost: Math.floor(amount * 0.1) };
}

function newSubmissionKey() {
  return `SUB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A submission the donor can correct; reported as HTTP 400, not a server fault. */
export class DonationInputError extends Error {}

export class DonationService {
  /**
   * Records a donation submitted through the public website (Google Sheets +
   * Google Drive). The donation row is written and confirmed before anything
   * that refers to it, and the realtime event is published only after that.
   *
   * New donations are "pending" until an admin verifies them, so this does
   * not add to donor or cause totals: those are derived from verified
   * donation records (lib/donations/metrics.ts).
   */
  public async processDonation(input: ProcessDonationInput): Promise<ProcessDonationResult> {
    const numAmount = Number(input.amount);
    if (!numAmount || numAmount <= 0) {
      throw new Error("Invalid donation amount.");
    }
    if (!contactKeys(input.donorContact).email && !contactKeys(input.donorContact).phone) {
      throw new DonationInputError("A valid email address or phone number is required.");
    }
    const submissionKey = (input.submissionKey || "").trim().slice(0, 100) || newSubmissionKey();

    // 1. Upload the payment proof. Filed under the submission key because the
    //    donation id is only final once the row is confirmed below.
    let proofDriveFileId = "";
    if (input.screenshotBuffer && input.screenshotBuffer.length > 0) {
      try {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const filename = input.screenshotFilename || `proof-${uniqueSuffix}.png`;
        const mimeType = input.screenshotMimeType || "image/png";
        const proofMetadata = await driveService.uploadFile(
          input.screenshotBuffer,
          filename,
          mimeType,
          "Payment Proofs",
          submissionKey,
          input.donorName || "Anonymous"
        );
        proofDriveFileId = proofMetadata.drive_file_id;
      } catch (driveErr: any) {
        // The donation is still recorded; the admin sees "No file" and can verify directly.
        console.error("[DonationService] Google Drive upload failed:", driveErr.message);
      }
    }

    // 2. Resolve or create the donor profile (one permanent Donor Token per person)
    const contact = (input.donorContact || "").trim();
    const keys = contactKeys(contact);
    const isEmail = !!keys.email;
    const donorNameClean = input.donorName?.trim() || "Generous Donor";
    const nowIso = new Date().toISOString();

    const { donor: foundDonor, created: donorCreated } = await donorRepository.findOrCreateByContact(contact, (id) => ({
      id,
      name: donorNameClean,
      email: keys.email,
      phone: isEmail ? "" : keys.phone,
      country: "India",
      city: "",
      donationPreference: input.cause || "General Fund",
      communicationPreference: isEmail ? "Email" : "WhatsApp",
      dateJoined: nowIso,
      // Legacy counters, no longer maintained: giving is derived from verified donations.
      totalDonations: 0,
      totalAmountDonated: 0,
      projectsSupportedCount: 1,
      casesSupportedCount: 0,
      donationHistory: [],
      projectsSupported: [input.cause],
      casesSupported: [],
      status: "active",
    }));
    const donor: DonorProfile = foundDonor;

    // 3. Record the donation under a confirmed-unique id
    const causes = await causeRepository.getAll();
    const picked = Array.isArray(input.selectedCauses) && input.selectedCauses.length === 1 ? (input.selectedCauses[0] as any) : null;
    const matchedCauseId = resolveCauseId({ causeId: picked?.causeId, causeTitle: input.cause }, causes);
    const { directAid, opsCost } = allocationSplits(numAmount);
    const donorRef = donor;

    const { donation, duplicate } = await donationRepository.createWithUniqueId(
      (id): Donation => ({
        id,
        donorId: donorRef.id,
        donorName: donorNameClean,
        donorEmail: donorRef.email || "",
        amount: numAmount,
        currency: input.currency || "INR",
        date: nowIso,
        status: "pending",
        paymentMethod: "UPI",
        donationType: input.cause,
        causeId: matchedCauseId || "",
        causeTitle: input.cause,
        proofDriveFileId,
        transactionReference: input.upiRef || "",
        notes: `Allocation split: Direct Aid INR ${directAid}, Ops INR ${opsCost}`,
        selectedCauses: [],
      }),
      submissionKey
    );
    const trackingId = donation.id;

    if (duplicate) {
      // Already recorded (and its notification, receipt and event already sent).
      return { success: true, trackingId, donorId: donation.donorId, donationId: trackingId, proofDriveFileId: donation.proofDriveFileId, duplicate: true };
    }

    // 4. Link the donation to the donor profile (relationship lists only)
    try {
      if (!donor.donationHistory) donor.donationHistory = [];
      if (!donor.donationHistory.includes(trackingId)) donor.donationHistory.push(trackingId);
      if (!donor.projectsSupported) donor.projectsSupported = [];
      if (!donor.projectsSupported.includes(input.cause)) donor.projectsSupported.push(input.cause);
      donor.projectsSupportedCount = donor.projectsSupported.length;
      await donorRepository.save(donor);
    } catch (err: any) {
      // Giving totals come from the donation row's donorId, so this list is informational.
      console.error(`[DonationService] Could not update donation history for ${donor.id}:`, err.message);
    }

    // 5. Tell every connected admin. Clients re-read the figures through the API.
    const event = await realtimeBroadcaster.publish(RealtimeEvent.DONATION_CREATED, { id: trackingId, status: "pending" });
    if (donorCreated) realtimeBroadcaster.broadcast(RealtimeEvent.DONOR_UPDATED, { id: donor.id });

    // 6. Admin notification
    try {
      await notificationRepository.save({
        id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        recipientType: "Admin",
        recipientId: "all",
        type: "DONATION",
        title: "New Donation Received",
        message: `Received ₹${numAmount.toLocaleString()} for ${input.cause} from ${donorNameClean}${input.upiRef ? ` (Ref: ${input.upiRef})` : ""} — awaiting verification`,
        read: false,
        relatedEntityId: trackingId,
        createdAt: nowIso,
      });
      realtimeBroadcaster.broadcast(RealtimeEvent.NOTIFICATION_CREATED, { relatedEntityId: trackingId });
    } catch (err: any) {
      console.error(`[DonationService] Notification for ${trackingId} failed:`, err.message);
    }

    // 7. Audit log
    try {
      await auditLogRepository.save({
        id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        actor_id: donor.id,
        actor_role: "donor",
        action: "SUBMIT_DONATION",
        entity_type: "Donation",
        entity_id: trackingId,
        before_state: null,
        after_state: { amount: numAmount, cause: input.cause, trackingId, proofDriveFileId, transactionReference: input.upiRef || "", submissionKey },
        timestamp: nowIso,
        source: "web_donation_gateway",
      });
    } catch (err: any) {
      console.error(`[DonationService] Audit log for ${trackingId} failed:`, err.message);
    }

    // 8. Donor email receipt (acknowledges the submission)
    let confirmationEmailSent = false;
    let confirmationEmailError: string | undefined;

    if (donor.email) {
      try {
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
        const rawCauses = input.selectedCauses && input.selectedCauses.length > 0 ? input.selectedCauses : [input.cause];
        const perCauseAmount = Math.round(numAmount / rawCauses.length);
        const structuredCauses = rawCauses.map((cName) => ({
          causeName: typeof cName === "string" ? cName : (cName as any).causeName || input.cause,
          allocatedAmount:
            typeof cName === "object" && (cName as any).allocatedAmount ? (cName as any).allocatedAmount : perCauseAmount,
        }));

        const emailResult = await sendDonationEmail({
          trackingId,
          donorName: donorNameClean,
          donorEmail: donor.email,
          amount: numAmount,
          causes: structuredCauses,
          date: formattedDate,
        });

        if (emailResult.success) {
          confirmationEmailSent = true;
          console.log(`[DonationService] Confirmation email sent for ${trackingId} to ${donor.email}`);
        } else {
          confirmationEmailError = emailResult.error || "Unknown email send error";
          console.error(`[DonationService] Email send failed for ${trackingId}: ${confirmationEmailError}`);
        }
      } catch (emailErr: any) {
        confirmationEmailError = emailErr?.message || "Exception during email send";
        console.error(`[DonationService] Email exception for ${trackingId}:`, emailErr);
      }

      // Persist email status to donation record
      try {
        donation.confirmationEmailSent = confirmationEmailSent;
        donation.confirmationEmailSentAt = confirmationEmailSent ? new Date().toISOString() : undefined;
        donation.confirmationEmailError = confirmationEmailError;
        donation.confirmationEmailRetryCount = 1;
        await donationRepository.update(donation.id, {
          confirmationEmailSent,
          confirmationEmailSentAt: donation.confirmationEmailSentAt,
          confirmationEmailError,
          confirmationEmailRetryCount: 1,
        });
      } catch (updateErr: any) {
        console.error(`[DonationService] Failed to persist email status for ${trackingId}:`, updateErr?.message);
      }
    }

    return {
      success: true,
      trackingId,
      donorId: donor.id,
      donationId: trackingId,
      proofDriveFileId,
      realtime: event.delivered,
      confirmationEmailSent,
      confirmationEmailError: confirmationEmailError || undefined,
    };
  }
}

export const donationService = new DonationService();
