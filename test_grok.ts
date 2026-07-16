import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generateWithGrok } from './lib/ai/grok';

async function main() {
  try {
    const res = await generateWithGrok(
      'You are MOMIN. Respond in JSON: {\"executiveSummary\":\"...\"}', 
      'Give me an executive summary of financial health of Daarayn', 
      { model: process.env.GROK_MODEL || 'llama-3.3-70b-versatile', temperature: 0.15, maxTokens: 2000 }
    );
    console.log('SUCCESS:', res);
  } catch (e) {
    console.error('ERROR:', e);
  }
}
main();
