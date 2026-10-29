# FEATURE & ACCEPTANCE MATRIX (2026-10-17)

Statuses: IMPLEMENTED / TESTED / DEPLOYED / BLOCKED / NOT TESTED / FAILED / NOT APPLICABLE.
**Audit evidence base: source reading + `npx tsc --noEmit` (3 errors, below). No test suite exists. No browser, live-data or deployed verification was performed in this audit.** Historical report claims (e.g. "DA021 created", "8/8 SMTP-accepted") are unverified history; they are cited only as such.

Typecheck result (executed, FAILED): `app/admin/communications/history/page.tsx(28)` null not assignable (real); `app/api/admin/communications/generate/route.ts(28)` `Cause.name` missing (real); `.next/types/validator.ts` references deleted `history/[id]/page` (stale build artifact). `next build` would likely fail type-checking.

| # | Requirement | Expected | Implementation refs | Evidence | Status | Risks / outstanding |
|---|---|---|---|---|---|---|
| 1 | Public donation submit | Row + proof + donor + confirmation | `api/donate`, `donationService` | none executed | IMPLEMENTED, NOT TESTED | no file validation; Drive upload failure swallowed |
| 2 | Unique donation IDs / idempotency | no duplicate DA###, no double-submit | `donationRepository.createWithUniqueId`, `submissionKey` | none | IMPLEMENTED, NOT TESTED | not a true lock; legacy DA006 duplicate data unverified |
| 3 | Admin verify/reject | single-row, conflict-safe, audited | `api/admin/donations` PATCH | none | IMPLEMENTED, NOT TESTED | refuses duplicate ids by design |
| 4 | Donor↔donation relationship | by donorId, email fallback | `metrics.belongsToDonor`, `donors` API | none | IMPLEMENTED, NOT TESTED | phone-only donors with no email only link by donorId; duplicate donor records possible |
| 5 | Unified metrics | same numbers everywhere | `lib/donations/metrics.ts` | none | IMPLEMENTED, NOT TESTED | error fallbacks return zeros as success |
| 6 | Confirmation email status persisted | shown in Admin | donationService step 8 | code shows fields dropped | FAILED (by code analysis; not executed) | headers/mapper lack fields |
| 7 | Broadcast send | recipients per type, SMTP result, history | `communications/send`, `communication-resolver`, `broadcast-worker` | none | IMPLEMENTED, NOT TESTED | fuzzy matching; no per-recipient record; no excluded list; no inbox confirmation |
| 8 | Broadcast history list/detail | open by id | `history/page.tsx` (`?id=`) | tsc error | IMPLEMENTED, FAILED (typecheck); route `/history/<id>` NOT PRESENT | reported URLs 404 |
| 9 | Milestone automations | emails at 25/50/75/100% | `automations` | code analysis | FAILED (can never match donors); also records sentCount w/o dedupe key | |
| 10 | Dispatch project updates | email donors | `dispatch-updates` | code | FAILED (counts "sent", sends none) | |
| 11 | Notifications | persist read/star/delete across sessions | `api/admin/notifications` | none | read/star IMPLEMENTED, NOT TESTED; delete FAILED (code) | global read state; N sequential sheet writes for mark-all |
| 12 | Dashboard | correct, fresh | `api/admin/dashboard` | none | IMPLEMENTED, NOT TESTED | zero-fallback |
| 13 | Cause management + public parity | one canonical cause set | `api/causes`, `causeRepository` | none | IMPLEMENTED, NOT TESTED | defaults fallback; no delete; GET seeds data |
| 14 | Programs / Campaigns | persisted, linked to allocations | pages → `/api/causes` | code | PARTIAL (stored as causes; repos unused) NOT TESTED | |
| 15 | Beneficiaries | registry, privacy | page uses localStorage | code | NOT APPLICABLE as Sheets feature → FAILED vs requirement | not shared/persisted |
| 16 | FAQs/Settings/content | admin-managed, public-facing | localStorage only | code | FAILED vs requirement | public site doesn't read |
| 17 | Public ledger | public-safe transparency data | none public; `/api/ledger` admin-only | code | NOT IMPLEMENTED publicly (landing links to `#ledger` hardcoded) | |
| 18 | Admin auth | allow-listed, verified | `lib/server/auth.ts` | none | IMPLEMENTED, NOT TESTED | no `email_verified`/revocation check; Firebase `auth/invalid-credential` historical block |
| 19 | Field report + evidence | persisted, shared | `api/field/reports` | none | IMPLEMENTED, NOT TESTED | Drive may fall back to local disk; race on FR ids |
| 20 | Admin↔agent chat | two-way, persisted | `api/field/chat` | none | IMPLEMENTED, NOT TESTED | `/tmp` mirror |
| 21 | SSE realtime | cross-instance, replay | `api/realtime/stream`, `lib/realtime/*` | none | IMPLEMENTED, NOT TESTED, multi-device BLOCKED (no env) | polling cost, log growth |
| 22 | Drive evidence access control | auth-gated | `api/media/[fileId]` | code | FAILED (no auth) | |
| 23 | No operational Firestore | none in app runtime | grep | `lib/db-sync.ts` (imports firestore, `db` is null; unused) + legacy root scripts + `server.js` | runtime path: NOT REFERENCED by app routes (verified by grep) → compliant in active routes; legacy files remain | delete candidates |
| 24 | No KHIZR/AI | none | grep | UI "Generate with Khizr", `ai-assist` route, ANTHROPIC/GROK env | FAILED | |
| 25 | PWA scopes | admin/field/public isolation | `sw.js`, manifests | code | IMPLEMENTED, NOT TESTED | SW caches authenticated admin HTML (network-first) |
| 26 | SEO | metadata/sitemap/robots/JSON-LD | `app/page.tsx`, `sitemap.ts`, `robots.ts` | code | IMPLEMENTED, NOT TESTED | sitemap only 2 URLs |
| 27 | Mobile responsiveness | usable | CSS | none | NOT TESTED | |
| 28 | Automated tests | exist | none | no runner/config | NOT IMPLEMENTED | `scripts/*.js` are ad-hoc checks |
| 29 | Deployment verification | latest commit live | `.vercel` present | none | NOT TESTED; DEPLOYED unknown | |

