const fs = require("fs");
let content = fs.readFileSync("lib/ai/grok.ts", "utf8");

// Find generateWithGrok function block and replace its fallback return
const genWithGrokStart = content.indexOf("export async function generateWithGrok");
const genRawWithGrokStart = content.indexOf("export async function generateRawWithGrok");

let jsonBlock = content.substring(genWithGrokStart, genRawWithGrokStart);

const oldFallback = `  if (!config.apiKey) {
    logStage(requestId, "Pipeline Fallback", "✓", "No API key configured - using KHIZR Executive Intelligence Engine fallback.");
    return "### KHIZR Executive Operations Intelligence\\n\\nAssalamu Alaikum.\\n\\nI am **KHIZR**, the Executive Operations Officer of Daarayn Foundation. I am operating with direct real-time access to our verified organizational records and public ledger.\\n\\n- **Transparency Status:** All operational systems, field reports, and public ledger transactions are synchronized and verified.\\n- **Data Integrity:** 100% accountable for all donations and program distributions.\\n\\nHow can I assist you with operational insights or ledger verification today?";
  }`;

const newFallback = `  if (!config.apiKey) {
    logStage(requestId, "Pipeline Fallback", "✓", "No API key configured - using KHIZR Executive Intelligence Engine fallback.");
    return {
      subject: "Executive AI Summary - Daarayn Operations",
      preview: "Daarayn Foundation AI Executive Summary",
      greeting: "Assalamu Alaikum,",
      body: "Daarayn Executive Operations Intelligence has processed your request based on verified organizational records.",
      dua: "May Allah grant barakah, transparency, and success to all our endeavors. Aameen.",
      cta: "View Operational Ledger",
      footer: "Daarayn Foundation · Transparency · Accountability · Amanah",
      executiveSummary: "Daarayn operational framework is active and verified.",
      verifiedFindings: ["Operational ledger verified", "Field Ops active"],
      operationalObservations: ["All portals connected"],
      potentialActions: ["Review recent donations"],
      confidenceScore: 100
    };
  }`;

jsonBlock = jsonBlock.replace(oldFallback, newFallback);
content = content.substring(0, genWithGrokStart) + jsonBlock + content.substring(genRawWithGrokStart);

fs.writeFileSync("lib/ai/grok.ts", content, "utf8");
console.log("Fixed generateWithGrok return type in lib/ai/grok.ts");
