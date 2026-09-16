import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";

export async function resolveRecipients(causeIds: string[], type: string) {
  if (!causeIds || causeIds.length === 0) {
    return { uniqueDonors: [], stats: { raised: 0, goalAmount: 0, percentage: 0 }, causeNames: [] };
  }

  // Fetch causes to calculate total goal from Sheets
  let totalGoal = 0;
  const causeNames: string[] = [];
  const allCauses = await causeRepository.getAll();
  const causeMap = new Map(allCauses.map(c => [c.id, c]));

  for (const causeId of causeIds) {
    const c = causeMap.get(causeId) as any;
    if (c) {
      causeNames.push(c.title || c.name || "Unknown Cause");
      totalGoal += Number(c.goalAmount || c.targetAmount || 0);
    }
  }

  // Fetch donations from Sheets repository
  const allDonations = await donationRepository.getAll();
  
  let totalRaised = 0;
  const uniqueMap = new Map<string, any>();

  for (const donation of allDonations) {
    // Check if donation is associated with ANY of the selected causes
    let matchesCause = false;
    if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
      for (const sc of donation.selectedCauses) {
        if (causeIds.includes(sc.causeId)) {
          matchesCause = true;
          const st = String(donation.status).toLowerCase();
          if (st === "completed" || st === "verified") {
            totalRaised += Number(sc.allocatedAmount || 0);
          }
        }
      }
    }

    if (!matchesCause) continue;

    // Apply Communication Type Rules
    let eligible = false;
    const status = (donation.status || "").toLowerCase();

    if (type === "contribution_confirmation") {
      if (status === "completed" || status === "verified" || status === "pending") eligible = true;
    } else if (type === "project_progress") {
      if (status === "completed" || status === "verified") eligible = true;
    } else if (type === "allocation_confirmation") {
      const alloc = (donation.allocationStatus || "").toLowerCase();
      if (alloc === "fully" || alloc === "partially" || status === "allocated") eligible = true;
    } else if (type === "completion_report") {
      if (status === "completed" || status === "verified") eligible = true;
    } else if (type === "general_communication") {
      eligible = true;
    }

    if (eligible && donation.donorId) {
      if (!uniqueMap.has(donation.donorId)) {
        uniqueMap.set(donation.donorId, {
          id: donation.donorId,
          name: donation.donorName || "Anonymous",
          email: donation.donorEmail 
        });
      }
    }
  }

  // Fetch emails for donors missing them from donorRepository
  const donorsList = Array.from(uniqueMap.values());
  const resolvedDonors: any[] = [];
  const allDonors = await donorRepository.getAll();
  const donorDbMap = new Map(allDonors.map(d => [d.id, d]));

  for (const d of donorsList) {
    if (!d.email) {
      const donorRecord = donorDbMap.get(d.id);
      if (donorRecord && donorRecord.email) {
        d.email = donorRecord.email;
      }
    }
    // Only include valid emails
    if (d.email && d.email.includes('@')) {
      resolvedDonors.push(d);
    }
  }

  const safeGoal = totalGoal || 1;
  const pct = Math.min(100, Math.round((totalRaised / safeGoal) * 100));

  return {
    uniqueDonors: resolvedDonors,
    causeNames,
    stats: {
      raised: totalRaised,
      goalAmount: totalGoal,
      percentage: pct
    }
  };
}
