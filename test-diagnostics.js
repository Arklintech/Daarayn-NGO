#!/usr/bin/env node
/**
 * test-diagnostics.js
 *
 * Verify Firebase Auth and Gmail SMTP configuration locally.
 * Run: node test-diagnostics.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║       DAARAYN Diagnostic Test Suite                    ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// 1. Environment Variables
console.log('1️⃣  ENVIRONMENT VARIABLES CHECK\n');

const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_PROVIDER',
];

const envPath = path.join(process.cwd(), '.env.local');
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
} else {
  console.error('❌ .env.local not found\n');
  process.exit(1);
}

const missing = [];
requiredVars.forEach((varName) => {
  const regex = new RegExp(`^${varName}=`, 'm');
  if (regex.test(envContent)) {
    const line = envContent.split('\n').find((l) => l.startsWith(varName + '='));
    const value = line.split('=')[1];
    const masked = value && value.length > 20 ? value.slice(0, 10) + '...' + value.slice(-5) : value;
    console.log(`  ✅ ${varName}=${masked}`);
  } else {
    console.log(`  ❌ ${varName} — NOT SET`);
    missing.push(varName);
  }
});

if (missing.length > 0) {
  console.log(`\n⚠️  Missing ${missing.length} environment variable(s). Add them to .env.local\n`);
  process.exit(1);
}

// 2. Service Account
console.log('\n2️⃣  SERVICE ACCOUNT CHECK\n');

const saPath = path.join(process.cwd(), 'daaraynorg-9165c-c14dff5b2d5c.json');
if (!fs.existsSync(saPath)) {
  console.error('❌ Service account JSON not found at:\n  ' + saPath + '\n');
  process.exit(1);
}

try {
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  console.log(`  ✅ Service account found`);
  console.log(`     Project: ${sa.project_id}`);
  console.log(`     Email: ${sa.client_email}`);
  console.log(`     Type: ${sa.type}\n`);
} catch (err) {
  console.error('❌ Service account JSON invalid:\n  ' + err.message + '\n');
  process.exit(1);
}

// 3. Firebase Configuration
console.log('3️⃣  FIREBASE CONFIGURATION CHECK\n');

const firebasePath = path.join(process.cwd(), 'lib', 'firebase.ts');
if (!fs.existsSync(firebasePath)) {
  console.error('❌ lib/firebase.ts not found\n');
  process.exit(1);
}

const firebaseContent = fs.readFileSync(firebasePath, 'utf8');
const checks = [
  { name: 'getAuth()', pattern: /getAuth\(/ },
  { name: 'Firestore NOT initialized', pattern: /const db: any = null/ },
  { name: 'Config validation', pattern: /isFirebaseConfigValid/ },
];

checks.forEach((check) => {
  if (check.pattern.test(firebaseContent)) {
    console.log(`  ✅ ${check.name}`);
  } else {
    console.log(`  ❌ ${check.name}`);
  }
});

// 4. Gmail SMTP Configuration
console.log('\n4️⃣  GMAIL SMTP CONFIGURATION\n');

const gmailPath = path.join(process.cwd(), 'lib', 'email', 'providers', 'gmail.ts');
if (!fs.existsSync(gmailPath)) {
  console.error('❌ Gmail provider not found at:\n  ' + gmailPath + '\n');
  process.exit(1);
}

const gmailContent = fs.readFileSync(gmailPath, 'utf8');
const gmailChecks = [
  { name: 'Nodemailer import', pattern: /import nodemailer from/ },
  { name: 'SMTP auth configured', pattern: /auth:\s*\{[\s\S]*?user:.*?pass/ },
  { name: 'Connection pooling', pattern: /pool: true/ },
  { name: 'Error classification', pattern: /classifySmtpError/ },
];

gmailChecks.forEach((check) => {
  if (check.pattern.test(gmailContent)) {
    console.log(`  ✅ ${check.name}`);
  } else {
    console.log(`  ❌ ${check.name}`);
  }
});

// 5. Realtime Infrastructure
console.log('\n5️⃣  REALTIME INFRASTRUCTURE\n');

const realtimeFiles = [
  'lib/realtime/events.ts',
  'lib/realtime/eventLog.ts',
  'lib/realtime/broadcaster.ts',
  'lib/realtime/client.ts',
  'lib/realtime/useRealtime.ts',
  'app/api/realtime/stream/route.ts',
];

let allRealtimeOk = true;
realtimeFiles.forEach((file) => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} — NOT FOUND`);
    allRealtimeOk = false;
  }
});

// 6. Summary
console.log('\n' + '─'.repeat(56) + '\n');

if (missing.length === 0 && allRealtimeOk) {
  console.log('✅ ALL DIAGNOSTICS PASSED\n');
  console.log('Next steps:\n');
  console.log('1. Verify Firebase Auth settings:');
  console.log('   → Go to: https://console.firebase.google.com');
  console.log('   → Project: daaraynorg-9165c');
  console.log('   → Authentication > Sign-in method');
  console.log('   → Email/Password should be ENABLED\n');
  console.log('2. Test SMTP locally:');
  console.log('   → Create test-smtp.js (see SMTP_EMAIL_DIAGNOSIS.md)');
  console.log('   → Run: node test-smtp.js\n');
  console.log('3. Start dev server:');
  console.log('   → npm run dev');
  console.log('   → Try login at http://localhost:3000/admin/login\n');
  process.exit(0);
} else {
  console.log('❌ DIAGNOSTICS INCOMPLETE\n');
  console.log('Fix the issues above, then run this test again.\n');
  process.exit(1);
}
