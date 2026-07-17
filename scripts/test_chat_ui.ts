import fetch from "node-fetch";

async function testChat() {
  const questions = [
    "Who are you and why was ai tos created?",
    "What is Daarayn's core mission?",
    "Can you tell me about the recent donations?",
    "What is your operating philosophy?",
    "Hello KHIDR, how are you today?"
  ];

  let history: any[] = [];
  const sessionId = `TEST-${Date.now()}`;

  for (const q of questions) {
    console.log(`\n======================================================`);
    console.log(`[USER]: ${q}`);
    
    try {
      const start = Date.now();
      const res = await fetch("http://localhost:3000/api/admin/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          history: history,
          sessionId: sessionId,
          adminEmail: "test@daarayn.org",
          adminRole: "Super Admin"
        })
      });

      const data: any = await res.json();
      
      if (!data.success) {
        console.error(`[ERROR]: ${data.error}`);
        continue;
      }
      
      console.log(`[KHIDR] (${Date.now() - start}ms):\nReply: ${data.reply}`);
      console.log(`Blueprint: ${data.metadata?.blueprint}, MCO Objective: ${data.metadata?.mcoObjective}`);
      
      history.push({ role: "user", content: q });
      history.push({ role: "assistant", content: data.reply });
    } catch (e: any) {
      console.error(`[FATAL ERROR]: ${e.message}`);
    }
  }
}

testChat();
