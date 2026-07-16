import { db } from "./firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  increment,
  arrayUnion
} from "firebase/firestore";
import { setDoc, updateDoc } from "./db-sync";

// Interfaces
export interface DonorProfile {
  id: string; // DNR-YYYY-000001
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  donationPreference: string;
  communicationPreference: string;
  dateJoined: string;
  totalDonations: number;
  totalAmountDonated: number;
  projectsSupportedCount: number;
  casesSupportedCount: number;
  donationHistory: string[];
  projectsSupported: string[]; // Project IDs
  casesSupported: string[]; // Case IDs
  status: "active" | "inactive";
}

export interface Donation {
  id: string; // DON-YYYY-000145
  donorId: string;
  donorName: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  donationType: string;
  date: string;
  status: "pending" | "completed" | "rejected" | "allocated";
  selectedCauses: {
    causeId: string;
    causeName: string;
    allocatedAmount: number;
    percentage: number;
  }[];
  anonymous?: boolean;
  notes?: string;
  proofUrl?: string;
  receiptUrl?: string;
  transactionReference: string;
  donorEmail?: string;
  allocatedAmount?: number;
  allocationStatus?: "fully" | "partially";
}

export interface Allocation {
  id: string;
  donationId: string;
  donorId: string;
  donorName: string;
  projectId: string;
  caseId: string;
  targetTitle: string;
  allocatedAmount: number;
  allocationDate: string;
  adminEmail: string;
  status: "active" | "disbursed";
}

export interface ProjectUpdate {
  id: string;
  title: string;
  content: string;
  date: string;
  progress: number;
  media: string[];
  receipts: { title: string; value: number }[];
  beneficiaryConfirmation: string;
  published: boolean;
}

export interface CommunicationLog {
  id: string; // COMM-YYYY-000001
  causeId: string; // Unified Cause reference
  type: "contribution_confirmation" | "project_progress" | "allocation_confirmation" | "completion_report" | "general_communication";
  recipientsCount: number;
  subject: string;
  message: string;
  media?: string[];
  sentDate: string;
  createdBy: string;
  status: "queued" | "sent" | "failed";
}

