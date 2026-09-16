import { fieldAgentRepository } from "../lib/repositories/fieldAgentRepository";
import { fieldReportRepository } from "../lib/repositories/fieldReportRepository";

async function seedFieldOps() {
  console.log("=== SEEDING INITIAL FIELD OPS DATA TO GOOGLE SHEETS ===");

  const initialAgent = {
    id: "FA001",
    firebaseUid: "agent-demo-uid-001",
    name: "Tariq Mansoor",
    email: "tariq.mansoor@daarayn.org",
    phone: "+919876543210",
    country: "India",
    state: "Telangana",
    district: "Hyderabad",
    city: "Hyderabad",
    address: "Old City, Charminar Zone",
    role: "Senior Field Investigator",
    region: "Telangana & Andhra",
    status: "active",
    assignedSupervisor: "Operations Director",
    avatarUrl: "",
    joinDate: new Date().toISOString(),
    requirePasswordChange: false,
    permissions: [
      "submitReports",
      "uploadEvidence",
      "viewOwnReports",
      "replyConversations",
      "receiveNotifications",
    ],
    stats: {
      reportsSubmitted: 1,
      tasksCompleted: 4,
      activeCases: 2,
      hoursLogged: 48,
    },
  };

  console.log("Saving initial Field Agent to Google Sheets...");
  await fieldAgentRepository.save(initialAgent);

  const initialReport = {
    id: "FR001",
    agentId: "FA001",
    agentName: "Tariq Mansoor",
    category: "Masjid Repair",
    title: "Community Masjid Roof Leakage & Flood Restoration",
    description: "Urgent structural rehabilitation needed for rainwater seepage affecting prayer hall flooring.",
    urgency: "High" as const,
    estimatedBudget: "₹75,000",
    location: {
      country: "India",
      state: "Telangana",
      district: "Hyderabad",
      village: "Bandlaguda",
    },
    beneficiaries: {
      families: 180,
      children: 95,
      women: 110,
      elderly: 40,
      description: "Local community worshippers and neighboring families.",
    },
    media: ["https://images.unsplash.com/photo-1548048026-5a1a941d93d3?q=80&w=400"],
    documents: [],
    status: "Pending Review" as const,
    timelineStages: {
      submitted: { timestamp: new Date().toISOString(), by: "Tariq Mansoor" },
    },
    assignedTo: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  console.log("Saving initial Field Report to Google Sheets...");
  await fieldReportRepository.save(initialReport);

  console.log("=== FIELD OPS SEEDING COMPLETED SUCCESSFULLY ===");
}

seedFieldOps().catch((err) => {
  console.error("Field ops seeding failed:", err);
  process.exit(1);
});
