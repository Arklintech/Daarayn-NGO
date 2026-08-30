import { db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { donorRepository } from "../lib/repositories/donorRepository";
import { donationRepository } from "../lib/repositories/donationRepository";
import { causeRepository } from "../lib/repositories/causeRepository";
import { fieldReportRepository } from "../lib/repositories/fieldReportRepository";
import { communicationRepository } from "../lib/repositories/communicationRepository";
import { notificationRepository } from "../lib/repositories/notificationRepository";

import { sheetsService } from "../lib/google/sheets";

export async function runMigration() {
  console.log("=================================================");
  console.log("Starting Daarayn Firestore -> Google Sheets Migration");
  console.log("=================================================");

  // Initialize System Metadata tab (_System)
  await sheetsService.initializeSystemMetadata();

  const summary = {
    donors: { firestore: 0, sheets: 0 },
    donations: { firestore: 0, sheets: 0 },
    causes: { firestore: 0, sheets: 0 },
    fieldReports: { firestore: 0, sheets: 0 },
    communications: { firestore: 0, sheets: 0 },
    notifications: { firestore: 0, sheets: 0 },
  };

  try {
    // 1. Migrate Causes
    console.log("[Migration] Extracting 'causes' from Firestore...");
    const causesSnap = await getDocs(collection(db, "causes"));
    summary.causes.firestore = causesSnap.size;
    for (const d of causesSnap.docs) {
      const data = d.data();
      await causeRepository.save({
        id: d.id,
        title: data.title || "Untitled Cause",
        category: data.category || "General",
        targetAmount: Number(data.targetAmount || 0),
        raisedAmount: Number(data.raisedAmount || 0),
        location: data.location || "",
        description: data.description || "",
        status: data.status || "Active",
        imageUrl: data.imageUrl || "",
        createdAt: data.createdAt || new Date().toISOString(),
      });
    }
    summary.causes.sheets = (await causeRepository.getAll(true)).length;

    // 2. Migrate Donors
    console.log("[Migration] Extracting 'donors' from Firestore...");
    const donorsSnap = await getDocs(collection(db, "donors"));
    summary.donors.firestore = donorsSnap.size;
    for (const d of donorsSnap.docs) {
      const data = d.data();
      await donorRepository.save({
        id: d.id,
        name: data.name || "Anonymous Donor",
        email: data.email || "",
        phone: data.phone || "",
        country: data.country || "IN",
        city: data.city || "Unknown",
        donationPreference: data.donationPreference || "General Support",
        communicationPreference: data.communicationPreference || "Email",
        dateJoined: data.dateJoined || new Date().toISOString(),
        totalDonations: Number(data.totalDonations || 0),
        totalAmountDonated: Number(data.totalAmountDonated || 0),
        projectsSupportedCount: Number(data.projectsSupportedCount || 0),
        casesSupportedCount: Number(data.casesSupportedCount || 0),
        donationHistory: Array.isArray(data.donationHistory) ? data.donationHistory : [],
        projectsSupported: Array.isArray(data.projectsSupported) ? data.projectsSupported : [],
        casesSupported: Array.isArray(data.casesSupported) ? data.casesSupported : [],
        status: data.status || "active",
      });
    }
    summary.donors.sheets = (await donorRepository.getAll(true)).length;

    // 3. Migrate Donations
    console.log("[Migration] Extracting 'donations' from Firestore...");
    const donationsSnap = await getDocs(collection(db, "donations"));
    summary.donations.firestore = donationsSnap.size;
    for (const d of donationsSnap.docs) {
      const data = d.data();
      await donationRepository.save({
        id: d.id,
        donorId: data.donorId || "",
        donorName: data.donorName || "Anonymous",
        donorEmail: data.donorEmail || "",
        amount: Number(data.amount || 0),
        currency: data.currency || "INR",
        date: data.date || new Date().toISOString(),
        status: data.status || "Completed",
        paymentMethod: data.paymentMethod || "UPI",
        donationType: data.donationType || data.causeTitle || "General",
        selectedCauses: Array.isArray(data.selectedCauses) ? data.selectedCauses : [],
        causeId: data.causeId || "",
        causeTitle: data.causeTitle || "",
        proofDriveFileId: data.proofDriveFileId || data.receiptUrl || "",
        transactionReference: data.transactionReference || "",
        notes: data.notes || "",
      });
    }
    summary.donations.sheets = (await donationRepository.getAll(true)).length;

    // 4. Migrate Field Reports
    console.log("[Migration] Extracting 'field_reports' from Firestore...");
    const reportsSnap = await getDocs(collection(db, "field_reports"));
    summary.fieldReports.firestore = reportsSnap.size;
    for (const d of reportsSnap.docs) {
      const data = d.data();
      await fieldReportRepository.save({
        id: d.id,
        agentId: data.agentId || "",
        agentName: data.agentName || "",
        category: data.category || "General",
        title: data.title || "",
        description: data.description || "",
        urgency: data.urgency || "Medium",
        estimatedBudget: data.estimatedBudget || "₹0",
        location: data.location || { country: "India", state: "", district: "", village: "" },
        beneficiaries: data.beneficiaries || { families: 0, children: 0, women: 0, elderly: 0, description: "" },
        media: data.media || [],
        documents: data.documents || [],
        status: data.status || "Pending Review",
        timelineStages: data.timelineStages || {},
        assignedTo: data.assignedTo || "",
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      } as any);
    }
    summary.fieldReports.sheets = (await fieldReportRepository.getAll(true)).length;

    // 5. Migrate Communications
    console.log("[Migration] Extracting 'communications' from Firestore...");
    const commsSnap = await getDocs(collection(db, "communications"));
    summary.communications.firestore = commsSnap.size;
    for (const d of commsSnap.docs) {
      const data = d.data();
      await communicationRepository.save({
        id: d.id,
        type: data.type || "Email",
        subject: data.subject || "",
        bodyText: data.bodyText || "",
        selectedCauses: Array.isArray(data.selectedCauses) ? data.selectedCauses : [],
        recipientCount: Number(data.recipientCount || 0),
        sentCount: Number(data.sentCount || 0),
        failedCount: Number(data.failedCount || 0),
        status: data.status || "Completed",
        createdBy: data.createdBy || "Admin",
        createdAt: data.createdAt || new Date().toISOString(),
        completedAt: data.completedAt || "",
      });
    }
    summary.communications.sheets = (await communicationRepository.getAll(true)).length;

    // 6. Migrate Notifications
    console.log("[Migration] Extracting 'admin_notifications' & 'field_notifications' from Firestore...");
    const notifsSnap = await getDocs(collection(db, "admin_notifications"));
    summary.notifications.firestore = notifsSnap.size;
    for (const d of notifsSnap.docs) {
      const data = d.data();
      await notificationRepository.save({
        id: d.id,
        recipientType: "Admin",
        recipientId: data.recipientId || "all",
        type: data.type || "info",
        title: data.title || "",
        message: data.message || "",
        read: Boolean(data.read),
        relatedEntityId: data.relatedEntityId || "",
        createdAt: data.createdAt || new Date().toISOString(),
      });
    }
    summary.notifications.sheets = (await notificationRepository.getAll(true)).length;

    console.log("=================================================");
    console.log("Migration Complete! Record Summary:");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=================================================");

    return summary;
  } catch (err: any) {
    console.error("[Migration] Error during migration:", err.message);
    throw err;
  }
}
