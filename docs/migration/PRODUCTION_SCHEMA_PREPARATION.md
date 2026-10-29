# Daarayn — production worksheet and migration preparation (no production change made)

Prepared 2026-10-29. Source of truth for the expected headers: the schema registry filled by the repositories (`lib/google/schemaRegistry.ts`, dumped from the code on this date). Production status comes from the last read-only readiness run (D10/D12): 13 of 19 registered worksheets present, six missing. Nothing in production was created, edited or written.

## 1. Missing worksheets and what depends on them
| Worksheet | Blocks | Columns (expected header row) | Why |
|---|---|---|---|
| `Allocations` | **core financial release** | id, donationId, donorId, donorName, projectId, caseId, targetTitle, allocatedAmount, allocationDate, adminEmail, status, notes, createdAt, causeId, designationId, evidenceDriveFileIds, requestKey, reversedReason, reversedAt, reversedBy | allocations, reversals, donor allocation view, reconciliation |
| `Donation_Causes` | **core financial release** | id, donationId, causeId, causeTitle, designatedAmount, designationStatus, provenance, createdAt, updatedAt, updatedBy | every donation's cause relationship and designation; funding totals; allocation eligibility |
| `Communication_Recipients` | **core (communications)** | id, broadcastId, communicationType, scopeKey, donorId, donorName, email, donationIds, status, attempts, lastError, providerMessageId, eligibility, approvedBy, contentHash, createdAt, updatedAt | per-recipient outcomes, safe retries, no duplicate sends |
| `Program_Content` | **Programs feature** | id, template, cardSummary, cardDetails, ctaText, sortOrder, lead, heroAlt, heroCaption, primaryCtaText, navLabel, sections, lastUpdateAt, updateNote, holdClearedAt, holdClearedBy, updatedAt | public program pages, Masjid update hold |
| `Portal_Auth_Events` | feature (donor portal) | id, ts, kind, ipHash, identHash, donorHash, nonceHash, ref, detail | rate limits and one-time-code use; without it the portal fails safe (no sign-in) |
| `_Secrets` | feature (Drive uploads) | key, value, updatedAt, updatedBy | encrypted Drive authorisation token; uploads fail without a token store |
Legacy columns: Causes, Donors, Donations, Field_Reports and Communications lack newer columns in production. The application appends a missing column on the first write and older rows read as blank (supported fallback, not blocking). A duplicate header, an empty header row or a renamed header is blocking (drift checker reports these).
Also present in the registry and expected to exist: Audit_Log, Campaigns, Causes, Communications, Donations, Donors, Field_Agents, Field_Messages, Field_Reports, Notifications, Program_Images, Programs, Realtime_Events.

## 2. Preflight (read-only, repeat on the rehearsal copy and again on production)
1. Run `GET /api/admin/diagnostics/google-readiness` as an administrator: expect `schema_incomplete` before, `operational` after; `writeTarget` must be `target_ok` only on the rehearsal copy.
2. Record per-worksheet row counts and the highest Donation ID and Donor Token.
3. Confirm no duplicate Donation IDs, submission keys, donor tokens (the integrity analysis of D17 section 97 can be re-run read-only).

## 3. Idempotent migration logic (already in the code)
`ensureSheetExists(tab, headers)` creates a missing tab with its header row once, tolerates "already exists" from a racing instance, and never rewrites an existing header row; extra or newer columns are appended, never reordered or removed. The setup operation (`lib/setup/operationsSchema.ts`) has a dry-run (default) and an apply mode; apply creates missing tabs, appends missing header columns only, and backfills `Donation_Causes` for legacy donations that name ONE unambiguous cause (designated at the donation amount, provenance `donor_selected`, updatedBy `setup-backfill`; multi-cause or unknown cases are not guessed); repeating it adds nothing that exists. No step deletes or overwrites a record.

## 4. Backup, rehearsal, rollback, approval
1. **Backup**: File → Make a copy of the production spreadsheet (same owner), name it with the date; export each tab to CSV; keep the Drive folder untouched.
2. **Rehearsal copy**: point an isolated process at the copy only (new `GOOGLE_TEST_SHEET_ID`, added to the committed allowlist in `lib/google/approvedTargets.ts` in a reviewed change); run the setup; run preflight again; compare row counts (unchanged for existing tabs; new tabs empty or backfilled), relationship checks (every donation has its designation row; designated totals equal donation amounts where resolved), dashboard and reconciliation figures before and after.
3. **Rollback criteria**: any record-count change in an existing tab, any duplicate id, any reconciliation exception that did not exist before, readiness not `operational`. Rollback = stop the release; the copy is discarded, production was never touched; if production was migrated, restore from the backup copy and redeploy the previous build.
4. **Authorised executor and approval**: the owner (or a named administrator they appoint) runs the migration on production only after the rehearsal passes and they approve in writing; set `GOOGLE_TARGET_ENV=production`, `GOOGLE_PRODUCTION_SHEET_ID`, `GOOGLE_PRODUCTION_DRIVE_FOLDER_ID` in the production environment first.
5. **Status**: rehearsal BLOCKED — no production-equivalent copy exists. A read-only schema comparison is not evidence that the migration is safe.

## 5. Environment mapping the owner must set
| Variable | Development / test | Production |
|---|---|---|
| `GOOGLE_TARGET_ENV` | `test` | `production` |
| `GOOGLE_SHEET_ID` | the approved test sheet | the production sheet |
| `GOOGLE_TEST_SHEET_ID` | the approved test sheet | (unset) |
| `GOOGLE_PRODUCTION_SHEET_ID` | (set to the production id as a veto) | the production sheet |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | the approved test folder or empty | the production evidence folder |
| `GOOGLE_DRIVE_TEST_FOLDER_ID` | the approved test folder | (unset) |
| `GOOGLE_PRODUCTION_DRIVE_FOLDER_ID` | (set as a veto) | the production folder |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | optional locally | required (base64 of 32 bytes) |