---

## UPDATE 2026-10-27 — Phase D3 end-to-end audit (evidence: `docs/audit/DAARAYN_D3_E2E_AUDIT_2026-10-27.md`)

Scope of evidence: executed locally against the **isolated test spreadsheet and a dedicated Drive test folder** (real Google Sheets, Drive, Gmail SMTP). Nothing was deployed; no production resource was touched. "TESTED" below means *tested locally in that isolated environment*, never "deployed". Rows not listed are unchanged from the table above.

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Public form → row + proof on Drive + donor + confirmation traced through UI to Sheets | TESTED (local, isolated) | invalid-type/size/malformed inputs rejected; F1–F3 fixed |
| 2 | Parallel + replayed submissions → 1 row, 1 proof file | TESTED | none known |
| 3 | Admin verify with stale-status refusal (409) | TESTED | |
| 4 | Donor↔donation relationship is now **token-first** (e-mail only for rows without a token) | TESTED | duplicate-contact donors are reported, never merged |
| 5 | Unified metrics reconcile (dashboard = donor list + orphan donations); read failure → 503 + "—", never zeros | TESTED | |
| 7 | Broadcast: 5 purposes, approval binding, per-recipient `smtp_accepted`; UI no longer says "delivered" | TESTED (SMTP acceptance); **inbox arrival BLOCKED** | needs mailbox access |
| 12 | Dashboard | TESTED | |
| 13 | Cause lifecycle and propagation | TESTED | |
| 18 | Admin authorization (401 for anonymous on 21 endpoints) | TESTED | no `email_verified`/revocation check (unchanged) |
| 21 | SSE realtime events after persisted writes | TESTED (single instance) | multi-device still BLOCKED |
| 22 | `/api/media` anonymous → 401, admin → exact bytes | TESTED | |
| 24 | `ai-assist` route returns 410 (offline test) | PARTIAL | UI/env references still to remove |
| 28 | Automated tests | IMPLEMENTED: 167 offline + 24 live; `tsc` 0 errors; ESLint 0 errors; build OK | |
| new | Designations, allocations (limits, replay, reversal history, concurrency), reconciliation | TESTED | earliest-row-wins; conservative rejection of some later rows |
| new | Donor portal: e-mailed one-time code + signed session (was an unauthenticated PII leak) | TESTED offline + live negative paths | live positive path needs inbox; per-donor throttle outstanding |
| new | Attachments: strict resolve, size/type/URL safety | TESTED | Drive-link alternative for oversize NOT IMPLEMENTED |
| 29 | Deployment verification | NOT TESTED; DEPLOYED unknown (unchanged) | |

---

