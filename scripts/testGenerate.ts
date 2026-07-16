import { generateWithGrok } from "../lib/ai/grok";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function run() {
  try {
    const res = await generateWithGrok("You are a helpful assistant.", "Why was Daarayn created?", {
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      maxTokens: 500
    });
    console.log("Success:", res);
  } catch(e) {
    console.error("Error generating with Grok:", e);
  }
}

run();
