import { donationRepository } from "../repositories/donationRepository";
import { donorRepository } from "../repositories/donorRepository";
import { causeRepository } from "../repositories/causeRepository";
import { auditLogRepository } from "../repositories/auditLogRepository";
import { notificationRepository } from "../repositories/notificationRepository";
import { driveService, DriveFileMetadata } from "../google/drive";
import { realtimeBroadcaster } from "../realtime/broadcaster";
import { sendDonationEmail } from "../email";
import { VerifiedAnalyticsEngine } from "../ai/engines/VerifiedAnalyticsEngine";
import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";
import { Donation, DonorProfile } from "../db";

export interface ProcessDonationInput {
  donorName: string;
  donorContact: string;
  upiRef: string;
  amount: number;
  currency?: string;
  cause: string;
  selectedCauses?: string[];
  screenshotBuffer?: Buffer;
  screenshotFilename?: string;
  screenshotMimeType?: string;
}

export interface ProcessDonationResult {
  success: boolean;
  trackingId: string;
  donorId: string;
  donationId: string;
  proofDriveFileId?: string;
  error?: string;
}

export class DonationService {
  /**
   * Authoritative Donation Ingestion Service (Google Sheets + Google Drive)
   * With Safe Migration Dual-Write to Firestore Mirror
   */
  public async processDonation(input: ProcessDonationInput): Promise<ProcessDonationResult> {
    const numAmount = Number(input.amount);
    if (!numAmount || numAmount <= 0) {
      throw new Error("Invalid donation amount.");
    }
    if (!input.upiRef) {
      throw new Error("UPI reference code is required.");
    }

    // 1. Generate Authoritative Sequence / Tracking ID
    const existingDonations = await donationRepository.getAll();
    const nextIdx = existingDonations.length + 1;
    const trackingId = "DA" + String(nextIdx).padStart(3, "0");

    // 2. Process & Upload Payment Proof to Google Drive (Authoritative File Storage)
    let proofMetadata: DriveFileMetadata | null = null;
    let proofDriveFileId = "";

    if (input.screenshotBuffer && input.screenshotBuffer.length > 0) {
      try {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const filename = input.screenshotFilename || `proof-${uniqueSuffix}.png`;
        const mimeType = input.screenshotMimeType || "image/png";

        proofMetadata = await driveService.uploadFile(
          input.screenshotBuffer,
          filename,
          mimeType,
          "Payment Proofs",
          trackingId,
          input.donorName || "Anonymous"
        );
        proofDriveFileId = proofMetadata.drive_file_id;
      } catch (driveErr: any) {
        console.error("[DonationService] Google Drive upload failed:", driveErr.message);
        // Do not crash the entire donation if drive has a transient issue, but record audit warning
      }
    }

    // 3. Resolve or Create Donor Profile in Google Sheets
    const contact = (input.donorContact || "").trim();
    const isEmail = contact.includes("@");
    let donor = await donorRepository.findByContact(contact);

    const nowIso = new Date().toISOString();
    const today = new Date();
    const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
      today.getMonth() + 1
    ).padStart(2, "0")}/${today.getFullYear()}`;

    const donorNameClean = input.donorName?.trim() || "Generous Donor";

    if (!donor) {
      const newDonorId = `DNR-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substr(2, 4)
        .toUpperCase()}`;

      donor = {
        id: newDonorId,
        name: donorNameClean,
        email: isEmail ? contact : "",
        phone: !isEmail ? contact : "",
        country: "India",
        city: "",
        donationPreference: input.cause || "General Fund",
        communicationPreference: isEmail ? "Email" : "WhatsApp",
        dateJoined: nowIso,
        totalDonations: 1,
        totalAmountDonated: numAmount,
        projectsSupportedCount: 1,
        casesSupportedCount: 1,
        donationHistory: [trackingId],
        projectsSupported: [input.cause],
        casesSupported: [],
        status: "active",
      };
      await donorRepository.save(donor);
    } else {
      donor.totalDonations = (donor.totalDonations || 0) + 1;
      donor.totalAmountDonated = (donor.totalAmountDonated || 0) + numAmount;
      if (!donor.donationHistory) donor.donationHistory = [];
      if (!donor.donationHistory.includes(trackingId)) {
        donor.donationHistory.push(trackingId);
      }
      if (!donor.projectsSupported) donor.projectsSupported = [];
      if (!donor.projectsSupported.includes(input.cause)) {
        donor.projectsSupported.push(input.cause);
      }
      donor.projectsSupportedCount = donor.projectsSupported.length;
      await donorRepository.save(donor);
    }

    // 4. Calculate Verified Financial Allocation
    const { directAid, opsCost } = VerifiedAnalyticsEngine.calculateAllocationSplits(numAmount);

    // 5. Match and Update Cause in Google Sheets
    const causes = await causeRepository.getAll();
    const matchedCause = causes.find(
      (c) =>
        c.title.toLowerCase().includes(input.cause.toLowerCase()) ||
        input.cause.toLowerCase().includes(c.title.toLowerCase())
    );

    if (matchedCause) {
      matchedCause.raisedAmount = (matchedCause.raisedAmount || 0) + numAmount;
      await causeRepository.save(matchedCause);
    }

    // 6. Create Authoritative Donation Record in Google Sheets
    const donationRecord: Donation = {
      id: trackingId,
      donorId: donor.id,
      donorName: donorNameClean,
      donorEmail: donor.email || "",
      amount: numAmount,
      currency: input.currency || "INR",
      date: nowIso,
      status: "pending",
      paymentMethod: "UPI",
      donationType: input.cause,
      causeId: matchedCause?.id || "",
      causeTitle: input.cause,
      proofDriveFileId: proofDriveFileId,
      transactionReference: input.upiRef,
      notes: `Allocated via VerifiedAnalyticsEngine. Direct Aid: INR ${directAid}, Ops: INR ${opsCost}`,
      selectedCauses: (Array.isArray(input.selectedCauses) && typeof input.selectedCauses[0] === "object"
        ? input.selectedCauses
        : [{ causeId: matchedCause?.id || "general", causeName: input.cause, allocatedAmount: numAmount, percentage: 100 }]) as any,
    };

    await donationRepository.save(donationRecord);

    // 7. Temporary Dual-Write to Firestore Mirror (Migration Safety Layer)
    try {
      const firestoreLedgerRecord = {
        donor: `${donorNameClean} (UPI)`,
        cause: input.cause,
        selectedCauses: input.selectedCauses || [input.cause],
        amount: numAmount,
        directAid: directAid,
        status: "pending",
        date: formattedDate,
        refCode: input.upiRef,
        opsCost: opsCost,
        proof: proofDriveFileId ? `Drive File: ${proofDriveFileId}` : "⏳ Awaiting bank check",
        proofDriveFileId: proofDriveFileId,
        proofUrl: proofDriveFileId ? `/api/media/${proofDriveFileId}` : null,
        createdAt: nowIso,
        migratedToSheets: true,
      };

      const writePromise = setDoc(doc(db, "publicLedger", trackingId), firestoreLedgerRecord, { merge: true });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore mirror write timed out (1500ms)")), 1500)
      );
      await Promise.race([writePromise, timeoutPromise]);
    } catch (dualWriteErr: any) {
      console.warn(
        "[DonationService] Dual-write to Firestore publicLedger mirror skipped/timed out:",
        dualWriteErr.message
      );
    }

    // 8. Publish Realtime Operational Events
    realtimeBroadcaster.broadcast("DONATION_RECEIVED", {
      trackingId,
      donorId: donor.id,
      donorName: donorNameClean,
      amount: numAmount,
      currency: input.currency || "INR",
      cause: input.cause,
      proofDriveFileId,
      timestamp: nowIso,
    });

    // 9. Persist Authoritative System Notification
    const notifId = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await notificationRepository.save({
      id: notifId,
      recipientType: "Admin",
      recipientId: "all",
      type: "DONATION",
      title: "New Donation Received",
      message: `Received ₹${numAmount.toLocaleString()} for ${input.cause} from ${donorNameClean} (Ref: ${input.upiRef})`,
      read: false,
      relatedEntityId: trackingId,
      createdAt: nowIso,
    });

    // 10. Persist Authoritative Audit Log
    const auditId = `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    await auditLogRepository.save({
      id: auditId,
      actor_id: donor.id,
      actor_role: "donor",
      action: "SUBMIT_DONATION",
      entity_type: "Donation",
      entity_id: trackingId,
      before_state: null,
      after_state: {
        amount: numAmount,
        cause: input.cause,
        trackingId,
        proofDriveFileId,
        transactionReference: input.upiRef,
      },
      timestamp: nowIso,
      source: "web_donation_gateway",
    });

    // 11. Send Donor Email Receipt
    if (donor.email) {
      try {
        const rawCauses = input.selectedCauses && input.selectedCauses.length > 0 ? input.selectedCauses : [input.cause];
        const perCauseAmount = Math.round(numAmount / rawCauses.length);
        const structuredCauses = rawCauses.map((cName) => ({
          causeName: typeof cName === "string" ? cName : (cName as any).causeName || input.cause,
          allocatedAmount:
            typeof cName === "object" && (cName as any).allocatedAmount
              ? (cName as any).allocatedAmount
              : perCauseAmount,
        }));

        await sendDonationEmail({
          trackingId: trackingId,
          donorName: donorNameClean,
          donorEmail: donor.email,
          amount: numAmount,
          causes: structuredCauses,
          date: formattedDate,
        });
      } catch (emailErr: any) {
        console.error("[DonationService] Email send error:", emailErr.message);
      }
    }

    return {
      success: true,
      trackingId,
      donorId: donor.id,
      donationId: trackingId,
      proofDriveFileId,
    };
  }
}

export const donationService = new DonationService();