## UPDATE 2026-10-27 (later) — Owner-confirmed inbox receipt (evidence: audit report §13–14)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 7 | Broadcast e-mail: 16 recipient rows reconciled on the test sheet (13 SMTP account, 2 `ahmedkhananas57`, 1 `abubakarahmedkhan26`), all `smtp_accepted`, 0 failed, none to any other address. Owner confirms receipt of all test e-mails: **inbox arrival OWNER-CONFIRMED** (not independently observed). App status stays `smtp_accepted`; it must not claim "delivered". | TESTED (SMTP acceptance recorded + owner-confirmed receipt) | no automated delivery signal exists |
| new | 4th approved address: never mailed; no records for any spelling. | NOT TESTED | owner must state the exact address before any send |
| new | Release blockers still open: donor-portal per-donor throttling, oversize-attachment handling, GitHub repo private, service-account key revocation, Drive OAuth publishing (token expires ≈ 2026-11-02). | OPEN | see report §14 |
| 29 | Deployment verification | NOT TESTED; DEPLOYED unknown (unchanged) | |

---

## UPDATE 2026-10-28 — Pre-release hardening D4 (evidence: audit report, Addendum D4 §15–§19)

Local, isolated environment only (test sheet, Drive test folder, approved addresses). Production was read for worksheet names, headers and row counts only. Nothing committed, pushed, deployed or revoked.

| # | Update | Status now | Remaining |
|---|---|---|---|
| new | Donor-portal abuse controls shared across instances (Sheets ledger `Portal_Auth_Events`): per IP, identifier, donor, hour/day, daily cap, attempts, single use, fail-closed | TESTED (offline incl. simulated separate instances; live negative paths on test sheet) | PASS WITH LIMITATION: phone-only donors unsupported; live positive path (code in inbox) not exercised; ledger retention job needed |
| new | Oversize attachments as personal signed links bound to the Drive fingerprint; file identity bound to the approval; no Drive permission changes | TESTED (offline + live send, 3/3 `smtp_accepted`, link served exact bytes, tamper/expired/modified refused) | per-file upload cap 10 MB; bearer links; no per-link revocation |
| 7 | Gmail attachment mail: 240 s socket timeout; timeout during attachment upload = unresolved, never auto-resent | TESTED (diagnosed live: 10 MB took ≈104 s) | inbox arrival of the D4 test mail not inspected by the auditor |
| 21 | Realtime across two authenticated tabs: create/update delivered once, replay after disconnect exact, anonymous 401 | TESTED — PASS WITH LIMITATION | not two devices / identities; no logout or expiry during an open stream |
| 24 | AI/“Khizr” branding removed from communications UI (template button relabelled; unused AI handler removed) | IMPLEMENTED, TESTED (wording guard) | `ai-assist`/`generate` routes: `generate` is a fixed template; `ai-assist` returns 410 |
| 16 | Settings page: no fabricated administrators, no Firestore claims; SEO save states it is browser-only | IMPLEMENTED | the public site still does not read admin-managed SEO/FAQ/settings (FAILED vs requirement, unchanged) |
| new | Donor statement download: unverifiable "blockchain"/"90/10" claims removed | IMPLEMENTED | |
| new | Production readiness review (credentials, OAuth, GitHub exposure, schema diff) | REVIEWED, owner actions OPEN | see report §15.5–§15.7, §18 |
| 29 | Deployment verification | NOT TESTED; DEPLOYED unknown (unchanged) | |
| new | Fourth approved address | NOT TESTED | exact spelling needed from the owner |

Release recommendation: **NO-GO for public launch; GO for continued controlled testing** (report §19).

---

## UPDATE 2026-10-28 (D5) — Programs, Campaigns, Cause Management Center to public website (evidence: audit report §20–§23)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 13 | Cause management: draft, publish, Urgent, Completed/Unpublished from the admin screen; public list, detail and donation form follow; donations keep the id | TESTED (browser, isolated) | |
| 14 | Programs / Campaigns: kind-filtered Sheets-backed screens (same Causes tab), public `/programs`, `/campaigns`, detail `/causes/[id]`, homepage block | IMPLEMENTED, TESTED (browser, isolated) | owner design review; sitemap; cover-image upload not exercised in browser |
| 16 | Public site reads admin-managed catalog content | PASS for programs, campaigns, causes; FAQs/settings/beneficiaries unchanged (FAQs, Beneficiaries, Public Ledger removed from admin) | |
| new | Publication feedback: persisted vs public refresh, tag/path revalidation, 10 s / 30 s caches | TESTED | cross-instance lag up to about a minute |

---

