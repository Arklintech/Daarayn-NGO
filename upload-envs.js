const { execSync } = require('child_process');
const fs = require('fs');

const envFile = fs.readFileSync('.env.production', 'utf8');
const envs = envFile.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

for (const env of envs) {
  const eqIdx = env.indexOf('=');
  if (eqIdx === -1) continue;
  const key = env.slice(0, eqIdx);
  let value = env.slice(eqIdx + 1);
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  
  if (!key.startsWith('NEXT_PUBLIC_FIREBASE_') && key !== 'RESEND_API_KEY' && key !== 'FROM_EMAIL') continue;
  
  console.log('Adding ' + key + ' ...');
  try {
    execSync('npx vercel env add ' + key + ' production', { input: value });
    console.log('Added ' + key);
  } catch (err) {
    try {
      execSync('npx vercel env rm ' + key + ' production -y');
      execSync('npx vercel env add ' + key + ' production', { input: value });
      console.log('Updated ' + key);
    } catch(e) {
      console.log('Failed to add/update ' + key);
    }
  }
}
