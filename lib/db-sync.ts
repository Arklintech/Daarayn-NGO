import { db } from "./firebase";
import { 
  setDoc as fSetDoc, 
  updateDoc as fUpdateDoc, 
  addDoc as fAddDoc, 
  deleteDoc as fDeleteDoc,
  doc,
  DocumentReference,
  CollectionReference,
  UpdateData,
  WithFieldValue
} from "firebase/firestore";

async function queueSync(entity: string, entityId: string, operation: "CREATE" | "UPDATE" | "DELETE", data: any) {
  const taskId = `${entity}_${entityId}_${Date.now()}`;
  const task = {
    entity,
    entityId,
    operation,
    data,
    status: "PENDING",
    syncAttempts: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await fSetDoc(doc(db, "sync_queue", taskId), task);
    
    // Trigger server-side execution asynchronously
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/admin/sync/trigger`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    }).catch(err => console.error("Trigger failed", err));
    
  } catch (err) {
    console.error("Failed to queue sync task", err);
  }
}

export async function setDoc<T>(reference: DocumentReference<T>, data: WithFieldValue<T>, options?: any): Promise<void> {
  await fSetDoc(reference, data, options);
  
  const pathParts = reference.path.split("/");
  const collectionName = pathParts[0];
  const entityId = reference.id;

  if (collectionName !== "sync_queue" && collectionName !== "sync_audit_logs") {
    queueSync(collectionName, entityId, "CREATE", data);
  }
}

export async function updateDoc<T>(reference: DocumentReference<T>, data: any): Promise<void> {
  await fUpdateDoc(reference, data);
  
  const pathParts = reference.path.split("/");
  const collectionName = pathParts[0];
  const entityId = reference.id;

  if (collectionName !== "sync_queue" && collectionName !== "sync_audit_logs") {
    queueSync(collectionName, entityId, "UPDATE", data);
  }
}

export async function addDoc<T>(reference: CollectionReference<T>, data: WithFieldValue<T>): Promise<DocumentReference<T>> {
  const docRef = await fAddDoc(reference, data);
  
  const pathParts = reference.path.split("/");
  const collectionName = pathParts[0];
  const entityId = docRef.id;

  if (collectionName !== "sync_queue" && collectionName !== "sync_audit_logs") {
    queueSync(collectionName, entityId, "CREATE", data);
  }
  
  return docRef;
}

export async function deleteDoc(reference: DocumentReference): Promise<void> {
  await fDeleteDoc(reference);
  
  const pathParts = reference.path.split("/");
  const collectionName = pathParts[0];
  const entityId = reference.id;

  if (collectionName !== "sync_queue" && collectionName !== "sync_audit_logs") {
    queueSync(collectionName, entityId, "DELETE", { deletedAt: new Date().toISOString() });
  }
}
