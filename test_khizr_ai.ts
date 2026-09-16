import { processChatMessage } from "./lib/ai/conversationManager";

async function testKhizr() {
  console.log("=== Testing KHIZR Public AI Assistant ===");
  const pubRes = await processChatMessage({
    sessionId: "TEST-PUB-1",
    userId: "guest-user",
    userRole: "public",
    message: "What is Daarayn Foundation's mission and how are donations tracked?",
    history: []
  });
  console.log("Public Response Success:", pubRes.success);
  console.log("Public Reply:\n", pubRes.reply);
  console.log("References:\n", pubRes.references);

  console.log("\n=== Testing KHIZR Admin Executive AI Copilot ===");
  const adminRes = await processChatMessage({
    sessionId: "TEST-ADMIN-1",
    userId: "admin-user",
    userRole: "super_admin",
    message: "Give me an executive summary of current donations, active causes, and field ops status.",
    history: []
  });
  console.log("Admin Response Success:", adminRes.success);
  console.log("Admin Reply:\n", adminRes.reply);
}

testKhizr().catch(console.error);
