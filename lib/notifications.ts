import { db } from "./firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export type NotificationCategory =
  | "field_reports"
  | "conversations"
  | "donors"
  | "donations"
  | "causes_campaigns"
  | "communications"
  | "executive_reports";

export interface AdminNotification {
  notificationId?: string;
  category: NotificationCategory;
  title: string;
  description: string;
  entityType: string;       // e.g. "FieldReport", "Donation", "Donor"
  entityId: string;         // e.g. "FR-2026-000042"
  createdAt: string;        // ISO string
  createdBy: string;        // "System" | admin name
  isRead: boolean;
  readAt?: string;
  actionUrl: string;        // e.g. "/admin/field-ops"
  priority: "high" | "normal" | "low";
  metadata?: Record<string, any>;
}

export const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; icon: string; color: string; href: string }
> = {
  field_reports: {
    label: "Field Reports",
    icon: "📍",
    color: "blue",
    href: "/admin/field-ops",
  },
  conversations: {
    label: "Conversations",
    icon: "💬",
    color: "purple",
    href: "/admin/field-ops",
  },
  donors: {
    label: "Donors",
    icon: "👥",
    color: "emerald",
    href: "/admin/donors",
  },
  donations: {
    label: "Donations",
    icon: "💰",
    color: "yellow",
    href: "/admin/donations",
  },
  causes_campaigns: {
    label: "Causes & Campaigns",
    icon: "🎯",
    color: "red",
    href: "/admin/causes",
  },
  communications: {
    label: "Communications",
    icon: "📢",
    color: "orange",
    href: "/admin/communications",
  },
  executive_reports: {
    label: "Executive Reports",
    icon: "📊",
    color: "indigo",
    href: "/admin/dashboard",
  },
};

// ─────────────────────────────────────────────────────────
//  ENGINE: publishNotification
//  Call this from any module to emit a business event.
// ─────────────────────────────────────────────────────────

