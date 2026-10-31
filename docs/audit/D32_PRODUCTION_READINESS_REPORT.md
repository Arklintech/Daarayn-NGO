# D32 Production readiness report

Status: PRODUCTION NOT CONFIGURED, NOT DEPLOYED. This is a read-only readiness inspection plus the code changes that keep financial operations restricted. No production setting, variable, DNS record, OAuth setting or spreadsheet was changed.

## 1. Inspection (what could be checked from this machine)
| Area | Finding | Status |
|---|---|---|
| Production domain `daaraynorg.com` | no DNS answer (no A/NS record for the apex, `www` or `limiter.`); no hosting, no certificate | NOT READY |
| HTTPS | none can exist without DNS; the intended URLs are `/` and `/privacy` (a terms page is not prepared and not required for the consent screen) | NOT READY |
| Vercel production project, branch, domains, environment variables, function region | NOT INSPECTED (no Vercel access); GitHub shows only `main` and the feature branch; a previous Preview served from `iad1`; no production alias answered | NOT VERIFIED |
| Production deployment | none observed (`daarayn-ngo.vercel.app` answers 404) | NOT DEPLOYED |
| Firebase Authentication configuration (authorised domains, providers) | NOT INSPECTED | NOT VERIFIED |
| Google OAuth (Drive): consent screen External/Testing per the owner; scope in code is the restricted `drive` scope; `drive.file` mode is implemented and recommended in `docs/oauth/DRIVE_OAUTH_PRODUCTION_READINESS.md`; the privacy page deliberately names no provider, which conflicts with Google's verification expectations for a restricted scope (documented consequence) | NOT PRODUCTION-READY; owner decisions pending |
| Google Sheets permissions | the service account reaches the TEST sheet; the production spreadsheet is write-guarded (a production target needs `GOOGLE_TARGET_ENV=production` and the approved ids) | NOT VERIFIED for production |
| Production worksheets | missing in the production spreadsheet: `Allocations`, `Donation_Causes`, `Communication_Recipients`, `Program_Content` (blocking) and `Portal_Auth_Events`, `_Secrets` (features); legacy sheets lack newer columns (supported fallback) | BLOCKED (see data onboarding report) |
| Gmail SMTP | credentials configured locally; delivery to inboxes is not proven (SMTP acceptance is not delivery); sending is restricted to an allowlist in the isolated test launcher | NOT VERIFIED for production |
| Khidr / Groq integration | not part of this inspection (the repository rules mark AI chat as a known violation to remove, not extend); not touched | NOT VERIFIED |
| API authentication / rate limiting | admin routes require the admin session (sweep test); donor portal has its own rate limits (`Portal_Auth_Events` sheet is MISSING in production: the portal fails safe, no sign-in) | PASS with the missing-sheet limitation |
| Monitoring and backups | none configured (D31 reports) | NOT READY |
| Legal and public pages | privacy page exists; Terms intentionally absent; footer and metadata use `https://daaraynorg.com` | PASS locally; domain NOT LIVE |
| Responsive UI | verified at 280/320/375/430/820/1440 in D22 to D27 | PASS (test data) |

## 2. Code changes made so that production starts RESTRICTED
| Control | Behaviour (tested) |
|---|---|
| Donations | in a production environment (`VERCEL_ENV` or `GOOGLE_TARGET_ENV` = production) `POST /api/donate` answers 503 "Contributions are not being accepted ..." with `paused: true` until `FINANCIAL_ACTIVATION_APPROVED=true`; nothing is read, written or sent |
| Donation verification/changes | `PATCH /api/admin/donations` answers 503 paused (after the admin check) |
| Allocations | `createAllocation` answers 503 paused until `ALLOCATION_SERIALIZATION_VERIFIED=true` (D30); needs the coordinator lease |
| Google requests | refused without a shared coordinator; refused when both a Redis URL and the coordinator are configured |
| Preview-only tools | `/api/ops/probe` answers 404 in production |
The restricted state was verified by tests and by code reading; it was NOT verified in an actual production configuration because none exists.

## 3. Owner decisions still open (from the project documents)
Drive OAuth route (`drive.file` vs a security assessment) and the provider-neutral privacy page versus Google verification; whether the 90/10 wording is policy (it is NOT approved and is not applied as a rule); per-need Masjid funding balances (not supported by the data model; not invented); the definition and source of "Students Sponsored" (shown as a dash, never fabricated); private Hifz student data handling (records, recordings, consent, teacher verification stay private); the communication approval process and a production mail domain; the production spreadsheet/migration approval and a production-equivalent rehearsal copy; the domain/DNS owner and hostnames; the alert recipient. Affected operations stay restricted until each is decided.

## 4. Verdict
READY AFTER SPECIFIED EXTERNAL SETUP is not even reached for production: the production domain, DNS, HTTPS, Vercel production configuration, OAuth decisions, production worksheets and the hosted coordinator are all outstanding. Status for this report: NOT READY (external prerequisites).