## UPDATE 2026-10-28 (D6) — Unified Programs module (evidence: audit report §24–§28)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 14 | One Programs module for programs, campaigns and causes (Causes row + Program_Content row, one id); only entry under "Programs & Causes"; old routes redirect | TESTED (browser, isolated) | |
| 14 | Public carousel (3/2/1 cards), detail templates relief / endowment / project / custom, homepage block | TESTED (browser, isolated) | pixel comparison with the owner's video NOT RUN; real programs to be created by the owner |
| 13 | Public donation selectors read `?scope=public` (admins no longer see non-open entries there) | TESTED | |
| new | Partial-failure model for program saves; revalidation failure reported | TESTED (offline) | |

---

## UPDATE 2026-10-28 (D7) — homepage, sitemap, multi-image gallery (evidence: audit report §29–§34)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 14 | Homepage program sections driven by Programs (Sheets); static program HTML and modals removed | TESTED (browser, isolated) | |
| 14 | Family Relief / Qur'an / Masjid configured through the admin UI on reused permanent ids | TESTED (test sheet) | owner replaces test content/assets in production |
| 26 | Sitemap lists published program detail URLs, follows publish/unpublish | TESTED | |
| new | Multi-image gallery (Program_Images tab, Drive files, cover/order/replace/remove, public gallery, safe partial upload) | TESTED (browser + offline) | pixel comparison with owner video NOT RUN |

---

## UPDATE 2026-10-28 (D8) — full architecture + Programs acceptance (evidence: audit report §35–§41)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 18 | Server-side authorization on every admin API (33 route files, anonymous and field-agent callers) | TESTED | Firebase credential sign-in NOT RUN |
| 5 | Dashboard independently recomputed from Sheets rows; matches exactly; dashboard banner shows total warnings with remainder link | TESTED | |
| 1 | Public donation form retry survives a Drive outage (returns the original donation) | TESTED | live Drive outage not provoked |
| 14 | Ribbon passes permanent cause id; full chain program → ribbon → donation → CRM → Communications preview → reconciliation → unpublish/republish on one synthetic program | TESTED (isolated) | no new e-mail sent |

---

## UPDATE 2026-10-28 (D9) — live source-failure acceptance (evidence: audit report §42–§45)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 5 | Source failure: every admin API answers 503 with a specific message (donors and communications fixed); admin screens show errors and dashes, not zeros | TESTED (live failure simulation) | |
| 14 | Public pages no longer present cached program content as current after a bounded staleness window (default 10 min) | TESTED (live) | |

## UPDATE 2026-10-28 (D10) — configuration and resilience hardening (evidence: audit report §46–§50)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Validated Google configuration contract (secret-free), malformed/missing id and credential conflicts rejected before any request | TESTED (offline, 36 tests) | Set GOOGLE_TARGET_ENV on deployments |
| 2 | Schema registry + drift detection + read-only admin readiness endpoint with classified states | TESTED (offline; live library check read-only) | Live endpoint outage/recovery cycle NOT RUN |
| 3 | Error categories and retry rules (no retry of config/auth/permission/not-found; append not blindly retried) | TESTED (offline) | Live 429 not provoked |
| 4 | Legacy sync client no longer reports success for writes it could not perform | IMPLEMENTED (typecheck) | No dedicated test |
| 5 | Production sheet readiness: 13/19 worksheets, newer columns absent on legacy tabs | FINDING | Backup + rehearsal before release (owner) |
| 6 | Masjid Infrastructure vs General Causes as separate experiences | NOT IMPLEMENTED | Decision needed |

## UPDATE 2026-10-28 (D11) — Masjid Infrastructure vs General Causes (evidence: audit report §51–§55)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Programs admin split into Masjid Infrastructure and General Causes experiences (domain derived from template; one id per program) | TESTED (live browser + offline) | Per-need financial destinations NOT IMPLEMENTED |
| 2 | Masjid verified-update timestamp (server clock) and 7-day hold display | TESTED (offline boundaries; live "current") | Decision: block donations while on hold? |
| 3 | Public donation to a Masjid project and to a General cause by the same donor: one donor token, distinct donation ids, correct designations | TESTED (live, test sheet) | Verification/allocation/reconciliation not re-run in D11 |
| 4 | Full D11 regression: build and live suites | NOT RUN after D11 | Run before release |


