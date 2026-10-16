#!/usr/bin/env node
/**
 * export-firestore-data.js
 *
 * Exports all operational Firestore collections to JSON files for migration to Google Sheets.
 * This is a backup and migration tool.
 *
 * IMPORTANT: Run this BEFORE making any Firestore → Sheets migration changes.
 *
 * Usage: node scripts/export-firestore-data.js
 */

const fs = require("fs");
const path = require("path");

// Firebase Admin SDK
const admin = require("firebase-admin");

// Load service account from the root directory
const serviceAccountPath = path.join(process.cwd(), "daaraynorg-9165c-c14dff5b2d5c.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account file not found at ${serviceAccountPath}`);
  console.error("   Download it from Firebase Project Settings → Service Accounts");
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const COLLECTIONS_TO_EXPORT = [
  "programs",
  "allocations",
  "sync_queue",
  "communications",
  "donors",
  "publicLedger",
];

const EXPORT_DIR = path.join(process.cwd(), "firestore-backup");

async function exportCollection(collectionName) {
  console.log(`\n📤 Exporting collection: ${collectionName}`);

  try {
    const snapshot = await db.collection(collectionName).get();

    const data = [];
    snapshot.forEach((doc) => {
      data.push({
        _docId: doc.id,
        ...doc.data(),
      });
    });

    const filename = path.join(EXPORT_DIR, `${collectionName}.json`);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));

    console.log(`   ✅ Exported ${data.length} documents`);
    console.log(`   📄 Saved to: ${filename}`);

    return data.length;
  } catch (error) {
    console.error(`   ❌ Error exporting ${collectionName}:`, error.message);
    return 0;
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════╗");
  console.log("║    FIRESTORE DATA EXPORT FOR SHEETS MIGRATION      ║");
  console.log("╚════════════════════════════════════════════════════╝");

  // Create backup directory
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    console.log(`\n📁 Created backup directory: ${EXPORT_DIR}`);
  } else {
    console.log(`\n📁 Using existing backup directory: ${EXPORT_DIR}`);
  }

  // Export metadata
  const startTime = new Date();
  console.log(`\n⏱️  Starting export at: ${startTime.toISOString()}`);

  // Export each collection
  let totalDocuments = 0;
  for (const collectionName of COLLECTIONS_TO_EXPORT) {
    const count = await exportCollection(collectionName);
    totalDocuments += count;
  }

  const endTime = new Date();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Create manifest file
  const manifest = {
    exportDate: startTime.toISOString(),
    durationSeconds: duration,
    collections: COLLECTIONS_TO_EXPORT,
    totalDocuments,
    backupLocation: EXPORT_DIR,
  };

  const manifestPath = path.join(EXPORT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n" + "═".repeat(56));
  console.log("✅ EXPORT COMPLETE");
  console.log("═".repeat(56));
  console.log(`\n📊 Summary:`);
  console.log(`   Total documents: ${totalDocuments}`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   Backup location: ${EXPORT_DIR}`);
  console.log(`\n📋 Collections exported:`);
  COLLECTIONS_TO_EXPORT.forEach((c) => {
    console.log(`   • ${c}.json`);
  });
  console.log(`   • manifest.json`);

  console.log(`\n⚠️  IMPORTANT NEXT STEPS:`);
  console.log(`   1. Review the exported data in: ${EXPORT_DIR}`);
  console.log(`   2. Verify record counts match your expectations`);
  console.log(`   3. Only then proceed with the Firestore → Sheets migration`);
  console.log(`   4. Keep this backup for rollback reference`);

  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ Export failed:", error);
  process.exit(1);
});
