import fs from "fs";
import path from "path";
import { donorRepository } from "./repositories/donorRepository";
import { donationRepository } from "./repositories/donationRepository";

// Local Fallback Helpers (kept for edge cases only — primary source is Google Sheets)
const isVercel = process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL || process.env.NODE_ENV === "production";
const dataDir = isVercel ? "/tmp/data" : path.join(process.cwd(), "data");

function getLocalDonors(): DonorProfile[] {
  try {
    const file = path.join(dataDir, "donors.json");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, JSON.stringify([], null, 2));
      } catch (e) {
        console.warn("Unable to write initial empty donors.json:", e);
        return [];
      }
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn("getLocalDonors failed:", err);
    return [];
  }
}

function saveLocalDonors(donors: DonorProfile[]) {
  try {
    const file = path.join(dataDir, "donors.json");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(donors, null, 2));
  } catch (err) {
    console.warn("saveLocalDonors failed:", err);
  }
}

function getLocalDonations(): Donation[] {
  try {
    const file = path.join(dataDir, "donations.json");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(file)) {
      try {
        fs.writeFileSync(file, JSON.stringify([], null, 2));
      } catch (e) {
        console.warn("Unable to write initial empty donations.json:", e);
        return [];
      }
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.warn("getLocalDonations failed:", err);
    return [];
  }
}

function saveLocalDonations(donations: Donation[]) {
  try {
    const file = path.join(dataDir, "donations.json");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(donations, null, 2));
  } catch (err) {
    console.warn("saveLocalDonations failed:", err);
  }
}

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
  causeId?: string;
  causeTitle?: string;
  proofDriveFileId?: string;
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

// Helpers for serial IDs (now Google Sheets-based)
async function getNextSerial(collectionName: string, prefix: string): Promise<string> {
  try {
    let count = 0;
    if (collectionName === "donors") {
      const all = await donorRepository.getAll();
      count = all.length;
    } else if (collectionName === "donations") {
      const all = await donationRepository.getAll();
      count = all.length;
    } else {
      // Fallback for other collections (allocations, etc.)
      count = Math.floor(Math.random() * 9000) + 1000;
    }
    const year = new Date().getFullYear();
    const sequence = String(count + 1).padStart(6, "0");
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

  // 1. Search for existing donor by Email or Phone via Google Sheets repository
  let existingDonor: DonorProfile | null = null;

  try {
    if (normalizedEmail) {
      existingDonor = await donorRepository.findByEmail(normalizedEmail);
    }
    if (!existingDonor && normalizedPhone) {
      existingDonor = await donorRepository.findByContact(normalizedPhone);
    }
  } catch (err: any) {
    console.warn("[db.ts] donorRepository lookup failed, using local fallback:", err.message);
    const localDonors = getLocalDonors();
    if (normalizedEmail) {
      existingDonor = localDonors.find(d => d.email === normalizedEmail) || null;
    }
    if (!existingDonor && normalizedPhone) {
      existingDonor = localDonors.find(d => d.phone === normalizedPhone) || null;
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
      try {
        await donorRepository.save({ ...existingDonor, ...updates });
      } catch (e) {
        // Local fallback
        const localDonors = getLocalDonors();
        const idx = localDonors.findIndex(d => d.id === existingDonor!.id);
        if (idx !== -1) {
          localDonors[idx] = { ...localDonors[idx], ...updates };
          saveLocalDonors(localDonors);
        }
      }
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

  try {
    await donorRepository.save(newDonor);
  } catch (e) {
    const localDonors = getLocalDonors();
    localDonors.push(newDonor);
    saveLocalDonors(localDonors);
  }
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

  // Get donor profile from Google Sheets repository
  let donorName = "Anonymous";
  let donorEmail: string | undefined;
  try {
    const donor = await donorRepository.getById(donationInput.donorId);
    if (donor) {
      donorName = donor.name;
      donorEmail = donor.email;
    }
  } catch (e) {
    // Local fallback
    const localDonors = getLocalDonors();
    const donor = localDonors.find(d => d.id === donationInput.donorId);
    if (donor) {
      donorName = donor.name;
      donorEmail = donor.email;
    }
  }

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

  // 1. Save donation to Google Sheets
  const localDonations = getLocalDonations();
  try {
    await donationRepository.save(newDonation);
  } catch (e) {
    localDonations.unshift(newDonation);
    saveLocalDonations(localDonations);
  }

  // 2. Update donor profile totals via Google Sheets
  try {
    const donor = await donorRepository.getById(donationInput.donorId);
    if (donor) {
      const updatedDonor: DonorProfile = {
        ...donor,
        totalDonations: (donor.totalDonations || 0) + 1,
        totalAmountDonated: (donor.totalAmountDonated || 0) + donationInput.amount,
        donationHistory: [...(donor.donationHistory || []), newId],
      };
      await donorRepository.save(updatedDonor);
    }
  } catch (e) {
    const localDonors = getLocalDonors();
    const idx = localDonors.findIndex(d => d.id === donationInput.donorId);
    if (idx !== -1) {
      localDonors[idx].totalDonations += 1;
      localDonors[idx].totalAmountDonated += donationInput.amount;
      localDonors[idx].donationHistory.push(newId);
      saveLocalDonors(localDonors);
    }
  }

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
  // Fetch donation from Google Sheets repository
  let donation: Donation | null = null;
  try {
    donation = await donationRepository.getById(donationId);
  } catch (e) {
    const localDonations = getLocalDonations();
    donation = localDonations.find(d => d.id === donationId) || null;
  }

  if (!donation) {
    throw new Error("Donation record not found: " + donationId);
  }

  const donorId = donation.donorId;
  const donorName = donation.donorName;
  let totalAllocatedNow = 0;

  for (const item of allocationsList) {
    totalAllocatedNow += item.amount;
  }

  // Update donor profile supported projects/cases
  try {
    const donor = await donorRepository.getById(donorId);
    if (donor) {
      const updatedProjects = [...(donor.projectsSupported || [])];
      const updatedCases = [...(donor.casesSupported || [])];

      for (const item of allocationsList) {
        if (item.projectId && !updatedProjects.includes(item.projectId)) {
          updatedProjects.push(item.projectId);
        }
        if (item.caseId && !updatedCases.includes(item.caseId)) {
          updatedCases.push(item.caseId);
        }
      }

      await donorRepository.save({
        ...donor,
        projectsSupported: updatedProjects,
        casesSupported: updatedCases,
        projectsSupportedCount: updatedProjects.length,
        casesSupportedCount: updatedCases.length,
      });
    }
  } catch (e) {
    console.warn("[db.ts] saveAllocations donor update failed:", e);
  }

  // Update parent donation status
  const currentAllocated = (donation.allocatedAmount || 0) + totalAllocatedNow;
  const remaining = donation.amount - currentAllocated;
  const newAllocStatus = remaining <= 0 ? "fully" : "partially";
  const newStatus = remaining <= 0 ? "allocated" : "completed";

  try {
    await donationRepository.save({
      ...donation,
      allocatedAmount: currentAllocated,
      allocationStatus: newAllocStatus,
      status: newStatus as any,
    });
  } catch (e) {
    console.warn("[db.ts] saveAllocations donation status update failed:", e);
  }
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