## UPDATE 2026-10-28 (D12): hold, cache authority, financial chain, gates (evidence: audit report sections 56 to 64)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Masjid hold: more than 7 days without a verified update blocks new donations server-side; admin clear-hold with reason and audit | TESTED (offline) | Live overdue case NOT RUN |
| 2 | Donation eligibility and allocation read fresh data, never cached (defect fixed) | TESTED (offline regression) | |
| 3 | Live verify, allocate, reject, idempotent replay, concurrent, reverse on the test sheet, both domains | TESTED (live, test sheet) | Dashboard recount and live multi-cause split NOT RUN |
| 4 | 90/10 wording | BLOCKED (owner policy) | Presentation and free-text note only |
| 5 | Readiness endpoint contract, outage and recovery | TESTED (offline route test; live read-only classification) | Live outage of the isolated sheet NOT RUN |
| 6 | Legacy sync client regression | TESTED (offline) | SyncEngine-level test not written |
| 7 | Final build and bundle scan | build exit 0; 62 client files, 0 hits | |
| 8 | Production schema: 6 worksheets missing (4 blocking) | FINDING | Rehearsal BLOCKED (no production copy) |
| 9 | One e-mail to the SMTP account's own mailbox sent by a stray live-suite run | DISCLOSED | Delivery not verified |


## UPDATE 2026-10-28 (D13): final-code verification (evidence: audit report sections 65 to 71)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | SyncEngine: returns the real outcome; CREATE is idempotent (two defects fixed) | TESTED (offline, 5 tests) | No runtime caller exists |
| 2 | Live financial chain on the final code (eligibility, verification, allocation, replay, concurrency, reversal, multi-cause designation, independent recount) | TESTED (live, approved test sheet) | Overdue hold, ribbon UI, gallery, realtime, portal limits NOT RUN live |
| 3 | Donation route: quota exhaustion answers 503 and no longer leaks raw provider error text | TESTED (offline) | |
| 4 | Target isolation: launcher and live test guards verified; unset GOOGLE_TARGET_ENV leaves an unguarded path for plain dev runs | PASS WITH LIMITATION | Owner sets GOOGLE_TARGET_ENV |
| 5 | Process/e-mail containment: no process running; tests cannot send; earlier single e-mail recorded | DONE | Delivery unverified |
| 6 | Final checks: 402 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | |


## UPDATE 2026-10-28 (D14): runtime write guard, quota cost, allocation integrity (evidence: audit report sections 72 to 78)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Fail-closed write guard on every Google client (Sheets, Drive, OAuth Drive, legacy sync); ordinary dev run is read-only | TESTED (offline 19 tests; live suites run under it) | Owner sets GOOGLE_TARGET_ENV per environment |
| 2 | Google request counts per operation measured (donation 15 to 18, rejected donation 2, allocation 8) | MEASURED (live) | Quota remains at risk above about 3 donations a minute; remedies listed, not applied |
| 3 | Allocation row left active when the cap check could not run (found by a live 429) | FIXED, TESTED (offline) | |
| 4 | Donor dashboard showed donations as 90/10 "allocations" and AI wording; now real allocations only | FIXED, TESTED (offline) | Owner decision on the 90/10 policy |
| 5 | Live browser acceptance: ribbon lifecycle, gallery, realtime, overdue hold | BLOCKED (admin session expired) | Owner signs in or approves test auth |
| 6 | Donor portal limits | PASS WITH LIMITATION (offline only) | Cross-instance live not verified |
| 7 | Final checks: 428 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | |


## UPDATE 2026-10-28 (D15): allowlisted targets, live acceptance (evidence: audit report sections 79 to 84)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Write guard requires label + declared id + committed allowlist (+ production veto); production-id-in-both-variables bypass closed | TESTED (offline 25 tests incl. real-client zero-call proof) | Owner sets GOOGLE_TARGET_ENV and GOOGLE_PRODUCTION_* per environment |
| 2 | Google request counts: general donation 12, project donation 15 to 18; no safe further reduction | MEASURED (live) | Quota risk remains above about 3 to 5 donations a minute |
| 3 | Quick Donation Ribbon stale entry refused server-side, UI shows the reason, no row written | PASS (live browser) | Touch interaction NOT RUN |
| 4 | Program gallery admin to public flow on the isolated Drive folder | PASS WITH LIMITATION (live) | Failed-upload and swipe NOT RUN |
| 5 | Realtime: live event, disconnect, replay without duplicates | PASS WITH LIMITATION (live) | UI re-render and outage case not re-run |
| 6 | Masjid overdue hold live via supported test clock (+0/+6 accepted, +8 refused, clearance + audit) | PASS WITH LIMITATION (live) | Exact 7-day boundary offline only |
| 7 | Donor portal limits with persisted state, second-instance refusal, hashes only | PASS (live, mocked transport) | Concurrent-instance races not tested |
| 8 | Donor dashboard shows real allocations only; 90/10 note still present | PASS (offline) / OWNER DECISION | Per-need funding NOT IMPLEMENTED |
| 9 | Drive OAuth: connected, testing mode, reauthorize by 2026-11-02 | OWNER ACTION | |
| 10 | Final gates: 435 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |


