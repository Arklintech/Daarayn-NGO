/**
 * lib/ai/verifiedDataCollector.ts
 *
 * Verified Data Collector for the Daarayn Trust Intelligence Engine.
 * Converts raw database structures into strictly validated and filtered data contexts,
 * ensuring no sensitive or raw internal database states are leaked to the AI model.
 */

export interface VerifiedDonorData {
  id: string;
  name: string;
  email: string;
  preferredLanguage: string;
  communicationPreference: string;
  totalAmountDonated: number;
}

export interface VerifiedDonationData {
  id: string;
  amount: number;
  currency: string;
  date: string;
  paymentMethod: string;
  donationType: string;
}

export interface VerifiedAllocationData {
  id: string;
  allocatedAmount: number;
  allocationDate: string;
  targetTitle: string;
}

export interface VerifiedProgramData {
  id: string;
  title: string;
  description: string;
  location: string;
  amountRequired: number;
  amountCollected: number;
  progress: number;
  status: string;
  beneficiaryCount?: number;
}

export interface VerifiedUpdateData {
  id: string;
  title: string;
  content: string;
  date: string;
  progress: number;
  mediaCount: number;
  receipts: Array<{ title: string; value: number }>;
  beneficiaryConfirmation: string;
}

export interface VerifiedDataContext {
  donor?: VerifiedDonorData;
  donation?: VerifiedDonationData;
  allocation?: VerifiedAllocationData;
  program?: VerifiedProgramData;
  projectUpdate?: VerifiedUpdateData;
  customNotes?: string;
}

/**
 * Filter and construct a verified data profile for Donors
 */
export function collectDonorData(rawDonor: any): VerifiedDonorData {
  if (!rawDonor) throw new Error("Donor record is required for collector.");
  return {
    id: String(rawDonor.id || ""),
    name: String(rawDonor.name || "Anonymous Donor"),
    email: String(rawDonor.email || ""),
    preferredLanguage: String(rawDonor.preferredLanguage || rawDonor.donationPreference || "English"),
    communicationPreference: String(rawDonor.communicationPreference || "Email"),
    totalAmountDonated: Number(rawDonor.totalAmountDonated || 0),
  };
}

/**
 * Filter and construct a verified data profile for Donations
 */
export function collectDonationData(rawDonation: any): VerifiedDonationData {
  if (!rawDonation) throw new Error("Donation record is required for collector.");
  return {
    id: String(rawDonation.id || ""),
    amount: Number(rawDonation.amount || 0),
    currency: String(rawDonation.currency || "INR"),
    date: String(rawDonation.date || ""),
    paymentMethod: String(rawDonation.paymentMethod || "UPI"),
    donationType: String(rawDonation.donationType || "General"),
  };
}

/**
 * Filter and construct a verified data profile for Allocations
 */
export function collectAllocationData(rawAllocation: any): VerifiedAllocationData {
  if (!rawAllocation) throw new Error("Allocation record is required for collector.");
  return {
    id: String(rawAllocation.id || ""),
    allocatedAmount: Number(rawAllocation.allocatedAmount || rawAllocation.amount || 0),
    allocationDate: String(rawAllocation.allocationDate || rawAllocation.date || ""),
    targetTitle: String(rawAllocation.targetTitle || ""),
  };
}

/**
 * Filter and construct a verified data profile for Programs
 */
export function collectProgramData(rawProgram: any): VerifiedProgramData {
  if (!rawProgram) throw new Error("Program/Case record is required for collector.");
  return {
    id: String(rawProgram.id || ""),
    title: String(rawProgram.title || ""),
    description: String(rawProgram.description || ""),
    location: String(rawProgram.location || ""),
    amountRequired: Number(rawProgram.amountRequired || 0),
    amountCollected: Number(rawProgram.amountCollected || 0),
    progress: Number(rawProgram.progress || 0),
    status: String(rawProgram.status || "Active"),
    beneficiaryCount: rawProgram.beneficiaryCount ? Number(rawProgram.beneficiaryCount) : undefined,
  };
}

/**
 * Filter and construct a verified data profile for Project Updates
 */
export function collectUpdateData(rawUpdate: any): VerifiedUpdateData {
  if (!rawUpdate) throw new Error("Project update record is required for collector.");
  return {
    id: String(rawUpdate.id || ""),
    title: String(rawUpdate.title || ""),
    content: String(rawUpdate.content || ""),
    date: String(rawUpdate.date || ""),
    progress: Number(rawUpdate.progress || 0),
    mediaCount: Array.isArray(rawUpdate.media) ? rawUpdate.media.length : 0,
    receipts: Array.isArray(rawUpdate.receipts)
      ? rawUpdate.receipts.map((r: any) => ({
          title: String(r.title || ""),
          value: Number(r.value || 0),
        }))
      : [],
    beneficiaryConfirmation: String(rawUpdate.beneficiaryConfirmation || ""),
  };
}
