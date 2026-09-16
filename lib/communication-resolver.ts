import { causeRepository } from "@/lib/repositories/causeRepository";
import { donationRepository } from "@/lib/repositories/donationRepository";
import { donorRepository } from "@/lib/repositories/donorRepository";

export async function resolveRecipients(causeIds: string[], type: string) {
  if (!causeIds || causeIds.length === 0) {
    return { uniqueDonors: [], stats: { raised: 0, goalAmount: 0, percentage: 0 }, causeNames: [] };
  }

  const isAll = causeIds.includes("all") || causeIds.includes("all_causes") || causeIds.includes("all_donors");

  // Fetch causes to calculate total goal from Sheets
  let totalGoal = 0;
  const causeNames: string[] = [];
  const allCauses = await causeRepository.getAll();
  const causeMap = new Map(allCauses.map(c => [c.id, c]));

  for (const causeId of causeIds) {
    if (causeId === "all" || causeId === "all_causes" || causeId === "all_donors") continue;
    const c = causeMap.get(causeId) as any;
    if (c) {
      causeNames.push(c.title || c.name || "Unknown Cause");
      totalGoal += Number(c.goalAmount || c.targetAmount || 0);
    } else {
      causeNames.push(causeId);
    }
  }

  if (isAll && causeNames.length === 0) {
    causeNames.push("All Foundation Initiatives");
    allCauses.forEach(c => {
      totalGoal += Number((c as any).goalAmount || c.targetAmount || 0);
    });
  }

  // Fetch donations from Sheets repository
  const allDonations = await donationRepository.getAll();
  
  let totalRaised = 0;
  const uniqueMap = new Map<string, any>();

  for (const donation of allDonations as any[]) {
    const dCauseId = String(donation.causeId || "").toLowerCase();
    const dCauseTitle = String(donation.causeTitle || donation.cause || "").toLowerCase();

    let matchesCause = isAll;
    if (!isAll) {
      if (causeIds.some(cid => {
        const cidLower = cid.toLowerCase();
        return (
          (dCauseId && dCauseId === cidLower) ||
          (dCauseTitle && (dCauseTitle === cidLower || dCauseTitle.includes(cidLower) || cidLower.includes(dCauseTitle)))
        );
      })) {
        matchesCause = true;
      }

      if (!matchesCause && donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
        for (const sc of donation.selectedCauses) {
          const scId = String(sc.causeId || "").toLowerCase();
          const scTitle = String(sc.causeTitle || sc.title || sc.name || "").toLowerCase();
          if (causeIds.some(cid => {
            const cidLower = cid.toLowerCase();
            return scId === cidLower || scTitle.includes(cidLower) || cidLower.includes(scTitle);
          })) {
            matchesCause = true;
            break;
          }
        }
      }
    }

    if (matchesCause) {
      const st = String(donation.status || "").toLowerCase();
      if (st === "completed" || st === "verified") {
        totalRaised += Number(donation.amount || 0);
      }
    }

    if (!matchesCause) continue;

    // Apply Communication Type Rules
    let eligible = false;
    const status = String(donation.status || "").toLowerCase();

    if (type === "contribution_confirmation") {
      if (status === "completed" || status === "verified" || status === "pending") eligible = true;
    } else if (type === "project_progress") {
      if (status === "completed" || status === "verified") eligible = true;
    } else if (type === "allocation_confirmation") {
      const alloc = String(donation.allocationStatus || "").toLowerCase();
      if (alloc === "fully" || alloc === "partially" || status === "allocated" || status === "completed" || status === "verified") eligible = true;
    } else if (type === "completion_report") {
      if (status === "completed" || status === "verified") eligible = true;
    } else if (type === "general_communication" || !type) {
      eligible = true;
    }

    if (eligible) {
      const dEmail = donation.donorEmail || donation.email;
      const dId = donation.donorId || donation.id;
      const dName = donation.donorName || donation.donor || "Valued Donor";

      const key = dId || dEmail;
      if (key && !uniqueMap.has(key)) {
        uniqueMap.set(key, {
          id: dId || key,
          name: dName,
          email: dEmail
        });
      }
    }
  }

  // Fetch all registered donors from donorRepository
  const allDonors = await donorRepository.getAll();
  const donorDbMap = new Map(allDonors.map(d => [d.id, d]));

  if (isAll) {
    for (const donor of allDonors) {
      if (donor.email && donor.email.includes('@') && !uniqueMap.has(donor.id)) {
        uniqueMap.set(donor.id, {
          id: donor.id,
          name: donor.name || "Valued Donor",
          email: donor.email,
        });
      }
    }
  }

  // Fetch emails for donors missing them from donorRepository
  const donorsList = Array.from(uniqueMap.values());
  const resolvedDonors: any[] = [];

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