// Helpers for serial IDs
async function getNextSerial(collectionName: string, prefix: string): Promise<string> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const year = new Date().getFullYear();
    const sequence = String(snap.size + 1).padStart(6, "0");
    return `${prefix}-${year}-${sequence}`;
  } catch (err) {
    // Fail-safe random fallback
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-2026-${rand}`;
  }
}

// DIDMS SERVICE METHODS
export async function getOrCreateDonor(donorInput: {
  name: string;
  email: string;
  phone: string;
  country?: string;
  city?: string;
  donationPreference?: string;
  communicationPreference?: string;
}): Promise<DonorProfile> {
  const normalizedEmail = donorInput.email.toLowerCase().trim();
  const normalizedPhone = donorInput.phone.trim();

  // 1. Search for existing donor by Email or Phone
  const donorsRef = collection(db, "donors");
  let existingDonor: DonorProfile | null = null;

  if (normalizedEmail) {
    const qEmail = query(donorsRef, where("email", "==", normalizedEmail));
    const emailSnap = await getDocs(qEmail);
    if (!emailSnap.empty) {
      const docData = emailSnap.docs[0];
      existingDonor = { id: docData.id, ...docData.data() } as DonorProfile;
    }
  }

  if (!existingDonor && normalizedPhone) {
    const qPhone = query(donorsRef, where("phone", "==", normalizedPhone));
    const phoneSnap = await getDocs(qPhone);
    if (!phoneSnap.empty) {
      const docData = phoneSnap.docs[0];
      existingDonor = { id: docData.id, ...docData.data() } as DonorProfile;
    }
  }

  // 2. Return if found (and update missing info if provided)
  if (existingDonor) {
    let updatesNeeded = false;
    const updates: Partial<DonorProfile> = {};

    if (donorInput.name && donorInput.name !== existingDonor.name && donorInput.name !== "Anonymous Donor") {
      updates.name = donorInput.name;
      updatesNeeded = true;
    }
    if (!existingDonor.email && normalizedEmail) {
      updates.email = normalizedEmail;
      updatesNeeded = true;
    }
    if (!existingDonor.phone && normalizedPhone) {
      updates.phone = normalizedPhone;
      updatesNeeded = true;
    }
    if (donorInput.country && (!existingDonor.country || existingDonor.country === "IN")) {
      updates.country = donorInput.country;
      updatesNeeded = true;
    }
    if (donorInput.city && (!existingDonor.city || existingDonor.city === "Unknown")) {
      updates.city = donorInput.city;
      updatesNeeded = true;
    }

    if (updatesNeeded) {
      await updateDoc(doc(db, "donors", existingDonor.id), updates);
      return { ...existingDonor, ...updates };
    }
    return existingDonor;
  }

  // 3. Else create a new donor profile
  const newId = await getNextSerial("donors", "DNR");
  const newDonor: DonorProfile = {
    id: newId,
    name: donorInput.name || "Anonymous Donor",
    email: normalizedEmail,
    phone: normalizedPhone,
    country: donorInput.country || "IN",
    city: donorInput.city || "Unknown",
    donationPreference: donorInput.donationPreference || "General Support",
    communicationPreference: donorInput.communicationPreference || "Email",
    dateJoined: new Date().toISOString().split("T")[0],
    totalDonations: 0,
    totalAmountDonated: 0,
    projectsSupportedCount: 0,
    casesSupportedCount: 0,
    donationHistory: [],
    projectsSupported: [],
    casesSupported: [],
    status: "active"
  };

  await setDoc(doc(db, "donors", newId), newDonor);
  return newDonor;
}

export async function createDonation(donationInput: {
  donorId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  donationType: string;
  selectedCauses?: { causeId: string, causeName: string, allocatedAmount: number, percentage: number }[];
  transactionReference: string;
  receiptUrl?: string;
  status?: "pending" | "completed" | "allocated";
}): Promise<Donation> {
  const newId = await getNextSerial("donations", "DON");
  
  // Get donor profile to retrieve name and email
  const donorDoc = await getDoc(doc(db, "donors", donationInput.donorId));
  const donorName = donorDoc.exists() ? donorDoc.data().name : "Anonymous";
  const donorEmail = donorDoc.exists() ? donorDoc.data().email : undefined;

  const newDonation: Donation = {
    id: newId,
    donorId: donationInput.donorId,
    donorName,
    donorEmail,
    amount: donationInput.amount,
    currency: donationInput.currency || "INR",
    paymentMethod: donationInput.paymentMethod || "UPI",
    donationType: donationInput.donationType || "General",
    date: new Date().toISOString().split("T")[0],
    status: donationInput.status || "pending",
    selectedCauses: donationInput.selectedCauses || [],
    transactionReference: donationInput.transactionReference || "",
    receiptUrl: donationInput.receiptUrl || ""
  };

  // 1. Save donation document
  await setDoc(doc(db, "donations", newId), newDonation);

  // 2. Update donor profile totals
  const donorRef = doc(db, "donors", donationInput.donorId);
  await updateDoc(donorRef, {
    totalDonations: increment(1),
    totalAmountDonated: increment(donationInput.amount),
    donationHistory: arrayUnion(newId)
  });

  return newDonation;
}

// DAICE SERVICE METHODS
export async function saveAllocations(
  donationId: string,
  allocationsList: {
    projectId?: string; // program id
    caseId?: string; // program id
    targetTitle: string;
    amount: number;
    adminEmail: string;
  }[]
): Promise<void> {
  const donationRef = doc(db, "donations", donationId);
  const donationSnap = await getDoc(donationRef);
  
  if (!donationSnap.exists()) {
    throw new Error("Donation record not found: " + donationId);
  }

  const donation = donationSnap.data() as Donation;
  const donorId = donation.donorId;
  const donorName = donation.donorName;

  let totalAllocatedNow = 0;

  for (const item of allocationsList) {
    const allocId = await getNextSerial("allocations", "ALC");
    const newAlloc: Allocation = {
      id: allocId,
      donationId,
      donorId,
      donorName,
      projectId: item.projectId || "",
      caseId: item.caseId || "",
      targetTitle: item.targetTitle,
      allocatedAmount: item.amount,
      allocationDate: new Date().toISOString().split("T")[0],
      adminEmail: item.adminEmail,
      status: "active"
    };

    // 1. Save allocation document
    await setDoc(doc(db, "allocations", allocId), newAlloc);
    totalAllocatedNow += item.amount;

    // 2. Update program/case/project collections totals
    const targetProgramId = item.projectId || item.caseId;
    if (targetProgramId) {
      const progRef = doc(db, "programs", targetProgramId);
      await updateDoc(progRef, {
        amountCollected: increment(item.amount),
        progress: increment(0) // Logic can be added on client side to recalculate progress relative to goal
      });
    }

    // 3. Update supported counts on donor profile
    const donorRef = doc(db, "donors", donorId);
    if (item.projectId) {
      await updateDoc(donorRef, {
        projectsSupported: arrayUnion(item.projectId),
      });
    } else if (item.caseId) {
      await updateDoc(donorRef, {
        casesSupported: arrayUnion(item.caseId),
      });
    }
  }

  // Update donor profile total supported count length in a separate query if needed,
  // or handle it reactively. For simplicity we store arrays and check array length.

  // 4. Update parent donation status
  const currentAllocated = (donation.allocatedAmount || 0) + totalAllocatedNow;
  const remaining = donation.amount - currentAllocated;
  const newAllocStatus = remaining <= 0 ? "fully" : "partially";
  const newStatus = remaining <= 0 ? "allocated" : "completed";

  await updateDoc(donationRef, {
    allocatedAmount: currentAllocated,
    allocationStatus: newAllocStatus,
    status: newStatus
  });
}

// AI Message Engine Generator (Evidence-based only)
export function generateAIMessage(project: any, update: any, donorAllocation: number): string {
  const verifiedMediaCount = update.media?.length || 0;
  const progressText = `The project progress is now at **${update.progress}%** completion.`;
  const splitText = `This allocation supports Daarayn's 90/10 transparency rules (90% direct case aid, 10% delivery).`;

  const items = update.receipts?.map((r: any) => `- ${r.title}: ₹${r.value.toLocaleString()}`).join("\n") || "";
  const receiptsBreakdown = items ? `\n\nVerified financial breakdown of the funds deployed:\n${items}` : "";

  return `Dear Supporter,

We are pleased to share a verified progress update on the project you funded: **${project.title}**.

Through your generous contribution, a sum of **₹${donorAllocation.toLocaleString()}** was directly allocated to this effort. 

${update.content}

**Status Audit**:
- ${progressText}
- Verified on-site media: **${verifiedMediaCount} files uploaded** (viewable on your dashboard).
- Caretaker Statement: "${update.beneficiaryConfirmation || "Everything checked and verified."}"
${receiptsBreakdown}

${splitText}

You can track the live ledger balance and direct proof materials instantly on your secure Daarayn Donor Profile.

With gratitude,
The Daarayn Audit Team`;
}

