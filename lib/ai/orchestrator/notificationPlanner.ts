/**
 * lib/ai/orchestrator/notificationPlanner.ts
 *
 * MIO Notification Planner.
 * Generates system notifications logs when workflows complete or fail.
 */

import { db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  category: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: string;
}

/**
 * Creates system dashboard notification log triggers.
 */
export async function pushWorkflowNotification(
  title: string,
  message: string,
  category: "info" | "success" | "warning" | "error"
): Promise<void> {
  const notificationId = `NOT-${Date.now()}`;
  const notification: SystemNotification = {
    id: notificationId,
    title,
    message,
    category,
    read: false,
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, "contactMessages", notificationId), {
      name: "KHIDR Orchestrator Alert",
      email: "khidr@daarayn.org",
      subject: `[${category.toUpperCase()}] ${title}`,
      message: message,
      date: new Date().toISOString().split("T")[0],
      read: false
    });
  } catch (error) {
    console.error("[MIO Notify] Failed to post notification log:", error);
  }
}
