import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.production');
const env = readFileSync(envPath, 'utf-8');
const lines = env.split('\n').filter(l => l && !l.startsWith('#') && l.includes('='));

for (const line of lines) {
  const parts = line.split('=');
  const key = parts[0].trim();
  const value = parts.slice(1).join('=').trim();
  if (key && value) {
    console.log(`Adding ${key}...`);
    try {
      execSync(`npx vercel env add ${key} production`, { input: value });
    } catch (e) {
      console.log(`Error adding ${key} (might already exist)`);
    }
  }
}
console.log('Done!');
