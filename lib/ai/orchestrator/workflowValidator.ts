/**
 * lib/ai/orchestrator/workflowValidator.ts
 *
 * MIO Workflow Validator.
 * Audits pre-execution parameters (funds, collection links, role permissions) before sign-off.
 */

import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import type { MioActionType } from "./intentResolver";

export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

/**
 * Validates action parameters before triggering execution engines.
 */
export async function validateWorkflow(
  actionType: MioActionType,
  parameters: any,
  role: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Enforce Super Admin or Editor role check for writing changes
  const normalizedRole = (role || "public").toLowerCase().replace(/\s+/g, "_");
  if (normalizedRole !== "super_admin" && normalizedRole !== "editor") {
    errors.push(`Role permissions validation failed: "${role}" level is restricted to Inspector read operations.`);
    return { passed: false, errors };
  }

  try {
    if (actionType === "allocateDonation") {
      const { amount, projectId, donationId } = parameters;

      if (!amount || amount <= 0) {
        errors.push("Invalid allocation: Amount must be greater than ₹0.");
      }

      // If a donation ID is specified, verify it exists in Firestore
      if (donationId) {
        const donDoc = await getDoc(doc(db, "donations", donationId));
        if (!donDoc.exists()) {
          errors.push(`Reference check failed: Donation record "${donationId}" does not exist in ledger.`);
        } else {
          const donData = donDoc.data();
          const unallocatedAmount = (donData.amount || 0) - (donData.allocatedAmount || 0);
          if (amount > unallocatedAmount) {
            errors.push(`Fund validation failed: Requested allocation (₹${amount.toLocaleString()}) exceeds unallocated donation balance (₹${unallocatedAmount.toLocaleString()}).`);
          }
        }
      }

      // If a project ID is specified, verify it exists in Firestore
      if (projectId) {
        const progDoc = await getDoc(doc(db, "programs", projectId));
        if (!progDoc.exists()) {
          errors.push(`Reference check failed: Program hub "${projectId}" does not exist in databases.`);
        }
      }
    }

    else if (actionType === "publishUpdate") {
      const { projectId } = parameters;
      if (projectId) {
        const progDoc = await getDoc(doc(db, "programs", projectId));
        if (!progDoc.exists()) {
          errors.push(`Reference check failed: Target program "${projectId}" does not exist.`);
        }
      } else {
        errors.push("Validation failed: Target Program ID is required to publish updates logs.");
      }
    }

    else if (actionType === "dispatchCommunications") {
      const snap = await getDocs(collection(db, "ai_drafts"));
      const pendingCount = snap.docs.filter(d => d.data().status === "pending").length;
      if (pendingCount === 0) {
        errors.push("Queue check failed: No pending draft communications found in approval queues.");
      }
    }

  } catch (error) {
    errors.push(`System exception during pre-validation check: ${(error as Error).message}`);
  }

  return {
    passed: errors.length === 0,
    errors
  };
}
