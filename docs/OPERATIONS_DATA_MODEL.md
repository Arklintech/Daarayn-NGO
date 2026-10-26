# Unified operations model (2026-10-27)

Google Sheets stays the only operational store; Drive holds files; Firebase authenticates; Gmail SMTP sends; SSE notifies. No new database.

## Canonical records and relationships
| Concept | Tab (repository) | Permanent id | Notes |
|---|---|---|---|
| Donor | Donors | `DNR-<base36>-<4>` Donor Token | one per person, matched by normalized email/phone (never name); `emailSuppressed` opt-out |
| Donation | Donations | `DA###` | one row per payment; `submissionKey` idempotency; `causeSelection` (validated ids), `opStatus`/`opPending` follow-up state |
| Cause / project / campaign | Causes | `CAUSE-…` or a safe client id | lifecycle `Draft, Active, Urgent, Completed, Inactive`; `kind` cause/project/campaign; selectable = Active/Urgent |
| Donation ↔ cause | **Donation_Causes** (new) | `DC-<donationId>-<causeId>` | one row per relationship; single cause ⇒ `designated` full amount; several causes ⇒ `unresolved` (blank amount) until an admin records a split; `general` ⇒ no row |
| Allocation | Allocations | `ALLOC-…` | `donationId`, `causeId`, `designationId`, `evidenceDriveFileIds`, `requestKey`, reversal fields; status `active`/`reversed` |
| Campaign | Communications | `BCAST-…` | type, cause ids, counts incl. `unresolvedCount` |
| Recipient outcome | **Communication_Recipients** (new) | `<broadcast>:<donor>` | status `queued/attempted/smtp_accepted/failed/unresolved`, `eligibility` (causes + donations), `approvedBy`, `contentHash` |

A cause **selection** is not an allocation. The browser's amounts are discarded; multi-cause donations are never reported against each cause.

## Business rules (server-enforced)
- **Donation status policy:** verified = completed/verified/allocated; pending = unverified; rejected/failed/cancelled never count. Unfinished `PENDING` placeholder rows are not donations.
- **Designations:** an admin split must cover every related cause, use positive amounts and total the donation exactly (to the paisa); allocations cannot exceed it.
- **Allocation:** donation verified; designation recorded; total active ≤ designated (checked before and after the write; concurrent breach is rolled back); evidence is attached only after the Drive upload succeeded, else nothing is recorded; idempotent by `requestKey`; reversal keeps the record.
- **Purposes:** `contribution_confirmation`/`project_progress` verified donation related to the cause; `allocation_confirmation` + active allocation; `completion_report` + cause Completed + allocation with evidence; `general_communication` non-rejected donation (or all active donors for "All donors"). Opt-out excludes all but `contribution_confirmation`. Empty audience is a result; the audience is never widened.
- **Approval:** the review step issues an HMAC-signed token (30 min) bound to admin + purpose + causes + subject/body/media + exact recipient set; any change invalidates it; every approved recipient must still be eligible at send time. Admin text is HTML-escaped.
- **Delivery states:** `smtp_accepted` ≠ delivered. An ambiguous failure (connection lost after DATA) is `unresolved`: never auto-resent, excluded from new sends, retried only on an explicit flag with a duplicate warning.

## Dashboard definitions
`lib/reporting/dashboard.ts`: donation counts are distinct donations; cause contribution = explicit designated verified amounts; unresolved-distribution and unrestricted are separate buckets so `Σ designated + unresolved + unrestricted = verified total`; allocated = active allocations (not "spent"); communication metrics = recipient rows. Sheets failure ⇒ HTTP 503, never zeros.

## Recovery
Follow-up steps (relationships, notification, audit) are idempotent and tracked in `opPending`. `GET/POST /api/admin/reconciliation` lists and repairs interrupted donations; `findIntegrityExceptions` also flags duplicate ids/tokens, orphan/unknown designations, allocations exceeding designations or on unverified donations.

## Schema setup and migration (production procedure, NOT executed)
Endpoint: `POST /api/admin/setup/operations` (admin). Body `{}` = dry run (reads only, reports tabs/columns to add and legacy donations to backfill); `{"apply":true,"backfill":true}` applies. It only creates tabs, appends missing header columns and backfills `Donation_Causes` for legacy single-cause donations (provenance `donor_selected`, updatedBy `setup-backfill`); it never renames, clears or deletes. Missing columns are also added on first write.
Production steps (needs your approval): 1) copy/backup the spreadsheet; 2) run the dry run against production and review; 3) run with `apply`; 4) call `GET /api/admin/reconciliation` and the dashboard to confirm 0 integrity errors; 5) review legacy multi-cause history (never stored) manually.

## Limitations (honest)
Sheets has no transactions or cross-instance locks: uniqueness relies on append-then-verify, and a crash can leave follow-up work pending (visible and recoverable, not atomic). Quota (60 reads and 60 writes/min/user) is smoothed by retry, not removed. Admin UI for designations, allocations, reconciliation and the setup endpoint is API-only; only the dashboard summary, review/approve flow and donor history data are surfaced in existing screens. Donation types and per-campaign rules beyond `kind` are not modelled. The public `QuickDonationRibbon` still carries a static fallback list when the catalog is empty. Legacy multi-cause history cannot be reconstructed.