## UPDATE 2026-10-28 (D16): row-position integrity, OAuth continuity, exact boundary, quota (evidence: audit report sections 85 to 92)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Google reports wrong row numbers for overlapping appends; portal guard, donation claim, donor creation and recipient queue now locate their own row by a unique marker (HIGH defect fixed) | FIXED, TESTED (offline regression fails on old code; live 14-way and 6-instance runs) | Not proven for arbitrary load (no atomic multi-row transactions in Sheets) |
| 2 | Donor-portal concurrency across separate instances: exactly 10 per IP, 3 codes per identifier, hashes only | PASS (live, mocked transport) | |
| 3 | Concurrent donations via 6 instances: distinct ids, intact rows, one donor | PASS (live) | |
| 4 | Drive OAuth: same project as the service account, scope `drive` only, token usable today, expiry date is app-computed from a declared Testing status | OWNER ACTION | Check the consent-screen status; production publication of a restricted scope may need Google verification |
| 5 | Exact Masjid boundary with a frozen test clock (-1 ms, exactly 7 d accepted; +1 ms refused) | PASS WITH LIMITATION (live) | Fail-closed on unreadable hold data offline only |
| 6 | Gallery: mobile width, keyboard, buttons, broken image isolation; failed-upload recovery via test adapter | PASS WITH LIMITATION | Real finger swipe and real-provider failure NOT RUN |
| 7 | Quota: documented limits 60 reads and 60 writes per minute per user per project, shared by all instances; ceiling about 5 to 6 donations a minute | LIMITATION (documented) | Owner-level mitigation |
| 8 | Live integrations after the allocation fix | PASS (one genuine 429 on first run, passed on rerun) | |
| 9 | Final gates: 440 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |

## UPDATE 2026-10-29 (D17): append integrity and concurrency (evidence: audit report sections 93 to 101)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Inventory of every append path; no remaining consumer trusts an append-response row number | DONE | `baseRepository.save` and the Drive token store keep a low-frequency check-then-append risk (documented) |
| 2 | Realtime event log took event ids from the append response (wrong/duplicate ids, skipped events) | FIXED, TESTED (offline + live) | |
| 3 | Designation rows could be duplicated by overlapping writers | FIXED, TESTED (offline) | |
| 4 | Concurrent replays of one allocation key created several active allocations | FIXED, TESTED (offline + live chain) | |
| 5 | Identical donation submitted concurrently: one row, one designation, one id for everyone | PASS (offline 8 callers, live 5 instances) | |
| 6 | One-time code single use, rate limits, recipient outcomes under concurrency | PASS WITH LIMITATION (tested loads only; no atomic transactions in Sheets) | Strict guarantees need a transactional store (owner decision) |
| 7 | Read-only integrity analysis of the isolated sheet | FINDINGS KEPT (one over-allocation from the D14 429 incident, historical fixtures) | Nothing repaired or deleted |
| 8 | Final gates: 450 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |

## UPDATE 2026-10-29 (D18): Drive OAuth leaving Testing (evidence: audit report sections 102 to 108)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Public privacy page /privacy with Google Drive disclosure and the owner's wording; footer and sitemap linked | DONE (offline build; page renders) | Owner confirms contact address; legal review recommended |
| 2 | Scope mode `drive.file` support + app-owned root folder endpoint (default unchanged) | TESTED (offline) | Live exercise needs owner re-consent with the new scope |
| 3 | Owner checklist for leaving Testing | DONE | |
| 4 | Public domain, deployment, Search Console verification, Branding, publishing | BLOCKED (no domain: daarayn.org does not resolve) | Owner: provide domain and deploy |
| 5 | Google verification of the restricted `drive` scope | NOT RUN (external; weeks to months, security assessment) | Option A avoids it |
| 6 | Gates: 455 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |

## UPDATE 2026-10-29 (D18 continued): domain, OAuth strategy, persistence residuals (evidence: audit report sections 109 to 114)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Domain daaraynorg.com | NOT LIVE (no DNS answer) | Owner: deploy, DNS, HTTPS, Search Console |
| 2 | Public URLs, footer cleaned (no invented phone, no placeholder Terms), vendor-neutral privacy page | DONE | Owner confirms contact mailbox |
| 3 | drive.file compatibility matrix and strategy comparison; branding and verification pack | DONE (documents) / live proof NOT RUN | Owner re-consent on isolated resources |
| 4 | OAuth publishing / Google verification | NOT DONE (owner and Google) | weeks to months for the restricted scope |
| 5 | Concurrent same-id entity creation, first Drive connection, designation cleanup safety | FIXED, TESTED (offline) | live not rerun |
| 6 | Anomaly classification (120 vs 100 historical incident, DNR-TEST fixtures, shared-email fixtures) | CLASSIFIED, preserved | none repaired by design |
| 7 | Reads/writes per operation measured | MEASURED (live) | capacity about 5 to 6 donations a minute |
| 8 | Production schema and migration preparation document | DONE | Rehearsal BLOCKED |
| 9 | Final gates: 462 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |


