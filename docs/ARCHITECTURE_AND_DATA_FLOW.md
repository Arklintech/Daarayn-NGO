# Architecture and Data Flow (verified by reading code)

## Request path
Browser → Next route handler → `requireAdmin/requireAgent` (Firebase ID token from `Authorization: Bearer` or cookie `daarayn_token`, verified by `firebase-admin`; **no `email_verified` or revocation check**) → repository (`BaseRepository`, per-instance 30 s cache, 3 s miss-refresh) → `SheetsService` (`values.get/append/update`, header-driven) → Sheets tab. Files → `DriveService`. Events → `realtimeBroadcaster.publish` → row in `Realtime_Events`.
`middleware.ts` only checks existence of cookie `daarayn_session` (JS-set, forgeable) for `/admin` and `/field` pages; `/api/*` is outside its matcher, so every API relies on its own guard.

## Authorization matrix (from code)
- `requireAdmin`: token email ∈ `ADMIN_EMAILS`.
- `requireAgent`: active row in `Field_Agents` (by firebaseUid or email).
- **No guard at all:** `GET /api/media/[fileId]`, `POST /api/donor/lookup`, `GET /api/donor/dashboard`, `POST /api/admin/communications/ai-assist`, `GET /api/causes` (public by design), `POST /api/donate` (public; IP rate-limit 15/min, in-memory, uses first `x-forwarded-for`).
- Other admin routes (`donations`, `donors`, `dashboard`, `notifications`, `communications/*`, `field-agents`, `ledger`, `dispatch-updates`, `test-email`, `media` POST) guarded by `requireAdmin`. Field routes guarded and owner-scoped (reports, chat, notifications, profile).

## Flow: donation
`DonateForm` (client; screenshot required, `accept=image/*`, UUID `submissionKey`) → `POST /api/donate` (multipart; amount `parseInt`>0, screenshot non-empty; **no type/size check**) → `donationService.processDonation`:
1. Drive upload to folder "Payment Proofs"; failure swallowed (donation still saved); `DriveService` itself falls back to local disk and returns id `local_*`.
2. `donorRepository.findByContact` (email lowercased or exact phone) else create donor `DNR-<base36>-<rnd>`.
3. `donationRepository.createWithUniqueId`: dedupe by `submissionKey`; append placeholder row `id=PENDING`, compute `DA###` from rows above it, rewrite, re-read and verify id appears once, up to 6 retries. Not a lock; a failed run can leave an orphan `PENDING` row.
4. Donor `donationHistory` update; SSE `DONATION_CREATED`; Notifications row; Audit_Log row; confirmation email (if donor has email); attempted persistence of email status (**dropped**, see issues F1).
Response includes `trackingId` and email status.

## Flow: verify
`PATCH /api/admin/donations` → `updateStatus` (fresh read, refuses duplicate ids, optional `expectedStatus` → 409) → Audit_Log → SSE `DONATION_UPDATED`. Statuses: pending / completed ("Verified") / rejected. Received = completed|verified|allocated.

## Flow: metrics
Dashboard, donors list, causes use `lib/donations/metrics.ts` over `loadSnapshot` (one `batchGet`). Persisted data only; no sample data in these paths. On Sheets failure `dashboard`, `admin/donations`, `admin/notifications` return HTTP 200 `success:true` with empty/zero data (cached copy ≤3 min first).

## Flow: communications
Admin page → `resolve` (count) → `generate` (static text) / `ai-assist` (Anthropic; forbidden) → `upload` (Drive) → `send` → `verifyEmailProvider` → `resolveRecipients` → `processBroadcast` in-request (batches of 50, 2 attempts, 250 s deadline) → `Communications` row. Details in `COMMUNICATIONS_AND_EMAIL.md`.

## Flow: field
Agent token → `POST /api/field/reports` (multipart; files to Drive "Field Reports/Images|Documents"; id `FR###` = max+1 from fresh read) → Field_Reports row → SSE to `admin` + `agent:<id>` → Notification → Audit_Log. Admin PATCH changes status; **`adminNotes` and `assignedAdminId` are not columns in `fieldReportRepository`, so they are not persisted**. Chat: `Field_Messages` plus `/tmp`/`data/field_chat.json` mirror.

## Realtime
Publish after persistence; row number = event id. Each instance with ≥1 SSE client polls `Realtime_Events` every 4 s (backoff to 30 s), invalidates local repo caches for events from other instances. Stream ends at 280 s; reconnect uses `Last-Event-ID`, replay ≤200 rows else `RESYNC`. Audience: `admin` or `agent:<id>`. Progress ticks are same-instance only. Log is never trimmed. Payloads are identifiers (reports/chat/agent events carry full objects — see issues).

## Integration boundaries
Sheets (googleapis, service account, scope spreadsheets+drive), Drive, SMTP (smtp.gmail.com:587 default), Firebase Identity Toolkit REST (agent creation `signUp`, password reset using the public web key), Sentry (config present), optional Anthropic (violation).
