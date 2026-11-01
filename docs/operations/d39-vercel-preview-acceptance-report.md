# D39 Vercel Preview acceptance report

Date 2026-11-01. Category for every result below: **PREVIEW** (real Vercel deployment, real Vercel Queues, real Google Sheets on the approved TEST spreadsheet) unless marked otherwise. Values of secrets are never recorded here.

## 1. Verdict: **PREVIEW ACCEPTANCE PARTIALLY PASSED**

The Vercel side is verified for the first time: deployment, protection, branch-scoped test configuration, the queue trigger, queue delivery to a private consumer, finalisation of 68 dummy submissions on Vercel with clean integrity, idempotent behaviour under duplicate wake-ups, and the Firebase-admin defect found and fixed. **The complete donor path (public accept -> Queue -> finaliser -> financial records) is NOT verified on Vercel**: the public accept route cannot store the payment proof because Drive is not connected for the test identity. The seeded and reconcile-triggered runs are not full donation acceptance and are not claimed as such. Not production ready.

## 2. Deployments

| Item | Deployment A (exact commit) | Deployment B (diagnostic, contains the jose fix) |
|---|---|---|
| URL | https://daarayn-jlfynvlix-arklintech.vercel.app | https://daarayn-54t3gll0l-arklintech.vercel.app |
| ID | `dpl_FDwLwMenhw32K2GqFnmasp15qXnK` | `dpl_Bv2WyC5zrPr1VbjEAyR4Lroot3JX` |
| Source | GitHub commit `1018f4d0dd4520d5292867514be0db9bd7f37c5e` on `feat/daarayn-pre-release-hardening` (clean clone, exact) | the same commit **plus three uncommitted files** (`package.json`, `package-lock.json`, `tests/runtime-esm-compat.test.ts`); NOT an exact revision |
| Target | Preview (target null), not Production | Preview, not Production |
| State | READY | READY |
| Deployment protection | Vercel Authentication (preview) | same |
| Queue trigger | `queue/v2beta`, topic `daarayn-intake`, `retryAfterSeconds` 30, `maxDeliveries` 8 on `app/api/queues/intake-finaliser/route.ts`, applied with `vercel deploy --local-config deploy/vercel.d38-preview.json` (no `--prod`) | same |
| Commands | `vercel deploy` from a clean clone, branch `feat/daarayn-pre-release-hardening`, origin set to the GitHub URL | same, with the three files overlaid |

Vercel project: `arklintech/daarayn-ngo` (team plan **Pro**, Fluid compute on, function region `iad1`, production branch `main`). The Vercel Git integration had already built an earlier Preview of `1018f4d` automatically (`https://daarayn-ew6s3k195-arklintech.vercel.app`); it has no Preview-only variables for the queue and was superseded by A.

## 3. Environment configuration (names only; values masked)

All variables below were added with `vercel env add <NAME> preview feat/daarayn-pre-release-hardening` (values over stdin). **Preview scope, this branch only.** Every pre-existing variable (Google, SMTP, Resend, Firebase, AI) is scoped to Production + Preview + Development; none was changed, and Production variables were not touched (verified: no new or changed variable in the Production list).

