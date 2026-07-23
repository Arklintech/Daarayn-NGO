# Daarayn Platform — Firestore Backup & Recovery Policy

**Status:** Active  
**Owner:** Platform Administrator  
**Review Cadence:** Quarterly (with tested restore)

---

## Backup Strategy

### Option A — Firebase Managed Exports (Recommended)

Enable automatic daily Firestore exports to Google Cloud Storage:

```bash
# One-time setup — enable export from Firebase CLI
firebase firestore:export gs://YOUR_BACKUP_BUCKET/$(date +%Y-%m-%d) --project daarayn
```

#### GCS Bucket Setup
1. Create a GCS bucket: `gs://daarayn-firestore-backups`
2. Enable Firebase service account permission: `roles/storage.objectAdmin`
3. Schedule daily export via Cloud Scheduler:
   - Job name: `firestore-daily-export`
   - Frequency: `0 2 * * *` (2am IST daily)
   - Target: Firestore Admin API export endpoint

#### Retention
- Keep daily exports for 30 days
- Keep weekly exports for 90 days
- Keep monthly export for 1 year

---

### Option B — Manual Export (Fallback)

Run before any major deployment:

```bash
firebase firestore:export gs://daarayn-firestore-backups/manual-$(date +%Y-%m-%d-%H%M) --project daarayn
```

---

## Collections Requiring Priority Backup

| Collection | Why | Backup Priority |
|---|---|---|
| `donations` | Financial records | **Critical** |
| `allocations` | Financial records | **Critical** |
| `ledger` | Public accountability | **Critical** |
| `donors` | PII | **Critical** |
| `beneficiaries` | PII | **Critical** |
| `field_reports` | Operational records | High |
| `programs` | Campaign data | High |
| `admin_notifications` | Audit trail | Medium |
| `khizr_conversations_history` | AI audit trail | Medium |

---

## Recovery Procedure

### From GCS Export

```bash
# Restore to a temporary Firestore project for verification first
firebase firestore:import gs://daarayn-firestore-backups/2026-07-17 --project daarayn-restore-test

# Once verified, import to production
firebase firestore:import gs://daarayn-firestore-backups/2026-07-17 --project daarayn
```

**Warning:** Importing overwrites existing documents with the same ID. Always restore to a test project first.

---

## Quarterly Restore Test

Every quarter, perform a full restore drill:

1. [ ] Export current Firestore to GCS
2. [ ] Create a temporary Firebase project
3. [ ] Import the most recent daily backup into the test project
4. [ ] Verify at least 3 documents from each Critical collection exist and are readable
5. [ ] Delete the temporary project
6. [ ] Document the test result and date here:

| Date | Tested By | Collections Verified | Result |
|---|---|---|---|
| _(fill on first test)_ | | | |

---

## Incident Response — Data Loss Scenario

If data loss is detected:
1. **Stop** all writes to affected collections immediately (take the app offline if needed)
2. Identify the last known-good backup timestamp
3. Restore to test project and verify integrity
4. Import to production
5. Audit the delta (what was lost between backup and incident)
6. Notify affected donors/beneficiaries if their PII records were affected

---

*Last reviewed: 2026-07-17*
