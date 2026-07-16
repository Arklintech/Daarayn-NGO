/**
 * lib/ai/orchestrator/rollbackManager.ts
 *
 * MIO Rollback Manager.
 * Handles reversion of Firestore data adjustments if execution fails mid-pipeline.
 */

import { db } from "../../firebase";
import { doc, deleteDoc, updateDoc, increment, getDoc } from "firebase/firestore";
import type { ExecutionResult } from "./executionEngine";

/**
 * Reverts database adjustments made prior to a workflow execution failure.
 */
export async function rollbackWorkflowOperations(
  result: ExecutionResult,
  parameters: any
): Promise<string> {
  const revertedRecords: string[] = [];

  try {
    for (const recordPath of result.recordsCreated) {
      const [collectionName, docId] = recordPath.split("/");
      if (!collectionName || !docId) continue;

      // 1. Revert Allocation records
      if (collectionName === "allocations") {
        const allocDocRef = doc(db, "allocations", docId);
        const allocSnap = await getDoc(allocDocRef);
        if (allocSnap.exists()) {
          const data = allocSnap.data();
          const amount = data.allocatedAmount || 0;
          
          // Revert Donation unallocated balance limits
          if (data.donationId && data.donationId !== "DON-PENDING") {
            await updateDoc(doc(db, "donations", data.donationId), {
              allocatedAmount: increment(-amount),
              allocationStatus: "pending"
            });
          }

          // Revert Program raised balances
          if (data.projectId && data.projectId !== "PRG-GENERAL") {
            await updateDoc(doc(db, "programs", data.projectId), {
              amountCollected: increment(-amount)
            });
          }

          // Delete the allocation row
          await deleteDoc(allocDocRef);
          revertedRecords.push(recordPath);
        }
      }

      // 2. Revert drafts approval status back to pending
      if (collectionName === "ai_drafts") {
        await updateDoc(doc(db, "ai_drafts", docId), {
          status: "pending",
          approvedAt: null,
          approvedBy: null
        });
        revertedRecords.push(recordPath);
      }
    }

    return `Rollback completed successfully. Reverted ${revertedRecords.length} records: [${revertedRecords.join(", ")}].`;
  } catch (error) {
    console.error("[MIO Rollback] Critical failure during rollback operation:", error);
    return `Rollback failed: ${(error as Error).message}. Attention: Database states might be inconsistent.`;
  }
}
