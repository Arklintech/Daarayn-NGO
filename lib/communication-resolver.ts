import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, getDoc, doc } from "firebase/firestore";
import { Donation } from "@/lib/db";

export async function resolveRecipients(causeIds: string[], type: string) {
  if (!causeIds || causeIds.length === 0) return { uniqueDonors: [], stats: { raised: 0, goalAmount: 0, percentage: 0 }, causeNames: [] };

  // Fetch causes to calculate total goal
  let totalGoal = 0;
  const causeNames: string[] = [];
  for (const causeId of causeIds) {
    const causeSnap = await getDoc(doc(db, "causes", causeId));
    if (causeSnap.exists()) {
      const data = causeSnap.data();
      causeNames.push(data.name || "Unknown Cause");
      totalGoal += data.goalAmount || 0;
    }
  }

  // Fetch all donations
  const q = query(collection(db, "donations"));
  const snap = await getDocs(q);
  
  let totalRaised = 0;
  const uniqueMap = new Map<string, any>();

  snap.docs.forEach(doc => {
    const donation = doc.data() as Donation;
    
    // Check if donation is associated with ANY of the selected causes
    let matchesCause = false;
    if (donation.selectedCauses && Array.isArray(donation.selectedCauses)) {
      for (const cause of donation.selectedCauses) {
        if (causeIds.includes(cause.causeId)) {
          matchesCause = true;
          if (donation.status === "completed") {
            totalRaised += cause.allocatedAmount || 0;
          }
        }
      }
    }

    if (!matchesCause) return;

    // Apply Communication Type Rules
    let eligible = false;

    if (type === "contribution_confirmation") {
      if (donation.status === "completed" || donation.status === "pending") eligible = true;
    } else if (type === "project_progress") {
      if (donation.status === "completed") eligible = true;
    } else if (type === "allocation_confirmation") {
      if (donation.allocationStatus === "fully" || donation.allocationStatus === "partially" || donation.status === "allocated") eligible = true;
    } else if (type === "completion_report") {
      if (donation.status === "completed") eligible = true;
    } else if (type === "general_communication") {
      eligible = true;
    }

    if (eligible) {
      if (!uniqueMap.has(donation.donorId)) {
        uniqueMap.set(donation.donorId, {
          id: donation.donorId,
          name: donation.donorName || "Anonymous",
          email: donation.donorEmail 
        });
      }
    }
  });

  // Fetch emails for donors missing them
  const donorsList = Array.from(uniqueMap.values());
  const resolvedDonors: any[] = [];
  for (const d of donorsList) {
    if (!d.email) {
      try {
        const donorSnap = await getDoc(doc(db, "donors", d.id));
        if (donorSnap.exists()) {
          d.email = donorSnap.data().email;
        }
      } catch (e) {
        console.error("Failed to fetch donor", d.id, e);
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
