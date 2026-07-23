import fs from 'fs';

async function runTests() {
  const tests = [
    { name: "Test 1", q: "Why was Daarayn created?" },
    { name: "Test 2", q: "Let's brainstorm donor retention." },
    { name: "Test 3", q: "Good morning." },
    { name: "Test 4", q: "I think something is wrong." },
    { name: "Test 5", q: "Explain Amanah." },
    { name: "Test 6", q: "What worries you today?" },
    { name: "Test 7", q: "Convince me that Daarayn is trustworthy." },
    { name: "Test 8", q: "Should we approve this allocation?" }
  ];

  let output = "# CCF Behavioural Assessment\n\n";
  output += "> The following responses were generated live by the KHIZR Cognitive Orchestrator after CCF implementation.\n\n";

  for (const t of tests) {
    try {
      console.log(`Running ${t.name}: "${t.q}"...`);
      const res = await fetch('http://localhost:3000/api/admin/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: t.q, userId: 'U1', userRole: 'admin', history: [] })
      });
      const data = await res.json();
      
      output += `## ${t.name}\n**Administrator:** ${t.q}\n\n**KHIZR:**\n${data.reply || "*(No response generated)*"}\n\n---\n\n`;
    } catch (e) {
      console.error(`Error on ${t.name}:`, e);
      output += `## ${t.name}\n**Administrator:** ${t.q}\n\n**KHIZR Error:**\n${e.message}\n\n---\n\n`;
    }
  }

  // Use absolute path for artifacts directory
  const artifactPath = "C:\\Users\\NEXAWAVE\\.gemini\\antigravity-ide\\brain\\824a44a6-6e76-42a7-879d-d999302cda16\\ccf_assessment.md";
  fs.writeFileSync(artifactPath, output);
  console.log("Done writing assessment to", artifactPath);
}

runTests().catch(console.error);
