import { GoogleSheetsClient } from "./GoogleSheetsClient";
import { logSyncAudit } from "./AuditLogger";
import { db } from "../firebase";
import { collection, doc, setDoc, getDocs, query, where, updateDoc } from "firebase/firestore";

const sheetsClient = new GoogleSheetsClient();

export interface SyncTask {
  id?: string;
  entity: string; // "donors", "donations", "allocations"
  entityId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  data: any;
  status: "PENDING" | "SYNCED" | "FAILED";
  syncAttempts: number;
  lastSyncedAt?: string;
  syncError?: string;
  createdAt: string;
}

export class SyncEngine {
  

  public static async executeSyncTask(taskId: string, task: SyncTask) {
    const startTime = Date.now();
    let success = false;
    let errorMessage = "";

    try {
      if (!sheetsClient.isConfigured()) {
        throw new Error("Google Sheets Client is not configured");
      }

      // Map Firestore Collection to Sheet Name
      const sheetMapping: Record<string, string> = {
        "donors": "Donors",
        "donations": "Donations",
        "programs": "Projects",
        "cases": "Beneficiaries",
        "causes": "Causes",
        "communications": "Communications",
        "field_agents": "Field Agents",
        "field_reports": "Field Reports",
      };

      const sheetName = sheetMapping[task.entity] || task.entity;

      // Transform object to flat map based on dynamic schema
      let headers = await sheetsClient.getHeaders(sheetName);
      
      // Initialize if empty
      if (headers.length === 0) {
        headers = ["ID"];
      }

      // Flatten data
      const flattenedData = this.flattenObject(task.data);
      // Ensure ID is always set and is column A
      flattenedData["ID"] = task.entityId;

      // Check for new headers
      let headersUpdated = false;
      for (const key of Object.keys(flattenedData)) {
        if (!headers.includes(key)) {
          headers.push(key);
          headersUpdated = true;
        }
      }

      // Ensure ID is first
      if (headers[0] !== "ID") {
        headers = ["ID", ...headers.filter(h => h !== "ID")];
        headersUpdated = true;
      }

      // If schema expanded, sync new headers
      if (headersUpdated) {
        await sheetsClient.setHeaders(sheetName, headers);
      }

      // Construct row values array aligned exactly with headers
      const rowValues = headers.map(header => flattenedData[header] || "");

      if (task.operation === "CREATE") {
        await sheetsClient.appendRow(sheetName, rowValues);
      } else if (task.operation === "UPDATE") {
        const rowIndex = await sheetsClient.findRowIndex(sheetName, task.entityId);
        if (rowIndex) {
          await sheetsClient.updateRow(sheetName, rowIndex, rowValues);
        } else {
          // If not found, append it as a fallback
          await sheetsClient.appendRow(sheetName, rowValues);
        }
      } else if (task.operation === "DELETE") {
        // We typically don't delete rows in sheets to preserve history, maybe mark as deleted
        const rowIndex = await sheetsClient.findRowIndex(sheetName, task.entityId);
        if (rowIndex) {
          await sheetsClient.updateRow(sheetName, rowIndex, [task.entityId, "DELETED"]);
        }
      }

      success = true;
    } catch (error: any) {
      success = false;
      errorMessage = error.message || "Unknown error";
    }

    const duration = Date.now() - startTime;

    // Update the task status in Firestore
    try {
      await updateDoc(doc(db, "sync_queue", taskId), {
        status: success ? "SYNCED" : "FAILED",
        syncAttempts: task.syncAttempts + 1,
        lastSyncedAt: new Date().toISOString(),
        syncError: success ? null : errorMessage,
      });

      // Audit Log
      await logSyncAudit({
        entity: task.entity,
        entityId: task.entityId,
        operation: task.operation,
        status: success ? "SUCCESS" : "FAILED",
        errorDetails: success ? undefined : errorMessage,
        syncDurationMs: duration,
      });
    } catch (dbError) {
      console.error("Failed to update sync task status:", dbError);
    }
  }

  public static async retryFailedTasks() {
    try {
      const q = query(collection(db, "sync_queue"), where("status", "==", "FAILED"));
      const snap = await getDocs(q);
      
      const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as SyncTask));
      
      for (const task of tasks) {
        if (task.id && task.syncAttempts < 5) {
          await this.executeSyncTask(task.id, task);
        }
      }
      return tasks.length;
    } catch (err) {
      console.error("Failed to retry tasks:", err);
      return 0;
    }
  }

  private static flattenObject(obj: any, prefix = ""): Record<string, string> {
    const flattened: Record<string, string> = {};

    if (obj === null || obj === undefined) return flattened;

    for (const [key, value] of Object.entries(obj)) {
      // Capitalize first letter and add space before caps for nice headers
      // "donorId" -> "Donor Id" or "Address City"
      const formattedKey = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
        
      const newKey = prefix ? `${prefix} ${formattedKey}` : formattedKey;

      if (value !== null && typeof value === "object") {
        if (Array.isArray(value)) {
          // If array of strings/numbers, CSV. If array of objects, JSON.
          if (value.length > 0 && typeof value[0] === "object") {
            flattened[newKey] = JSON.stringify(value);
          } else {
            flattened[newKey] = value.join(", ");
          }
        } else if (value instanceof Date) {
          flattened[newKey] = value.toISOString();
        } else {
          // Recursive flatten for nested objects (e.g. Address)
          Object.assign(flattened, this.flattenObject(value, newKey));
        }
      } else {
        flattened[newKey] = String(value);
      }
    }

    return flattened;
  }
}
