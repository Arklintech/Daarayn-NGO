# Tests and Known Issues

Status words: PASS / FAIL / BLOCKED / NOT TESTED. Environment: Node v24.22.0, npm 11.19.1, Windows 11; commands run in an isolated export of commit `ff5ca7d` (scratch dir, no credentials, no network calls to Google/SMTP/Firebase). Nothing touched real data.

## Executed checks
| Check | Result | Evidence |
|---|---|---|
| `npm ci` | **FAIL** | lockfile out of sync with package.json (`@emnapi/runtime@1.11.3`, `@emnapi/core@1.11.3` missing) |
| `npm install --ignore-scripts` | PASS | 806 packages |
| `tsc --noEmit --incremental false` | **FAIL** (2 errors) | `app/admin/communications/history/page.tsx(28,91)` TS2345 null→string; `app/api/admin/communications/generate/route.ts(28,30)` TS2339 `Cause.name`. (Earlier "3 errors" included a stale `.next` reference.) |
| `next build` | **FAIL** | compile OK (44 s); "Running TypeScript" fails on the history page error |
| `npm run lint` | **FAIL** | `next lint` removed in Next 16 ("Invalid project directory …/lint") |
| `eslint .` | **FAIL** | 2 errors (`lib/realtime/useRealtime.ts` "Cannot access refs during render", lines 10 and 44), 211 warnings |
| Automated test suite | NOT TESTED / none exists | no runner, no test files; `scripts/test*.js` are ad-hoc and either read files or hit live services |
| Browser / mobile / multi-device SSE / live Sheets-Drive-SMTP | BLOCKED/NOT TESTED | no safe test spreadsheet, Drive, mailbox or credentials validated |

## Feature → test map
Every feature in the acceptance matrix: NOT TESTED (no tests). Code-read verdicts below are not test results.

## Confirmed defects (verified by reading code; none executed)
| ID | Sev | Defect | File |
|---|---|---|---|
| SEC-1 | Critical | Plaintext Gmail app password literal in tracked files, equal to the current `.env.local` `SMTP_PASS`; present in local commit `3b244e1` (not on origin/main, branch unpushed). Also in `SMTP_EMAIL_DIAGNOSIS.md:71`. **Rotate; do not push this branch before history is cleaned** | `test-email.js:10`, `test-all-inboxes.js:8` |
| SEC-2 | Critical | `/api/media/[fileId]` unauthenticated; serves any Drive file the service account can read; 1-year public cache; failures return 200 SVG | `app/api/media/[fileId]/route.ts` |
| SEC-3 | Critical | `/api/donor/lookup` unauthenticated PII + creates donors | route |
| SEC-4 | High | `/api/donor/dashboard` IDOR; empty-email match leaks other phone-only donors' donations | route |
| SEC-5 | High | `/api/admin/communications/ai-assist` unauthenticated, calls Anthropic, violates no-AI rule | route |
| SEC-6 | High | No `email_verified`/revocation check; agent creation via public `signUp` | `lib/server/auth.ts` |
| SEC-7 | Med | `/api/donate` no file type/size limit; in-memory per-instance rate limit trusting `x-forwarded-for` | |
| SEC-8 | Med | Auth token cookie JS-set, not HttpOnly; middleware trusts presence cookie | |
| SEC-9 | Med | `/api/donors` POST merges arbitrary fields; hardcoded Sheet/Drive/Firebase fallbacks; tracked `data/*.json`, test proof files | |
| F1 | High | Donation email status never persisted (mapper omits fields) | `donationRepository.ts` |
| F2 | High | `dispatch-updates` reports `emailsSent` without sending | route |
| F3 | High | Milestone automations never match; dedupe marker unstored | route |
| F4 | High | Notification DELETE is a no-op | `baseRepository.delete` |
| F5 | High | Dashboard / donations / notifications return success with zeros/empty on Sheets failure | routes |
| F6 | High | Beneficiaries, FAQs, Settings only in localStorage | admin pages |
| F7 | Med | Programs/Campaigns saved as Causes; fields dropped | |
| F8 | High | Field report `adminNotes`/`assignedAdminId` not persisted | `fieldReportRepository.ts` |
| F9 | Med | Drive failure → `local_*` proof on ephemeral `/tmp` (evidence loss) and fake folder id on folder error | `drive.ts` |
| C1 | High | Recipient resolution fuzzy; no excluded list/per-recipient outcome; no idempotency | `communication-resolver.ts` |
| R1 | Med | Non-atomic ids for donors/reports/agents; failed donation id allocation can leave a `PENDING` row | |
| R2 | Low | Realtime log unbounded; each streaming instance polls Sheets | |
| B1 | High | Build blocked by type errors; lockfile out of sync; lint script broken | see above |
| W1 | High | Working tree missing `app/ lib/ components/ public/ data/ scripts/ docs/ config/` and `node_modules` (236 tracked files deleted, uncommitted) | git status |

## Remaining blockers
Safe test Sheet/Drive/SMTP environment; confirmation of Firebase sign-up setting and production env contents; decision on credential rotation; user decision on restoring working tree.

## Update 2026-10-24 (after repairs)
`npx tsc --noEmit` PASS (0 errors). `npx eslint .` PASS (0 errors, 210 warnings). `next build` PASS. `npm test` (Vitest, 49 tests in tests/) PASS, repeated 3 times for stability. All tests run against an in-memory Sheets fake: they prove the code logic, **not** live Google/SMTP/Firebase behaviour (BLOCKED, see CREDENTIALS_AND_INTEGRATION_CHECKLIST.md). Fixed: SEC-2, SEC-3, SEC-4, SEC-5, SEC-7 (file type/size), F1, F8, donor duplicate/token race, donation id race under concurrency, communication targeting (C1). Still open: SEC-1 rotation and history cleanup, SEC-6, SEC-8, F2, F3, F4, F5, F6, F7, F9, R2, `middleware` deprecation, local-file fallbacks.
