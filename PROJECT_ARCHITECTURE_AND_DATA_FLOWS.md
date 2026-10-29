# ARCHITECTURE & DATA FLOWS (intended vs. actual, 2026-10-17)

## 1. Google Sheets (spreadsheet id from `GOOGLE_SHEET_ID`, with a hardcoded fallback id in `lib/google/client.ts`)
Access: `lib/google/sheets.ts` `SheetsService` (header-driven records; row numbers 1-based; append via `values.append`; update via `values.update` at a row number). `BaseRepository` adds a per-instance cache (30 s TTL, 3 s miss-refresh). Credentials: a local service-account JSON file if found (gitignored; never in git history), else `GOOGLE_CLIENT_EMAIL`/`GOOGLE_PRIVATE_KEY`. A hardcoded Windows path to another checkout is in the lookup list.

| Tab | Repo | Key fields | Notes / integrity risks |
|---|---|---|---|
| Donations | `donationRepository` | id `DA###`, donorId, donorName, donorEmail, amount, currency, date, status, paymentMethod, causeId, causeTitle, proofDriveFileId, transactionReference, notes, submissionKey | statuses pending/completed(verified)/rejected (+allocated). `selectedCauses` is never stored (always `[]` on read). `confirmationEmail*` fields not in headers/mapper → not persisted. `getById`-style `save()` is lookup-then-append (non-atomic) |
| Donors | `donorRepository` | id `DNR-<base36>-<rnd>`, name, email, phone, country, city, donationPreference, communicationPreference, dateJoined, legacy counters, donationHistory/projectsSupported/casesSupported (JSON) | Link to donations is by `donorId`, fallback normalized email (metrics.ts). Create is not atomic: two simultaneous first-time submissions can create two donors. `lib/db.ts getOrCreateDonor` uses a different id format (`DNR-YYYY-NNNNNN` by row count) |
| Causes | `causeRepository` | id, title, category, targetAmount, raisedAmount(legacy), location, description, status, imageUrl, driveFileId, createdAt | Public site and admin both read `/api/causes` (same records) but `DEFAULT_CAUSES` fallback exists in code (ids like `clean-water-wells`) and the donate form may use `general` |
| Campaigns / Programs / Allocations | respective repos | | Not wired to any admin page; Programs/Campaigns pages write Causes rows instead |
| Field_Reports | `fieldReportRepository` | FR### etc. | ID = max+1 from a fresh read, not atomic → duplicate-id race |
| Field_Agents | `fieldAgentRepository` | FA### + firebaseUid, email, status… | same race |
| Field_Messages | `fieldMessageRepository` | MSG-* | also mirrored to `/tmp/field_chat.json` (Vercel ephemeral) |
| Notifications | `notificationRepository` | id, recipientType, recipientId, type, title, message, read, isStarred, relatedEntityId, createdAt | read/star state is global, not per admin; delete is not persisted |
| Communications | `communicationRepository` | id `BCAST-*`, type ("Email Broadcast"), subject, bodyText(=eyebrow), selectedCauses(=cause NAMES), recipientCount, sentCount, failedCount, status, createdBy("Admin"), createdAt, completedAt, errorSummary | no per-recipient rows, no recipient addresses, original communication type and cause ids not stored |
| Audit_Log | `auditLogRepository` | actor, action, entity, before/after, timestamp, source | append-only by convention only |
| Realtime_Events | `lib/realtime/eventLog.ts` | eventId,type,audience,payload,createdAt,origin | event id = sheet row number; grows unbounded |
| _System | `initializeSystemMetadata` | schema/migration info | |

## 2. Donation lifecycle (actual)
1. `/pay` form → `POST /api/donate` (multipart: donorName, donorContact, upiRef, amount, cause, selectedCauses JSON, screenshot required, submissionKey). Validation: amount > 0 integer, screenshot present. **No file type/size validation.**
2. `processDonation`: upload proof to Drive folder "Payment Proofs" (failure is swallowed; donation still recorded); `donorRepository.findByContact` (email lowercase or phone exact) else create donor; resolve cause (`resolveCauseId` by id, then exact/partial title match; only if exactly one cause selected) ; `createWithUniqueId`.
3. `createWithUniqueId`: return existing row if `submissionKey` seen; append placeholder row (`id=PENDING`) to fix its position; compute `DA<max id in earlier rows + 1>`; write; re-read and verify the id appears once; retry up to 6x. This closes the common races but is not a lock — duplicates that pre-exist in the sheet (e.g. historical DA006) are surfaced by `/api/admin/donations` as `duplicateIds` and block status changes (`AMBIGUOUS_ID`). Whether current sheet data still holds a duplicate DA006 is UNVERIFIED.
4. After the row: donor history list update, SSE `DONATION_CREATED`, admin notification, audit log, confirmation email (only if donor contact is an email). Result `confirmationEmailSent/Error` returned to the browser; **not persisted** (see above).
5. Admin verify/reject: `PATCH /api/admin/donations` → `updateStatus` (fresh read, single-row check, optional `expectedStatus` conflict 409) → audit → SSE. Row write is read-then-update without a version check beyond status.
6. Totals: `metrics.ts` only. Dashboard, causes, donors list/detail, admin donations page share these functions (consistency by construction, not proven by test).

