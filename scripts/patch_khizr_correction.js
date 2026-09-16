const fs = require("fs");
let code = fs.readFileSync("lib/ai/grok.ts", "utf8");

// Fix generateWithGrok fallback
const targetJsonFallback = /if \(!config\.apiKey\) \{[\s\S]*?confidenceScore: 100\s*\}\;?\s*\}/;
const correctJsonFallback = `if (!config.apiKey) {
    logStage(requestId, "Pipeline Info", "✓", "External AI model provider API key is not configured.");
    return {
      status: "model_unavailable",
      message: "External AI model provider API key is not configured.",
      subject: "AI Provider Status: Unavailable",
      preview: "AI Model Provider Not Configured",
      greeting: "Notice:",
      body: "External AI model provider credentials (GROK_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY) are currently not configured in environment variables. Model inference is unavailable.",
      dua: "",
      cta: "",
      footer: "Daarayn Intelligence System Notice",
      executiveSummary: "AI Model Provider is currently unavailable. No external model inference was performed.",
      verifiedFindings: [],
      operationalObservations: [],
      potentialActions: ["Configure GROK_API_KEY or GEMINI_API_KEY in environment variables."],
      confidenceScore: 0
    };
  }`;

// Fix generateRawWithGrok fallback
const targetRawFallback = /if \(!config\.apiKey\) \{[\s\S]*?return "### KHIZR Executive Operations Intelligence[\s\S]*?\}/;
const correctRawFallback = `if (!config.apiKey) {
    logStage(requestId, "Pipeline Info", "✓", "External AI model provider API key is not configured.");
    return "⚠️ **AI Model Provider Unavailable**\\n\\nExternal AI model provider credentials (GROK_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY) are currently not configured in environment variables. AI model inference cannot be performed at this time.\\n\\nPlease configure your AI API credentials in environment variables to enable live model reasoning.";
  }`;

code = code.replace(targetJsonFallback, correctJsonFallback);
code = code.replace(targetRawFallback, correctRawFallback);

fs.writeFileSync("lib/ai/grok.ts", code, "utf8");
console.log("Applied strict KHIZR correction to lib/ai/grok.ts");
