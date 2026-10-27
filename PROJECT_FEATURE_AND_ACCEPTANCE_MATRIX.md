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