## 3. Cause lifecycle
Admin `POST /api/causes` upserts a Causes row; SSE `CAUSE_UPDATED`. Public pages and the donate form read `GET /api/causes` (public-safe mapping; raised = verified donations by cause). No delete/deactivate endpoint besides editing `status`. Images: `imageUrl` or `/api/media/<driveFileId>`.

## 4. Communications flow
UI `communications/page.tsx` → `resolve` (count) → `generate` (static template text per type) and/or `ai-assist` (Anthropic — forbidden) → optional `upload` (Drive) → `send`:
- `requireAdmin`; `verifyEmailProvider()` (SMTP login check, 503 on fail); `resolveRecipients(causeIds, type)`; `dedupeRecipients`; `processBroadcast` (50-recipient batches via Promise.allSettled, 2 attempts, `deadline` 250 s) **inside the request**; saves a `Communications` row; SSE.
- Recipient resolution (`lib/communication-resolver.ts`): `all`/`all_causes`/`all_donors` ⇒ every donation; else a donation matches if causeId equals, title substring either way, **keyword overlap** (words >2 chars from cause title/category/id), or nested selectedCauses (always empty). Then type rules: contribution_confirmation = pending/completed/verified; project_progress & completion_report = completed/verified; allocation_confirmation = completed/verified/allocated/allocationStatus; general = all. Registered donors whose preference text shares a keyword are added; `isAll` or general-with-zero-matches adds **all donors with emails**. Direct donor ids may be passed in `causeIds`. Consequences: broad keyword matching can over-include (and pending donors get "contribution" mail); "Quick Donations" is not a separate audience in code; multi-cause is supported by the list; excluded recipients/reasons are not computed or returned. Unmatched donors with `donorEmail` blank rely on donor-record email lookup by id.
- Delivery semantics: `result.success` = SMTP accepted. The UI/API report "sent" = accepted. Failures aggregated by top-5 reasons. No inbox confirmation, no bounce handling.
- `GET /status?id=` reads the in-memory store (per instance) then the Communications sheet.
- Duplicate-send risk: no idempotency key on `send`; the response sets `Cache-Control: private, max-age=300` on a POST.

## 5. Field flow
Agent signs in with Firebase (`/field/login`) → token cookie → `POST /api/field/reports` (agent identity forced from session; files to Drive; ID `FR###` max+1; Sheets row; SSE to admin + that agent; notification; audit). Admin reviews in `/admin/field-ops` (PATCH status/notes/assignment, which writes a notification for the agent and audit). Chat: agents restricted to their general thread and their report threads; sender identity from session; Sheets + `/tmp` JSON mirror; SSE to admin + owner. Admin/agent evidence viewed through unauthenticated `/api/media/<id>`. Offline queue/IndexedDB scaffolding exists in `lib/pwa/db.ts`; actual retry behavior not verified.

## 6. Auth
Client Firebase sign-in → `writeAuthCookies` (ID token cookie 1 h, JS-set, not HttpOnly) → every API verifies via `firebase-admin verifyIdToken` (no revocation check, **no `email_verified` check**). Admin = email in `ADMIN_EMAILS`. Agent = Field_Agents row by firebaseUid or email with status active. Field-agent accounts are created through the public Identity Toolkit `signUp` REST endpoint using the public web API key, which implies email/password self-sign-up is enabled on the Firebase project (to confirm in console) — with no `email_verified` check, an admin allow-list email that has no Firebase account yet could be claimed by anyone. `lib/security/rbac.ts` roles are defined but not used by routes.

## 7. SSE
Publish: after persistence, `appendEvent` writes a row to `Realtime_Events` and fans out locally. Each instance with clients polls the sheet every 4 s (backoff to 30 s). Stream: admin sees `admin` audience; agent sees `agent:<id>`; heartbeat 15 s; closes at 280 s; `Last-Event-ID` replay up to 200 rows else `RESYNC`; client resyncs after being hidden ≥15 s. Not proven across independent devices/instances. Cost/quota: each open stream per instance polls Sheets; log never trimmed.

## 8. Dashboard
`/api/admin/dashboard` reads donations, donors, causes, field reports, audit log in one batchGet, 20 s timeout. On error it returns HTTP 200 `success:true` with **all-zero stats** (or a ≤3-minute cached copy) flagged `cached:true, error`. Admin donations/notifications APIs do the same (empty list as success). UI must treat `error` as failure; unverified.

## 9. Security boundaries summary
See PROJECT_KNOWN_ISSUES_AND_NEXT_STEPS.md (items S1–S9).
