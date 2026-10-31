# D32 Production deployment runbook (not executed; every step needs the stated approval)

Order is mandatory. Stop at the first failed gate.

## A. Preconditions (all true)
Coordinator hosted and verified (D31.2); Preview certified with independent Vercel invocations (D31.5/D31.7); an alert delivered to the authorised recipient (D31.6); owner decisions for OAuth route, domain, privacy page; production worksheets plan approved; final source revision committed and identical to the tested Preview revision; owner authorisation recorded in `docs/audit/` (who, when, which revision).

## B. Production environment (set with `vercel env add NAME production`; values never printed or committed)
Same coordinator variables and the SAME `GOOGLE_LIMITER_KEY_PREFIX` as Preview; `GOOGLE_TARGET_ENV=production`; production spreadsheet id (`GOOGLE_PRODUCTION_SHEET_ID` / `GOOGLE_SHEET_ID`) and Drive folder ids; production Firebase and OAuth settings (authorised domain and redirect URIs set in the respective consoles first); SMTP settings with the recipient allowlist logic intact; `OPS_MONITOR_TOKEN`. UNSET in production: `GOOGLE_LIMITER_REDIS_URL`, `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL`, `ALLOCATION_SERIALIZATION_VERIFIED`, `FINANCIAL_ACTIVATION_APPROVED`, any test spreadsheet id.

## C. Deploy
1. `vercel env ls production` (names only) and compare with section B.
2. Deploy the verified revision with the approved process (promote the certified Preview build, or `vercel --prod` from the tagged revision). Record deployment id, URL, source revision.
3. Attach the domain only after DNS ownership is confirmed; confirm HTTPS.

## D. Read-only smoke tests (no donation, no allocation, no e-mail)
Public pages answer; `/api/ops/probe` answers 404; `POST /api/donate` answers the paused 503; admin sign-in works; `google-readiness` shows `limiter.mode shared, ready true`, no `conflict`; coordinator `/health` and `/ready` answer; `quota-status?min=high` answers 200 with the monitor token; no console errors on the home page; record the results.

## E. Restricted state check
Confirm in the Vercel dashboard (names only) that `FINANCIAL_ACTIVATION_APPROVED` and `ALLOCATION_SERIALIZATION_VERIFIED` are absent. Donations, donation changes and allocations must answer the paused 503.

## F. Handover
Set the rollback target (previous deployment id), start the daily and weekly checks, schedule the first monthly drill, and keep the production spreadsheet untouched until the onboarding stage begins.