| Variable | Purpose | Source |
|---|---|---|
| `DONATION_INTAKE_MODE=queued` | switches the queued intake routes on (default off) | directive |
| `GOOGLE_TARGET_ENV=test` | write guard label | directive |
| `GOOGLE_SHEET_ID`, `GOOGLE_TEST_SHEET_ID` | the approved TEST spreadsheet | `lib/google/approvedTargets.ts` (never the local `.env.local` value, which is a different, non-approved spreadsheet) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_DRIVE_TEST_FOLDER_ID` | approved test Drive folder | `lib/google/approvedTargets.ts` |
| `OPS_MONITOR_TOKEN`, `CRON_SECRET` | monitor and reconcile bearer secrets | generated, 32 random bytes each, independent |
| `EMAIL_PROVIDER=gmail`, `EMAIL_RECIPIENT_ALLOWLIST` (an `.invalid` address), `SMTP_PASS` (disabled placeholder) | **no real email can be sent from this branch's Preview** (the shared SMTP and Resend settings point at real services) | D39 safety |
| `GOOGLE_DRIVE_SCOPE_MODE=file`, `DRIVE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_PUBLISHING_STATUS=testing` | prepared for a least-privilege Drive connection (see section 6) | generated / documented |

**Not set, on purpose:** `FINANCIAL_ACTIVATION_APPROVED`, `ALLOCATION_SERIALIZATION_VERIFIED`, `GOOGLE_LIMITER_URL`, `GOOGLE_LIMITER_TOKEN`, `GOOGLE_LIMITER_ALGORITHM` (no hosted coordinator exists; the per-instance limiter applies, and `/api/ops/quota-status` correctly reports `critical`: `COORDINATOR_NOT_CONFIGURED`).

Protection: `ssoProtection` was **null** (every Preview, including old ones, was public). It is now `preview` (Production unaffected), and an Automation Bypass secret was created for the driver (stored masked in the scratchpad, never printed). Unauthenticated requests now get 302 to Vercel login on every route.

**Isolation facts (read-only checks):** the approved test spreadsheet is "Daarayn Integration Test Clean" (a separate file from "DAARAYN OPERATIONS DATABASE", the production one). It holds accumulated test data (about 488 donations, `Donation_Intake` already provisioned with 125 rows); most email values are test-like, 17 donor and 34 donation emails look like consumer mailboxes (probably the owner's own test inbox, not proven). **The service account can read BOTH spreadsheets**, so isolation depends on the app's write guard and on the branch-scoped overrides; a dedicated test service account would be stronger. The Preview reading the test sheet is evidenced by `/api/ops/queue-status` returning the test sheet's intake counts. The write guard on a Vercel runtime accepts `GOOGLE_TARGET_ENV=test` only when the sheet equals both `GOOGLE_TEST_SHEET_ID` and the committed allowlist.

Side effects on this machine (disclosed): `vercel link` refreshed the OIDC token line in the git-ignored `.env.local` and added a git-ignored `.vercel/` folder; it also appended lines to `.gitignore`, which I restored.

## 4. Defects found on Vercel

### 4.1 Firebase Admin on Vercel Node 24 (FIXED, uncommitted)
Every route importing `firebase-admin/auth` answered 500: `ERR_REQUIRE_ESM`, `jwks-rsa` 4.1.0 `require()`s `jose` 6.2.12 (ESM only) and the Vercel function runtime does not allow `require(esm)`. Reproduced locally with `node --no-experimental-require-module`; it works on a developer machine and in all offline tests, which is why none caught it. It also explains the HTTP 500 on Sheets-backed routes recorded in D27. Affects all admin and agent APIs (47 route files import the auth module).
Fix: `package.json` `overrides: { "jwks-rsa": { "jose": "5.10.0" } }` (5.10.0 ships CommonJS and was already in the tree for `@vercel/oidc`; `jwks-rsa` only calls `importJWK`, `exportSPKI`, `decodeJwt`, `decodeProtectedHeader`). Lock regenerated (`npm ci --dry-run` consistent). Regression test `tests/runtime-esm-compat.test.ts` (7 tests, red before, green after): loads `firebase-admin/app|auth`, `googleapis`, `nodemailer`, `jwks-rsa`, `jose` under the runtime rule and proves `jwks-rsa` resolves a signing key from a real JWKS endpoint.
Gates with the fix: tsc 0 errors; eslint 0 errors (216 warnings); vitest **75 files, 761 tests passed**; `next build` exit 0.
**Verified on Vercel (Deployment B):** 43 of the 44 auth-importing routes without dynamic segments answer 401/403/400/404/405 with no admin token, none 500 (the remaining one, `/api/causes`, is a public GET and answers 200 by design); a forged bearer token is rejected with 401 on `/api/admin/intake-queue` and `/api/admin/donations`. **Not verified:** a successful admin sign-in and authenticated admin actions (they need a real administrator login, which I cannot and must not perform).
**Not committed or pushed** (needs approval); Deployment A still contains the defect.

### 4.2 Drive proof storage (OPEN, owner action)
`/api/intake/accept` stores the payment proof in Drive before anything is written to Sheets. The Preview has no Drive connection, so **N=1 fails with HTTP 503 "payment proof could not be stored"** and nothing is written (correct fail-safe, no false success). Facts: the service account belongs to no Shared Drive and has a storage quota of 0, so it cannot upload; the approved test folder id in `approvedTargets.ts` is **not visible** to it; the only top-level folder it can see ("DAARAYN SECURE STORAGE") is the production evidence folder owned by the owner's personal account, and I did not use it; the only OAuth refresh token on this machine is the owner's (`.secrets/google-drive-oauth.json`) and was not copied.

## 5. Acceptance results

### 5.1 N=1 through the public accept route (`scripts/preview-d38-acceptance.mjs`): **FAILED, blocked by 4.2**
`accepted 0/1`, status `503`, wall 2.3 s, replay returns the same reference, queue drained, nothing written. Raw: `docs/testing/evidence-d39/preview-accept-N1.raw.json`.

### 5.2 Queue -> consumer -> finaliser on Vercel (rows seeded from this machine, wake-up by the authenticated reconcile route)
Rows were appended to the TEST `Donation_Intake` with the repository's own `acceptDonation` (Drive stubbed, synthetic `ZZ_D39_` donors on `.invalid` addresses); the reconcile route (what the daily cron does, rows older than 60 s) then **published the wake-up from inside the Preview** and the **Vercel Queues push consumer finalised the rows**. This exercises real queue publish, real push delivery to a private consumer, the finaliser, and Sheets writes on Vercel; it does **not** exercise the public accept route, acknowledgement latency on Vercel, or cold instances at intake. The 60 s stale delay is part of the elapsed times below.

| N | Wake-up published (s after seeding) | All COMPLETE (s after seeding) | Consumer time after wake-up (poll resolution 8 s) | Donation rows / distinct ids | Donors / distinct | COMPLETE without donation | Placeholders | Queue after |
|---|---|---|---|---|---|---|---|---|
| 6 | 71.2 | 88.3 | about 17 s | 6 / 6 | 6 / 6 | 0 | 0 | depth 0, ok |
| 12 | 70.3 | 78.8 | about 9 s | 12 / 12 | 12 / 12 | 0 | 0 | depth 0, ok |
| 20 | 71.1 | 79.7 | about 9 s | 20 / 20 | 20 / 20 | 0 | 0 | depth 0, ok |
| 30 | 70.9 | first 79.4, all 88.0 | about 9 to 17 s | 30 / 30 | 30 / 30 | 0 | 0 | depth 0, ok |

Donation ids were unique across the whole test sheet in every run. Raw: `docs/testing/evidence-d39/preview-reconcile-run-N{6,12,20,30}.raw.json`. The local seeding latencies in those files (P95 4 to 33 s) come from a single local process and are **not** Vercel acknowledgement latencies.

**Duplicate wake-ups (Deployment B, with the jose fix):** 12 rows, three simultaneous reconcile calls, all three returned `redispatched: true`; all 12 rows reached COMPLETE at +90.5 s with 12 distinct donation ids, 12 donors, no duplicate and no placeholder (`preview-duplicate-wakeup-N12.raw.json`). The publish used time-bucketed idempotency keys, so duplicate sends were coalesced or harmless either way.

### 5.3 Acceptance targets
| Target | Status |
|---|---|
| Acknowledgement P95 <= 5 s, P99 <= 10 s (public accept on Vercel) | **NOT MEASURED** (blocked) |
| 30 cold-instance submissions acknowledged within 60 s | **NOT MEASURED** (blocked) |
| 30 finalised within 120 s of the first submission | seeded path: all 30 COMPLETE 88 s after seeding (includes the artificial 60 s stale wait); public path **not measured** |
| No Google 429 | none observed from outside; Google request counts and 429s are **not observable** (the quota-health route needs an administrator session) |
| No duplicate completed donation, no incorrect permanent id, no false COMPLETE, no indefinite pending | held in all 5.2 runs |

## 6. Vercel Queues (docs read 2026-11-01)
Configuration matches the documented `queue/v2beta` trigger (`retryAfterSeconds`, `maxDeliveries`). Queues is Beta on all plans; consumer functions are private (no public URL: `GET /api/queues/intake-finaliser` now answers 404 where the earlier deployment without a trigger answered 405); at-least-once delivery, approximate order, **no built-in dead-letter queue** (the application-level dead letter in `lib/intake/queue/consumer.ts` is the design); topics are partitioned by deployment id (a message published by one deployment is consumed by the same one); a failing consumer is billed for its full `maxDuration`, so `maxDeliveries` stays set. Deployment protection does not affect the queue consumer (it is not reachable over HTTP).
Usage and billing before increasing volume (`vercel usage`, read-only): team credit used $0.78 of $20.00 this cycle; Queue Message Sends 8, Deletes 4, Receives 4, Notifications 4 units (each below $0.01); a $200 spend budget is active and not paused. Counters lag real activity, so per-run queue operations could not be isolated. Plan Pro: usage beyond the included credit is billed, which is why volume was kept small.
**Message retries, consumer interruption and worker termination were not exercised on Vercel**: they need a deliberately failing deployment (a short `maxDuration` or a revoked queue permission), which changes the deployed configuration and was not done.

## 7. Scenarios of the failure programme
| # | Scenario | Result |
|---|---|---|
| 1 | Duplicate intake submissions | replay returns the same reference (driver, N=1 path, blocked before storing); duplicate-key behaviour is covered offline and live in D37/D38, **not on Vercel** |
| 2 | Duplicate queue delivery | PASSED on Vercel (3 simultaneous publishes, no duplicate donation) |
| 3 | Queue publication failure | recovered in effect: the seeded rows were accepted without any publish (the "append succeeded, publish never happened" gap) and the reconcile path recovered all 68; a forced publish error was not injected |
| 4 | Consumer interruption | **NOT RUN** |
| 5 | Worker termination during finalisation | **NOT RUN** |
| 6 | Expired message and reconciliation | reconciliation PASSED (as in 3); expiry **NOT RUN** (24 h default retention) |
| 7 | Network timeout after a Sheets write | **NOT RUN** on Vercel |
| 8 | Shared limiter unavailable | **N/A**: no coordinator exists; per-instance limiter in use |
| 9 | Google quota response | **NOT RUN** (not induced) |
| 10 | Administrator requeue | **NOT RUN** (needs an administrator login) |
| 11 | Queue redispatch | the reconcile redispatch PASSED; the admin button **NOT RUN** (admin login) |
| 12 | Spreadsheet temporarily unavailable | **NOT RUN** |

Admin and donor experience (phase K): `/donate/status` and `/admin/queue` render (200 and a redirect to sign-in); the status page against a real accepted submission, the RECEIVED / ID_ASSIGNED / COMPLETE sequence, the admin metrics screen, retry visibility and the manual-requeue audit record were **not verified on Vercel**.

## 8. Outstanding blockers before any Production readiness
1. **Drive for the test identity (owner).** Needs a least-privilege, test-only Drive connection. Recommended: a dedicated test Google account and a dedicated test OAuth client in the Cloud console (authorised redirect URI = `https://<preview host>/api/admin/google-drive/callback`), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` entered by the owner in Vercel (Preview, this branch); the Preview is already set to `GOOGLE_DRIVE_SCOPE_MODE=file` (scope `drive.file`) and has `DRIVE_TOKEN_ENCRYPTION_KEY` so the refresh token is stored encrypted in the TEST sheet's `_Secrets` tab; an administrator then signs in to the Preview, opens Admin -> Settings and connects Drive, and creates the root folder from the app (`POST /api/admin/google-drive/create-root`), which sets the folder the app can reach. Alternative: a Shared Drive folder with the service account as member. Production OAuth tokens must not be reused.
2. **Commit approval** for the jose fix (and for the D39 evidence and report), then push so the Git integration deploys the exact revision.
3. **Administrator access** to run the admin and donor-experience checks and the admin requeue drills.
4. A hosted shared coordinator (still absent), the real Google quota values, dedicated test service account, and the failure drills that need configuration changes.
5. Older Preview deployments (`742e065`, `7e1068e`, `1018f4d` auto-build) were built with the shared variables, so they use the **production** spreadsheet and real mail settings; they are now behind Vercel Authentication, but deleting them is an owner decision.
6. All earlier production blockers in `docs/operations/d38-production-release-readiness.md` remain (domain, OAuth publishing, financial policies, backups, narrower Google scopes, Khidr decision, allocation safety).

## 9. Reruns after the Drive fix (to do)
`node scripts/preview-d38-acceptance.mjs --url <preview> --n 1`, then 6, 12, 20, 30 with `--bypass` and `--monitor-token`, plus the drills in section 7 that need an administrator; record the raw JSON under `docs/testing/evidence-d39/`.
