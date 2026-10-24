# Communications and Email

## Providers
`lib/email/providerManager.ts`: `EMAIL_PROVIDER` = `gmail` (default; Nodemailer pooled transport, smtp.gmail.com:587 STARTTLS, 10/10/20 s timeouts; `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `FROM_EMAIL`) or `resend`. `verifyEmailProvider()` logs in without sending. Errors classified as retryable/permanent (auth, quota, 550/553/501 permanent).
**Delivery semantics:** success = SMTP server accepted (250). Inbox delivery, spam placement, bounces are not tracked.

## Donation acknowledgement
`sendDonationEmail` (HTML escaped) after intake, only for donors with email. Outcome returned in the API response; not persisted (field dropped by repository mapper).

## Broadcast flow
`/admin/communications` → `POST /resolve` → `POST /send`:
- `requireAdmin`; provider verify (503 on failure); `resolveRecipients(causeIds, type)`; `dedupeRecipients` (one email per address); `processBroadcast` inside the request (maxDuration 300, send budget 250 s, batches of 50 via `Promise.allSettled`, 2 attempts, permanent errors not retried); individual messages (no shared To/CC).
- Recorded in `Communications` (counts, status, top-5 error reasons) and in-memory `broadcastStore`; SSE `BROADCAST_COMPLETED`.
- Notes are converted to HTML without escaping (admin-trusted); attachments fetched from Drive or any admin-supplied URL (server-side fetch).

## Recipient eligibility (`lib/communication-resolver.ts`)
- `all|all_causes|all_donors` → every donation donor plus every donor with an email.
- Otherwise donation matches by exact cause id, title containment either way, **keyword overlap** (words >2 chars from title/category/id), or nested `selectedCauses` (always empty in practice). Donors whose preference text shares a keyword are added; `general_communication` with zero matches falls back to all donors.
- Type rules: contribution_confirmation = pending|completed|verified; project_progress and completion_report = completed|verified; allocation_confirmation = completed|verified|allocated; general = all.
- Consequences: over-inclusion likely; no excluded-recipient list; no per-recipient outcome rows; original communication type and cause ids not stored; no idempotency key (double click can double-send; response is sent with `Cache-Control: private, max-age=300`); `createdBy` stored as "Admin" not the actual admin.

## Other senders
- `/api/dispatch-updates`: reads programs/allocations, **sends no email but increments `emailsSent`** and writes no Communications row.
- `/api/admin/communications/automations`: real sends for milestones, but cause attribution uses `selectedCauses` (always empty) so it never matches; dedupe marker `milestonePercentage` is not a stored column, so if it ever matched it would resend on every run.
- `/api/test-email`: admin-only real send.

## Retry/failure handling
Per-recipient 2 attempts in-request; no queue, no resume. Deadline overrun marks remaining as failed with "Not attempted". Status endpoint reads the in-memory store (per instance) then the sheet.

## AI
`/api/admin/communications/ai-assist` (no auth; Anthropic) and "Generate with Khizr" UI text in `app/admin/communications/page.tsx` violate the approved decision; `.env`/`.env.local` still hold `AI_PROVIDER`, `GROK_*` names. Not restored or extended by this audit.
