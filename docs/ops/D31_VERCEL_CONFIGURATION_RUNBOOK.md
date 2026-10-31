# D31 Vercel configuration runbook (Preview first; Production untouched until D32 gates pass)

Nothing here was executed (no Vercel access). Names were read from the code (`lib/google/requestControl.ts`, `lib/google/allocationLease.ts`, `lib/financialActivation.ts`, `app/api/ops/*`, `.env.example`); none was invented.

## 1. Preview environment variables (server-side only; never `NEXT_PUBLIC_*`)
| Variable | Value | Notes |
|---|---|---|
| `GOOGLE_LIMITER_URL` | `https://<coordinator-host>` | the HTTPS coordinator |
| `GOOGLE_LIMITER_TOKEN` | the coordinator's `LIMITER_TOKEN` | secret |
| `GOOGLE_LIMITER_KEY_PREFIX` | ONE shared value, for example `daarayn:sheets` | the SAME in Preview and Production while they share the Google project and service identity. Do not append `preview`, `production`, `VERCEL_ENV` or a branch name. A separate prefix is correct only for a genuinely separate Google project |
| `GOOGLE_TARGET_ENV` | `test` | Preview uses the TEST spreadsheet |
| `GOOGLE_SHEET_ID`, `GOOGLE_TEST_SHEET_ID`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_DRIVE_TEST_FOLDER_ID` | the approved test resources | never a production id in Preview |
| `OPS_MONITOR_TOKEN` | new random 32+ characters | for `/api/ops/quota-status` and the Preview-only `/api/ops/probe`; remove the probe use after acceptance |
| `GOOGLE_SHEETS_READS_PER_MINUTE`, `GOOGLE_SHEETS_WRITES_PER_MINUTE`, `GOOGLE_SHEETS_BURST`, `GOOGLE_SHEETS_MAX_WAIT_MS`, `GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE`, `GOOGLE_SHEETS_PROJECT_WRITES_PER_MINUTE` | leave at the defaults (45, 45, 5, 25000, 200, 200) unless the real Google quotas were read and justify a change | |
| `ALLOCATION_SERIALIZATION_VERIFIED` | `true` in PREVIEW only, for the allocation acceptance tests; never in Production until the release gate | |
| `FINANCIAL_ACTIVATION_APPROVED` | leave unset (Preview is not paused anyway: only production environments are) | |
| existing application variables (Firebase, SMTP, Groq, Drive OAuth) | as already configured | not changed by this runbook; `TEST_RECIPIENTS` / `EMAIL_RECIPIENT_ALLOWLIST` must point only at approved test inboxes |
MUST BE ABSENT: `GOOGLE_LIMITER_REDIS_URL` (a raw Redis URL conflicts with the coordinator; the application now refuses to run with both set), `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL`, `GOOGLE_LIMITER_ON_COORDINATOR_FAILURE=degraded_local`, and the old aliases `GOOGLE_LIMITER_REDIS_REST_*` (accepted but redundant; the preferred names win if both exist).

## 2. Setting them (account owner)
`vercel env ls preview` first (names only; never print values), then `vercel env add GOOGLE_LIMITER_URL preview`, and so on; for a variable that already exists and conflicts: `vercel env rm GOOGLE_LIMITER_REDIS_URL preview` only after confirming nothing depends on it. Variables apply to NEW deployments only: run `vercel deploy` (no `--prod`) afterwards.

## 3. Checks after the Preview deployment
`GET /api/admin/diagnostics/google-readiness` (administrator): `limiter.mode: "shared"`, `limiter.ready: true`, no `conflict`. `GET /api/admin/diagnostics/quota-health`: coordinator metrics present. `OPS_MONITOR_TOKEN=... node scripts/preview-acceptance.mjs --base https://<preview-url> ...` (see the cross-instance report).

## 4. Production variables (prepared for D32; set only after the gates and with authorisation)
Same limiter variables and the SAME prefix; `GOOGLE_TARGET_ENV=production`; production spreadsheet and Drive folder ids; production OAuth and domain settings; `OPS_MONITOR_TOKEN` (a different random value is fine); `ALLOCATION_SERIALIZATION_VERIFIED` and `FINANCIAL_ACTIVATION_APPROVED` UNSET. No Preview test spreadsheet id and no `/api/ops/probe` token reuse. With `VERCEL_ENV=production` the probe answers 404 and donations, donation changes and allocations answer a paused 503.