export async function publishNotification(
  payload: Omit<AdminNotification, "notificationId" | "createdAt" | "isRead">
): Promise<void> {
  try {
    const notification: Omit<AdminNotification, "notificationId"> = {
      ...payload,
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    await addDoc(collection(db, "admin_notifications"), notification);
  } catch (err) {
    // Never throw — notification failures must not break primary flows
    console.warn("[NotificationEngine] Failed to publish:", err);
  }
}

// ─────────────────────────────────────────────────────────
//  HELPERS: pre-built publisher functions per domain
// ─────────────────────────────────────────────────────────

/** Field Reports */
export const notifyFieldReport = {
  newSubmission: (reportId: string, agentId: string, title: string, agentName: string, urgency: string) =>
    publishNotification({
      category: "field_reports",
      title: urgency === "High" ? "🚨 Urgent Report Submitted" : "New Field Report Submitted",
      description: `${agentName} submitted: "${title}"`,
      entityType: "FieldReport",
      entityId: reportId,
      createdBy: agentName,
      actionUrl: `/admin/field-ops?agentId=${agentId}&reportId=${reportId}`,
      priority: urgency === "High" ? "high" : "normal",
      metadata: { urgency, agentId },
    }),
  approved: (reportId: string, agentId: string, title: string) =>
    publishNotification({
      category: "field_reports",
      title: "Report Approved",
      description: `"${title}" has been approved and is ready for conversion.`,
      entityType: "FieldReport",
      entityId: reportId,
      createdBy: "System",
      actionUrl: `/admin/field-ops?agentId=${agentId}&reportId=${reportId}`,
      priority: "normal",
      metadata: { agentId },
    }),
  rejected: (reportId: string, agentId: string, title: string) =>
    publishNotification({
      category: "field_reports",
      title: "Report Rejected",
      description: `"${title}" has been rejected.`,
      entityType: "FieldReport",
      entityId: reportId,
      createdBy: "System",
      actionUrl: `/admin/field-ops?agentId=${agentId}&reportId=${reportId}`,
      priority: "low",
      metadata: { agentId },
    }),
  converted: (reportId: string, causeId: string, title: string) =>
    publishNotification({
      category: "field_reports",
      title: "Report Converted to Cause",
      description: `"${title}" converted to cause ${causeId}.`,
      entityType: "FieldReport",
      entityId: reportId,
      createdBy: "System",
      actionUrl: `/admin/causes/${causeId}`,
      priority: "normal",
      metadata: { causeId },
    }),
};

/** Conversations */
export const notifyConversation = {
  newMessage: (convId: string, agentId: string, agentName: string, preview: string) =>
    publishNotification({
      category: "conversations",
      title: `New Message from ${agentName}`,
      description: preview.length > 80 ? preview.slice(0, 77) + "..." : preview,
      entityType: "FieldConversation",
      entityId: convId,
      createdBy: agentName,
      actionUrl: `/admin/field-ops?agentId=${agentId}&convId=${convId}`,
      priority: "normal",
      metadata: { agentName, agentId },
    }),
  urgent: (convId: string, agentName: string) =>
    publishNotification({
      category: "conversations",
      title: "🚨 Urgent Conversation Escalated",
      description: `${agentName} has escalated a conversation as urgent.`,
      entityType: "FieldConversation",
      entityId: convId,
      createdBy: agentName,
      actionUrl: "/admin/field-ops",
      priority: "high",
    }),
};

/** Donors */
export const notifyDonor = {
  newRegistration: (donorId: string, donorName: string) =>
    publishNotification({
      category: "donors",
      title: "New Donor Registered",
      description: `${donorName} has joined as a new donor.`,
      entityType: "Donor",
      entityId: donorId,
      createdBy: "System",
      actionUrl: `/admin/donors/${donorId}`,
      priority: "normal",
      metadata: { donorName },
    }),
  returningDonor: (donorId: string, donorName: string, totalDonations: number) =>
    publishNotification({
      category: "donors",
      title: "Returning Donor",
      description: `${donorName} has donated again. Total donations: ${totalDonations}.`,
      entityType: "Donor",
      entityId: donorId,
      createdBy: "System",
      actionUrl: `/admin/donors/${donorId}`,
      priority: "normal",
    }),
  majorDonor: (donorId: string, donorName: string, amount: number) =>
    publishNotification({
      category: "donors",
      title: "⭐ Major Donor Activity",
      description: `${donorName} donated ₹${amount.toLocaleString()}. This is a high-value donation.`,
      entityType: "Donor",
      entityId: donorId,
      createdBy: "System",
      actionUrl: `/admin/donors/${donorId}`,
      priority: "high",
      metadata: { amount },
    }),
};

/** Donations */
export const notifyDonation = {
  received: (donationId: string, donorName: string, amount: number, currency: string) =>
    publishNotification({
      category: "donations",
      title: "New Donation Received",
      description: `${donorName} donated ${currency} ${amount.toLocaleString()}.`,
      entityType: "Donation",
      entityId: donationId,
      createdBy: "System",
      actionUrl: `/admin/donations`,
      priority: amount >= 50000 ? "high" : "normal",
      metadata: { amount, currency, donorName },
    }),
  largeDonation: (donationId: string, donorName: string, amount: number, currency: string) =>
    publishNotification({
      category: "donations",
      title: "💎 Large Donation Received",
      description: `${donorName} made a major donation of ${currency} ${amount.toLocaleString()}.`,
      entityType: "Donation",
      entityId: donationId,
      createdBy: "System",
      actionUrl: `/admin/donations`,
      priority: "high",
      metadata: { amount, currency },
    }),
  verificationPending: (donationId: string, donorName: string, amount: number) =>
    publishNotification({
      category: "donations",
      title: "Donation Verification Pending",
      description: `${donorName}'s donation of ₹${amount.toLocaleString()} requires verification.`,
      entityType: "Donation",
      entityId: donationId,
      createdBy: "System",
      actionUrl: `/admin/donations`,
      priority: "normal",
    }),
  allocationPending: (donationId: string, causeName: string, amount: number) =>
    publishNotification({
      category: "donations",
      title: "Allocation Pending",
      description: `₹${amount.toLocaleString()} is pending allocation to "${causeName}".`,
      entityType: "Donation",
      entityId: donationId,
      createdBy: "System",
      actionUrl: `/admin/donations`,
      priority: "low",
      metadata: { causeName },
    }),
};

/** Causes & Campaigns */
export const notifyCause = {
  created: (causeId: string, title: string) =>
    publishNotification({
      category: "causes_campaigns",
      title: "New Cause Created",
      description: `"${title}" has been created as a draft cause.`,
      entityType: "Cause",
      entityId: causeId,
      createdBy: "System",
      actionUrl: `/admin/causes/${causeId}`,
      priority: "normal",
    }),
  published: (causeId: string, title: string) =>
    publishNotification({
      category: "causes_campaigns",
      title: "Cause Published",
      description: `"${title}" is now live and accepting donations.`,
      entityType: "Cause",
      entityId: causeId,
      createdBy: "System",
      actionUrl: `/admin/causes/${causeId}`,
      priority: "normal",
    }),
  goalAchieved: (causeId: string, title: string, goal: number) =>
    publishNotification({
      category: "causes_campaigns",
      title: "🎉 Funding Goal Achieved",
      description: `"${title}" has reached its ₹${goal.toLocaleString()} funding goal!`,
      entityType: "Cause",
      entityId: causeId,
      createdBy: "System",
      actionUrl: `/admin/causes/${causeId}`,
      priority: "high",
      metadata: { goal },
    }),
};

/** Communications */
export const notifyCommunication = {
  sent: (commId: string, subject: string, recipientCount: number) =>
    publishNotification({
      category: "communications",
      title: "Communication Sent",
      description: `"${subject}" sent to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}.`,
      entityType: "Communication",
      entityId: commId,
      createdBy: "System",
      actionUrl: "/admin/communications",
      priority: "low",
    }),
  failed: (commId: string, subject: string) =>
    publishNotification({
      category: "communications",
      title: "⚠️ Communication Failed",
      description: `"${subject}" failed to send. Please retry.`,
      entityType: "Communication",
      entityId: commId,
      createdBy: "System",
      actionUrl: "/admin/communications",
      priority: "high",
    }),
};

/** Executive Reports */
export const notifyExecutive = {
  dailyBrief: () =>
    publishNotification({
      category: "executive_reports",
      title: "Daily Executive Brief Ready",
      description: "Your daily operations summary is available for review.",
      entityType: "ExecutiveReport",
      entityId: `BRIEF-${new Date().toISOString().split("T")[0]}`,
      createdBy: "KHIDR AI",
      actionUrl: "/admin/dashboard",
      priority: "normal",
    }),
  ledgerUpdated: (ledgerId: string) =>
    publishNotification({
      category: "executive_reports",
      title: "Public Ledger Updated",
      description: "The public ledger has been updated with the latest donation records.",
      entityType: "Ledger",
      entityId: ledgerId,
      createdBy: "System",
      actionUrl: "/admin/ledger",
      priority: "low",
    }),
};
