import { donationRepository } from "../repositories/donationRepository";
import { donorRepository } from "../repositories/donorRepository";
import { causeRepository } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { donationCauseRepository, designationsForSelection } from "../repositories/donationCauseRepository";
import { driveService } from "../google/drive";
import { realtimeBroadcaster, type PublishResult } from "../realtime/broadcaster";
import { RealtimeEvent } from "../realtime/events";
import { sendDonationEmail } from "../email";
import { contactKeys } from "../donors/normalize";
import { normalizeSelection, SelectionError, type NormalizedSelection } from "../donations/selection";

import { Donation, DonorProfile } from "../db";

export interface ProcessDonationInput {
  donorName: string;
  donorContact: string;
  upiRef?: string;
  amount: number;
  currency?: string;
  /** Display text of the cause choice (kept for older clients). */
  cause: string;
  /** Raw selection from the browser (ids or {causeId, causeName}). Any amounts in it are ignored. */
  selectedCauses?: unknown;
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
  /** "complete", or "partial" with the follow-up steps that still need recovery (see donationRecovery). */
  operationStatus?: "complete" | "partial";
  pendingSteps?: string[];
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

/** Proof upload failed; maps to HTTP 503 and nothing was recorded. */
export class ProofStorageError extends Error {}

export const FOLLOW_UP_STEPS = ["designations", "notification", "audit"] as const;

async function resolveSelection(input: ProcessDonationInput): Promise<NormalizedSelection> {
  try {
    return normalizeSelection(input.selectedCauses, await causeRepository.getAll());
  } catch (err) {
    if (!(err instanceof SelectionError)) throw err;
    // The catalog cache may predate a newly activated cause on this instance: confirm against fresh data once.
    try {
      return normalizeSelection(input.selectedCauses, await causeRepository.getAll(true));
    } catch (again) {
      if (again instanceof SelectionError) throw new DonationInputError(again.message);
      throw again;
    }
  }
}

export class DonationService {
  /**
   * Records a donation submitted through the public website (Google Sheets + Google Drive).
   *
   * One canonical donation row is written and confirmed first. Everything that follows (cause relationships,
   * notification, audit, realtime, e-mail) is a separate Sheets write. The donation row carries `opStatus`/`opPending`
   * so an interrupted run is visible and `donationRecovery` can finish it idempotently. The response never claims
   * "complete" unless every follow-up step succeeded.
   *
   * New donations are "pending" until an admin verifies them, so they do not add to verified totals.
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

    // 0. Validate the cause selection against the live catalog BEFORE anything is stored.
    const selection = await resolveSelection(input);
    const single = selection.causes.length === 1 ? selection.causes[0] : null;
    const causeTitle = single ? single.causeTitle : selection.causes.length > 1 ? "Multiple Causes" : input.cause || "General Donation";

    // 1. Upload the payment proof. Filed under the submission key because the donation id is only final once the row is confirmed.
    let proofDriveFileId = "";
    if (input.screenshotBuffer && input.screenshotBuffer.length > 0) {
      try {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const filename = input.screenshotFilename || `proof-${uniqueSuffix}.png`;
        const mimeType = input.screenshotMimeType || "image/png";
        const proofMetadata = await driveService.uploadFile(input.screenshotBuffer, filename, mimeType, "Payment Proofs", submissionKey, input.donorName || "Anonymous");
        proofDriveFileId = proofMetadata.drive_file_id;
      } catch (driveErr: any) {
        // Payment proof is the evidence the admin verifies against. Fail BEFORE writing anything so the donor can retry.
        console.error("[DonationService] Google Drive upload failed:", driveErr.message);
        throw new ProofStorageError("Your payment proof could not be stored right now. Please try again in a few minutes.");
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
      donationPreference: causeTitle,
      communicationPreference: isEmail ? "Email" : "WhatsApp",
      dateJoined: nowIso,
      // Legacy counters/lists are no longer maintained: history and totals are derived from canonical donation rows.
      totalDonations: 0,
      totalAmountDonated: 0,
      projectsSupportedCount: 0,
      casesSupportedCount: 0,
      donationHistory: [],
      projectsSupported: [],
      casesSupported: [],
      status: "active",
    }));
    const donor: DonorProfile = foundDonor;

    // 3. Record the donation under a confirmed-unique id (the selection is stored on the row so recovery can rebuild relationships)
    const { directAid, opsCost } = allocationSplits(numAmount);
    const { donation, duplicate, rowNumber: donationRow } = await donationRepository.createWithUniqueId(
      (id): Donation => ({
        id,
        donorId: donor.id,
        donorName: donorNameClean,
        donorEmail: donor.email || "",
        amount: numAmount,
        currency: input.currency || "INR",
        date: nowIso,
        status: "pending",
        paymentMethod: "UPI",
        donationType: causeTitle,
        // A multi-cause donation is NOT attributed to any single cause; relationships live in Donation_Causes.
        causeId: single ? single.causeId : "",
        causeTitle,
        proofDriveFileId,
        transactionReference: input.upiRef || "",
        notes: `Allocation split: Direct Aid INR ${directAid}, Ops INR ${opsCost}`,
        selectedCauses: [],
        selection: selection.causes.map((c) => ({ causeId: c.causeId, causeName: c.causeTitle })),
        opStatus: "pending",
        opPending: FOLLOW_UP_STEPS.join(","),
      }),
      submissionKey
    );
    const trackingId = donation.id;

    if (duplicate) {
      // This request uploaded its own copy of the proof before the duplicate was known; the recorded donation points at
      // another one. Remove only the redundant upload (best effort: a failure here must never fail the donor's request).
      if (proofDriveFileId && proofDriveFileId !== donation.proofDriveFileId) {
        await driveService.deleteFile(proofDriveFileId).catch((err: any) =>
          console.warn("[DonationService] Could not remove a redundant proof upload:", err?.message)
        );
      }
      // Already recorded. If its follow-up work was interrupted it stays visible as pending/partial for recovery.
      return {
        success: true,
        trackingId,
        donorId: donation.donorId,
        donationId: trackingId,
        proofDriveFileId: donation.proofDriveFileId,
        duplicate: true,
        operationStatus: donation.opStatus === "pending" || donation.opStatus === "partial" ? "partial" : "complete",
      };
    }

    const pending = new Set<string>(FOLLOW_UP_STEPS);

    // 4. Cause relationships (one batched write; idempotent, so recovery can repeat it safely)
    try {
      await donationCauseRepository.createMissing(designationsForSelection({ id: trackingId, amount: numAmount }, selection.causes, nowIso));
      pending.delete("designations");
    } catch (err: any) {
      console.error(`[DonationService] Cause relationships for ${trackingId} failed:`, err.message);
    }

    // 5. Admin notification
    try {
      await notificationRepository.append({
        id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        recipientType: "Admin",
        recipientId: "all",
        type: "DONATION",
        title: "New Donation Received",
        message: `Received ₹${numAmount.toLocaleString()} for ${causeTitle} from ${donorNameClean}${input.upiRef ? ` (Ref: ${input.upiRef})` : ""} — awaiting verification`,
        read: false,
        relatedEntityId: trackingId,
        createdAt: nowIso,
      });
      pending.delete("notification");
    } catch (err: any) {
      console.error(`[DonationService] Notification for ${trackingId} failed:`, err.message);
    }

    // 6. Audit log
    try {
      await auditLogRepository.append({
        id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        actor_id: donor.id,
        actor_role: "donor",
        action: "SUBMIT_DONATION",
        entity_type: "Donation",
        entity_id: trackingId,
        before_state: null,
        after_state: { amount: numAmount, cause: causeTitle, causes: selection.causes.map((c) => c.causeId), trackingId, proofDriveFileId, transactionReference: input.upiRef || "", submissionKey },
        timestamp: nowIso,
        source: "web_donation_gateway",
      });
      pending.delete("audit");
    } catch (err: any) {
      console.error(`[DonationService] Audit log for ${trackingId} failed:`, err.message);
    }

    // 7. Tell every connected admin. All events of this operation go to the shared log in ONE write.
    const event = await realtimeBroadcaster.publishBatch([
      { type: RealtimeEvent.DONATION_CREATED, payload: { id: trackingId, status: "pending" } },
      ...(donorCreated ? [{ type: RealtimeEvent.DONOR_UPDATED, payload: { id: donor.id } }] : []),
      { type: RealtimeEvent.NOTIFICATION_CREATED, payload: { relatedEntityId: trackingId } },
    ]);

    // 8. Donor e-mail receipt (acknowledges the submission; never prints an amount per cause unless one was recorded)
    let confirmationEmailSent = false;
    let confirmationEmailError: string | undefined;
    if (donor.email) {
      try {
        const formattedDate = `${String(new Date().getDate()).padStart(2, "0")}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`;
        const structuredCauses = selection.causes.length
          ? selection.causes.map((c) => ({ causeName: c.causeTitle, allocatedAmount: single ? numAmount : undefined }))
          : [{ causeName: causeTitle, allocatedAmount: numAmount }];
        const emailResult = await sendDonationEmail({ trackingId, donorName: donorNameClean, donorEmail: donor.email, amount: numAmount, causes: structuredCauses, date: formattedDate });
        if (emailResult.success) {
          confirmationEmailSent = true;
        } else {
          confirmationEmailError = emailResult.error || "Unknown email send error";
          console.error(`[DonationService] Email send failed for ${trackingId}: ${confirmationEmailError}`);
        }
      } catch (emailErr: any) {
        confirmationEmailError = emailErr?.message || "Exception during email send";
        console.error(`[DonationService] Email exception for ${trackingId}:`, emailErr);
      }
      donation.confirmationEmailSent = confirmationEmailSent;
      donation.confirmationEmailSentAt = confirmationEmailSent ? new Date().toISOString() : undefined;
      donation.confirmationEmailError = confirmationEmailError;
      donation.confirmationEmailRetryCount = 1;
    }

    // 9. One final write: e-mail outcome AND the follow-up state. Only now is the operation "complete".
    const pendingSteps = [...pending];
    donation.opStatus = pendingSteps.length ? "partial" : "complete";
    donation.opPending = pendingSteps.join(",");
    try {
      await donationRepository.saveAtRow(donationRow, donation, submissionKey);
    } catch (updateErr: any) {
      // The row stays "pending": the operation is identifiable and recoverable.
      console.error(`[DonationService] Failed to record completion state for ${trackingId}:`, updateErr?.message);
      return {
        success: true,
        trackingId,
        donorId: donor.id,
        donationId: trackingId,
        proofDriveFileId,
        realtime: event.delivered,
        confirmationEmailSent,
        confirmationEmailError: confirmationEmailError || undefined,
        operationStatus: "partial",
        pendingSteps: pendingSteps.length ? pendingSteps : ["completion-record"],
      };
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
      operationStatus: pendingSteps.length ? "partial" : "complete",
      pendingSteps: pendingSteps.length ? pendingSteps : undefined,
    };
  }
}

export const donationService = new DonationService();
