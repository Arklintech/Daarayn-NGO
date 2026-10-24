# Credentials and Integration Checklist

Names are the ones the code reads. Never paste values into chat, source or tests. Levels: **configured** (variable present) → **valid** (accepted by the provider) → **permitted** (can read/write what is needed) → **tested** (flow run). On 2026-10-24 only "configured" could be checked (booleans on `.env.local`); no live call was made, so every integration is **NOT TESTED / BLOCKED**.

| Integration | Variables read by code | Configured locally | Action / permission needed | How to verify (after configuring) | Blocked until then |
|---|---|---|---|---|---|
| Google Sheets (read+write) | `GOOGLE_SHEET_ID`, `GOOGLE_CLIENT_EMAIL` (or `GOOGLE_SERVICE_ACCOUNT_EMAIL`), `GOOGLE_PRIVATE_KEY` (or local `GOOGLE_APPLICATION_CREDENTIALS` JSON) | yes (values not validated) | Share the **test** spreadsheet with the service-account email as Editor; enable Sheets API. Use a separate test sheet, not production | Set `GOOGLE_SHEET_ID` to the test sheet; run the app, open `/admin/dashboard`; tabs auto-create | live donation/CRM/communication tests |
| Google Drive (upload+read) | `GOOGLE_DRIVE_ROOT_FOLDER_ID` (code falls back to a hardcoded id) + same service account | folder id **not set** | Create a test folder, share with the service account as Editor (Shared Drive recommended: service accounts have no personal quota), enable Drive API | Submit a donation on a test setup; `proofDriveFileId` must not start with `local_` | proof upload, evidence viewing |
| Firebase Authentication | `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`; server uses `FIREBASE_PROJECT_ID` or the public project id | yes | Create the admin user in Firebase console; confirm whether email/password self sign-up is enabled (disable it) | Sign in at `/admin/login` with an `ADMIN_EMAILS` account | admin UI tests |
| Admin allow-list | `ADMIN_EMAILS` (comma list) | yes | Must include the admin's verified Firebase email | `GET /api/admin/session` returns success | all admin APIs |
| Gmail SMTP | `EMAIL_PROVIDER=gmail`, `SMTP_USER`, `SMTP_PASS` (App Password), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `FROM_EMAIL` | yes — **the previous app password was exposed in local commit 3b244e1; rotate it** | New App Password (2-Step Verification on); update `.env.local` and Vercel | `verifyEmailProvider` (the send route runs it first); send only to your own mailbox | any real send |
| Site URL | `NEXT_PUBLIC_SITE_URL` | yes (`.env`) | Production URL for email links | links in a test email | — |
| Sentry (optional) | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | yes | Optional | — | — |
| Resend (alternative provider) | `RESEND_API_KEY`, `FROM_EMAIL` | yes | Only if `EMAIL_PROVIDER=resend` | — | — |
| Must be removed | `ANTHROPIC_API_KEY` (not set), `AI_PROVIDER`, `GROK_*` | stale | Delete from `.env`, `.env.local` and Vercel | — | — |

## Re-running the blocked tests
`npm test` (Vitest) uses an in-memory Sheets fake and mocks Drive/SMTP/Firebase; it needs no credentials and cannot touch real data. Live checks are manual, on a **test** spreadsheet/Drive/mailbox: submit a donation, verify it, preview and send a communication to your own address, retry a failed one, confirm rows in `Donations`, `Donors`, `Communication_Recipients`, `Communications`.
