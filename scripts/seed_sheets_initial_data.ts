import { causeRepository } from "../lib/repositories/causeRepository";
import { programRepository } from "../lib/repositories/programRepository";
import { campaignRepository } from "../lib/repositories/campaignRepository";
import { DEFAULT_CAUSES } from "../lib/causes";

async function seedInitialData() {
  console.log("=== SEEDING INITIAL OPERATIONAL DATA TO GOOGLE SHEETS ===");

  const causesToSeed = DEFAULT_CAUSES.map((c) => ({
    id: c.id,
    title: c.title || c.name,
    category: c.category || "General",
    targetAmount: c.goalAmount || 500000,
    raisedAmount: 0,
    location: c.location || "National",
    description: c.description || "",
    status: "Active" as const,
    imageUrl: "",
    driveFileId: "",
    createdAt: new Date().toISOString(),
  }));

  console.log(`Seeding ${causesToSeed.length} causes to Google Sheets...`);
  await causeRepository.saveBatch(causesToSeed);

  const programsToSeed = DEFAULT_CAUSES.map((c) => ({
    id: `PROG-${c.id}`,
    title: c.title || c.name,
    category: c.category || "General",
    amountRequired: c.goalAmount || 500000,
    amountCollected: 0,
    progress: 0,
    status: "Active",
    description: c.description || "",
    createdAt: new Date().toISOString(),
  }));

  console.log(`Seeding ${programsToSeed.length} programs to Google Sheets...`);
  await programRepository.saveBatch(programsToSeed);

  const campaignsToSeed = [
    {
      id: "CAMP-2026-RAMADAN",
      title: "Ramadan 2026 Dignity & Food Security",
      goal: 1500000,
      raised: 125000,
      startDate: "2026-02-15",
      endDate: "2026-03-30",
      status: "Active",
      createdAt: new Date().toISOString(),
    },
    {
      id: "CAMP-2026-WELLS",
      title: "100 Clean Drinking Water Wells",
      goal: 2500000,
      raised: 680000,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "Active",
      createdAt: new Date().toISOString(),
    },
  ];

  console.log(`Seeding ${campaignsToSeed.length} campaigns to Google Sheets...`);
  await campaignRepository.saveBatch(campaignsToSeed);

  console.log("=== SEEDING COMPLETED SUCCESSFULLY ===");
}

seedInitialData().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