## UPDATE 2026-10-30 (D19): shared template, categories, live statistics (evidence: audit report sections 115 to 119)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | One shared program-detail composition for every template (desktop two columns, mobile stacked); root cause fixed | PASS (measured at 1280 and 375 px) | tablet and 280 to 320 px not visually inspected |
| 2 | Trust Allocation Model cards: three in a row on mobile only | PASS (280, 320, 375, 430 px; tablet unchanged) | |
| 3 | Cases Completed and Masjid Projects from persisted data, live refresh | PASS WITH LIMITATION (live; polls every 60 s) | no push to the public page |
| 4 | Students Sponsored | NOT IMPLEMENTED (no sponsorship data; shows a dash) | owner defines the record |
| 5 | Category model (Masjid, Qur'an Hifz, General), separate from template; admin three experiences | DONE, TESTED (offline) | Hifz private records/consent/recordings not modelled |
| 6 | Homepage three carousels, View All pages, honest empty/unavailable states | PASS (live data; listing pages offline/build) | listing pages not visually inspected on small screens |
| 7 | Hero seam: gradient end colour and section background aligned with the page | FIXED (measured) | no frame-by-frame device review |
| 8 | Architecture diagrams updated | DONE (docs/architecture/DAARAYN_ARCHITECTURE_D19.md) | |
| 9 | Gates: 472 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO; Program_Content worksheet still missing in production |

## UPDATE 2026-10-30 (D19 continued): category listing alignment, master acceptance pass (evidence: audit report sections 120 to 124)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Category listings and carousels adapt to the number of published records (1 and 2 centred, 3 fill, more wrap with centred last row; mobile single column) | PASS (rendered preview, publish/unpublish live) | empty state seen offline only |
| 2 | Master acceptance pass: routes, carousels, template, statistics, hold boundary, identical-key concurrency | PASS / PASS WITH LIMITATION | admin dashboard and CRM not re-inspected visually |
| 3 | Live financial chain and 6-instance donations rerun | PASS WITH LIMITATION (Google quota exhausted two runs) | run suites one at a time |
| 4 | Qur'an Hifz private records, consent, recordings, teacher verification | NOT IMPLEMENTED | owner decision |
| 5 | Gates: 478 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |


## UPDATE 2026-10-30 (D20): Google Sheets quota remediation (evidence: audit report sections 125 to 131)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Root cause: one service account shares 60 reads per minute across every caller; no self-pacing | IDENTIFIED | |
| 2 | In-process read/write rate control, bounded wait, penalty on 429, one retry policy with Retry-After and elapsed limit | PASS (offline 15 tests; live) | |
| 3 | Fewer requests: batched eligibility and allocation reads, safe read coalescing (allocation reads 6 to 3, rejected 4 to 1, donation reads 12 to 11) | PASS WITH LIMITATION | donation-id claim protocol kept |
| 4 | Cross-instance limiter | BLOCKED (needs owner-approved shared infrastructure; interface ready) | decision |
| 5 | Live: single chain 6/6, six concurrent donations (0 429, 0 retries, 71 s), identical-key replay | PASS | |
| 6 | Safe exhaustion: truthful retryable 503, nothing stored | PASS (offline) | |
| 7 | Capacity estimate about 4 donations a minute per process | ESTIMATE | not a guarantee |
| 8 | Gates: 493 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan 0 hits | PASS | Production NO-GO |


## UPDATE 2026-10-30 (D21): Shared Google request limiter (evidence: audit report sections 132 to 137)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Shared atomic coordinator client (Redis REST, Lua GCRA, per service identity, read/write keys) | IMPLEMENTED, TESTED OFFLINE against a local emulator (20 tests) | not tested against a real service |
| 2 | Explicit failure policy: fail_closed default, degraded_local opt-in | PASS (offline) | owner decision |
| 3 | Readiness shows limiter mode and warns when process-local | IMPLEMENTED | |
| 4 | Live six-donation and replay through emulated coordinator: 0 429, 0 retries | PASS (single process) | |
| 5 | Real cross-instance enforcement | BLOCKED (owner must approve/provision infrastructure; see docs/ops/SHARED_LIMITER.md) | decision, secrets, redeploy, multi-instance live test |
| 6 | Gates: 513 offline tests, tsc 0, eslint 0 errors, build exit 0, bundle scan (only public Firebase web key) | PASS | Production NO-GO |


## UPDATE 2026-10-30 (D22/D23): limiter completion, quota recovery, UI (evidence: audit report sections 139 to 146)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Production refuses Google requests and readiness returns 503 when the shared limiter is not configured | PASS (offline) | |
| 2 | Legacy sync client and readiness checks now inside the limiter boundary | PASS (offline) | |
| 3 | Three independent processes sharing one budget | PASS WITH LIMITATION (local emulator only) | real service not configured |
| 4 | Real shared-service verification (`shared-limiter-real.live.test.ts`) | NOT RUN | owner provisions service and secrets |
| 5 | Six concurrent donations at the default 25 s wait: 6/6, longest single wait 9 s, 0 429, 0 refusals | PASS (single process) | |
| 6 | Controlled quota exhaustion: truthful 503, nothing stored on read exhaustion, replay yields one donation | PASS (live) | |
| 7 | "View Our Impact" at 280/320 and "Quick Donate" at 820: fixed, screenshots saved | PASS | |
| 8 | Program detail two-column with image, single column on mobile | PASS | |
| 9 | Hero video | PASS WITH LIMITATION | tonal step on mobile judged by eye |
| 10 | Admin dashboard and CRM visual review | BLOCKED (sign-in required) | |
| 11 | Gates: 526 offline tests, tsc 0, eslint 0 errors, build 0, bundle scan (public Firebase key only) | PASS | |
| 12 | Release decision | READY AFTER SPECIFIED EXTERNAL SETUP | shared Redis service plus earlier owner items |


## UPDATE 2026-10-30 (D24 to D26): coordinator hardened, live runs through it, admin review (evidence: audit report sections 147 to 155)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Provider-neutral limiter (Redis URL, REST, self-hosted coordinator), project plus identity budget in one atomic step | PASS (offline) | |
| 2 | Coordinator hardened: durable state, 75 s quarantine on state loss, single-instance lock, auth, HTTPS flag, health/ready, Dockerfile | PASS WITH LIMITATION (17 real-process tests; not hosted) | hosting |
| 3 | Hosted coordinator reached from Vercel / real multi-instance run | NOT RUN | owner hosts one instance, sets URL and token |
| 4 | Live A to D through the local coordinator: chain 6/6; six donations 6/6, longest wait 10 s, 0 429; replay 1 row; exhaustion 503 then one donation | PASS | |
| 5 | Admin dashboard, donors/CRM, communications, programs, reconciliation reviewed (signed in) | PASS WITH FINDINGS | Hifz/Masjid shown as GENERAL in the audience list; 4 interrupted test donations and 1 PENDING placeholder in the test sheet |
| 6 | Hero video visible; View All backgrounds equal home sections; Masjid notice aligned | PASS (see evidence-d26) | |
| 7 | Gates: 547 offline tests, tsc 0, eslint 0 errors, build 0, bundle scan (public Firebase key only) | PASS | |
| 8 | Release decision | READY AFTER SPECIFIED EXTERNAL SETUP | coordinator hosting plus earlier owner items |


## UPDATE 2026-10-30 (D27): hosting inspection and final verification (evidence: audit report sections 156 to 161)

| # | Update | Status now | Remaining |
|---|---|---|---|
| 1 | Hosted coordinator, Vercel variables, deployed readiness, real shared-limiter tests, hosted six-donation run | BLOCKED / NOT RUN (no hosting access on this machine) | owner authorises one host; options in section 156 |
| 2 | Communications audience labels use the three categories | PASS (verified in the rendered admin page) | |
| 3 | Untraced console error | NOT REPRODUCED (19 production captures, 0 errors) | |
| 4 | Masjid note, centred single card, detail layouts, hero video, 280/320/820 clipping | PASS (evidence-d27) | |
| 5 | Interrupted test donations (4) and placeholder (1) | RETAINED, read only | approved test-data recovery |
| 6 | Gates: 547 offline tests, tsc 0, eslint 0, build 0, bundle scan (public Firebase key only) | PASS | |
| 7 | Production migration rehearsal, domain/HTTPS, OAuth, policy decisions | NOT RUN / owner action | |
| 8 | Deployment | NOT DONE (gates not satisfied) | |
| 9 | Release decision | READY AFTER SPECIFIED EXTERNAL SETUP | |
