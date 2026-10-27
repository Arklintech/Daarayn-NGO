# Daarayn — End-to-End Audit, Fix & Re-verification (Phase D3)

Date: 2026-10-27 · Branch `release/final-daarayn` · Nothing committed, pushed, deployed or migrated by this audit.
Evidence rule used throughout: **PASS** only with executed evidence; SMTP acceptance is never "delivered"; a confirmation screen is never "persisted".

## 1. Executive summary

The platform's core chain works against real Google Sheets, Drive and Gmail SMTP when run in isolation:
public form → Sheets → dashboard → Donations → CRM → designation → allocation → reconciliation → approved e-mail → per-recipient CRM history.
The audit found and fixed **15 defects** (including 2 security/privacy defects and several places where the UI presented fabricated or misleading information) with a regression test for each and a live retest.
**Update (owner confirmation, §13):** the owner has confirmed receipt of all test e-mails sent during the audit (**owner-confirmed**; not independently observed by the auditor, whose mailbox access was never available). The application's recorded status for all 16 recipient rows remains `smtp_accepted`, which is unchanged. The **4th approved address** was never mailed and is not needed; the spelling discrepancy is resolved as a documentation matter in §13.

Release recommendation: **ready for further controlled testing; not ready for public launch** until the residual items in §12/§13 are closed (repository privacy/key revocation, donor-portal e-mail rate limit, Drive OAuth publishing, oversize-attachment decision). Inbox confirmation is closed as owner-confirmed.

## 2. Isolation and safety evidence (no secrets recorded)

| Control | Evidence |
|---|---|
| Test spreadsheet only | Launcher forces `GOOGLE_SHEET_ID` = `1sGVsMEQ…eGzM` (process env overrides `.env.local`), aborts if it equals the production id; offline + live suites refuse production. |
| Drive isolation | Dedicated folder "Daarayn D3 IntegrationTest (safe to delete)" created in the connected account's My Drive; the production evidence folder was only read for metadata by the live test. Every proof, evidence and attachment landed under that test folder (verified by walking the tree). |
| E-mail isolation | New server-side guard `EMAIL_RECIPIENT_ALLOWLIST` (lib/email/providers/gmail.ts) refuses any other address before SMTP is contacted; set to the approved addresses during all runs. |
| Failure simulation | Separate run with an impossible spreadsheet id; cannot touch real data. |
| Production untouched | No production sheet/Drive write, migration, push or deploy. `.env.local` unchanged. |

## 3. Integration status

| Integration | Status | Evidence |
|---|---|---|
| Google Sheets | PASS | Write/read-back, update, wrong-id and permission errors explicit (live suite 13/13); isolated test sheet used. |
| Google Drive (OAuth) | PASS | Upload/retrieve/privacy/404 (7/7); proofs, allocation evidence and attachments verified in the test folder; owner-only permissions; anonymous media request → 401. OAuth app is in Testing mode: refresh token expires ≈ 2026-11-02. |
| Gmail SMTP | PASS (acceptance only) | Login with rotated credential; wrong-credential case reported clearly. Inbox arrival **owner-confirmed** (§13); recorded status stays `smtp_accepted`. |
| Firebase Auth / authorization | PASS | 21 admin read/write endpoints probed anonymously all returned 401; a static scan of every API route found 9 without an auth call (public donation form, OAuth callback, manifests, decommissioned stubs returning 410, and the donor portal routes, of which two were a defect, §6 F4). |
| Realtime (SSE) | PASS | Stream connects, heartbeats; two donation changes arrived as `DONATION_UPDATED` after being persisted. |

## 4. End-to-end traceability (final smoke, after all fixes)

Donor `DNR-MVQR9I1P-YF7I` (existing donor, e-mail re-used) → public form (UI) → **DA035**, ₹333, cause `LIVE-FOOD-MVQQ4ZL5`:
1. Persisted row: amount 333, status pending, donor token as above, designation `LIVE-FOOD-…:333:designated`, proof on Drive.
2. Dashboard: pending +₹333 / +1; verified unchanged. After admin verification: pending −₹333, verified +₹333 / +1.
3. Allocation ₹100 accepted (active allocations +₹100); ₹300 more refused (409); no new integrity exception.
4. CRM history of the donor lists DA035 and the allocation; donor token unchanged across DA026/DA027/DA035.
5. Approved `project_progress` (audience preview = exactly this donor) → recorded `smtp_accepted`, 1 attempt, content hash, provider id. Dashboard communications: 16 recipients, 16 SMTP-accepted, 0 failed.

Earlier chain: DA022/DA023 (same donor, e-mail typed in different case and with spaces → same token), DA024 (multi-cause ₹900 → split 500/400 → allocations).

## 5. Test ledger

| ID | Scenario | Status | Notes |
|---|---|---|---|
| P1.1 | Sheets write/read-back, errors | PASS | live |
| P1.2 | Drive upload/retrieve/privacy/errors | PASS | live; invalid types blocked at the upload route |
| P1.3 | SMTP auth, controlled sends | PASS (SMTP acceptance) | |
| P1.4 | Auth: unauthenticated/forged/anonymous | PASS after F4 | |
| P2.1 | New donor, single cause (UI) | PASS | DA022 |
| P2.2 | Repeat donor, formatting variants | PASS | same token, new IDs |
| P2.3 | Multi-cause, unresolved until exact split | PASS | DA024; equal split never invented |
| P2.4 | Invalid input (9 cases) | PASS after F2 | no partial rows |
| P2.5 | Parallel/replayed submissions | PASS after F3 | 1 row, 1 proof file |
| P3 | Sheets as source of truth | PASS | rows compared to UI |
| P4.1 | Dashboard reconciliation | PASS | verified 30/₹6,263 = donor list 25/₹5,648 + 5/₹615 orphan donations (flagged by F9) |
| P4.3 | Sheets read failure | PASS after F12 | 503s, banners, "—", no zeros |
| P5 | CRM list/detail/history | PASS after F8–F11 | |
| P6 | Cause lifecycle and propagation | PASS | Draft/Completed/Inactive excluded and refused; Active/Urgent public; history retained; dupe title/no-target/bad status refused |
| P7 | Designations | PASS | 10 invalid splits refused, state unchanged |
| P8 | Allocations (14 scenarios) | PASS after F6 | limits, replay, reversal history kept, concurrency |
| P9 | Communications, 5 purposes | PASS | each purpose per its rule; approval binding (8 tamper attempts refused); duplicates prevented |
| P9.5 | Failure/ambiguous outcomes | PASS WITH LIMITATION | covered by offline tests (failed → retried safely, ambiguous → unresolved, never auto-resent); not provoked live |
| P10 | Attachments | PASS after F7 | real upload + send; missing/oversize/unsafe refused; Drive-link alternative for oversize **not implemented** (rejected instead) |
| P11 | Reporting reconciliation | PASS | invariant: unrestricted ₹1,725 + unresolved ₹900 + Σ designated ₹3,527 = verified ₹6,152 (at that time) |
| P12 | Quota/reliability | PASS after F13 | cold-start cost 34 → 15 calls |
| P13 | Proof upload via public form | PASS | real Drive id, private, retrievable only by admin, byte-identical |
| P14 | Regression | PASS | §11 |
| E1 | Inbox arrival | **PASS — owner-confirmed** | owner reports receiving all test e-mails; not independently observed by the auditor (§13) |
| E2 | 4th approved address | **NOT TESTED — owner confirmation required** | never mailed; no record exists for any spelling (§13, §15.9) |

## 6. Defects found and fixed (root cause → fix → test → live retest)

| # | Defect | Root cause | Fix (files) | Regression test |
|---|---|---|---|---|
| F1 | Form showed "2 causes" while one was stored | selection toggle was additive; server treats general+specific as specific | `lib/donations/causeToggle.ts`, `DonateForm.tsx` | donation-cause-toggle |
| F2 | Malformed `selectedCauses` silently became an unrestricted donation | `catch` only logged | `api/donate/route.ts` → 400 | donate-route-validation |
| F3 | Replayed/parallel submissions left orphan proof files | upload ran before duplicate was known | delete own redundant upload on duplicate (`donationService.ts`) | donation-duplicate-proof |
| F4 | **Security:** donor portal handed the donor token to anyone who knew an e-mail/phone and the unauthenticated dashboard then served the full profile and history | no proof of contact ownership | one-time e-mailed code → signed httpOnly session; generic lookup answers; dashboard serves only the session donor (`lib/donors/portalAuth.ts`, `api/donor/{lookup,verify,dashboard}`, portal pages) | donor-portal-auth, communications |
| F5 | Donor portal showed fabricated donors ("Sara Ahmed"…) when the API failed | hardcoded fallback | removed; honest error / redirect | build + page |
| F6 | Simultaneous allocations all rolled back (nobody got funds that fit) | post-write check summed every row, not rows up to its own | prefix rule: earliest row wins (`allocationService.ts`) | operations J2 |
| F7 | **Attachments:** unreadable files silently dropped; any file type/size accepted; server could fetch internal URLs | swallowed errors; no validation | strict resolve + size limit + URL safety + upload validation (`broadcast-worker.ts`, send/upload routes) | communications (6) |
| F8 | CRM: every message "Delivered"; invented welcome mail | hardcoded label/row | status from record: "Accepted by mail server" (`lib/donors/display.ts`, OverviewTab); comms screen wording | donor-display |
| F9 | CRM: hardcoded "Verified", "General Fund", sample remarks/source/ref id, "Verified By: Super Admin", "Causes Supported 0" | fabricated fallbacks; read a field that no longer exists | show recorded data or "—" | donor-display |
| F10 | Donor list and profile disagreed; a donation could show on another donor sharing the e-mail | `belongsToDonor` matched token OR e-mail | token is authoritative (`lib/donations/metrics.ts`) | donors-and-donations |
| F11 | Donor list: cause filter emptied the list; fake KPI trends/insights; "VIP" on row 1; fixed "10 May"; "Mumbai" default; "Verified" badge for every donor | wrong field names; hardcoded content | real data + `supportedCauseIds` in `/api/donors` | donors-and-donations |
| F12 | Donor list showed 0 donors/₹0 with no error when Sheets failed | fallback to an empty "local" endpoint | error banner, "—", no fallback; Donations/dashboard empty-states honest | live failure simulation |
| F13 | Cold-start quota burst (34 Google calls for 3 requests, 30 for setup) | tab listing memoised only after completion; 15 header reads | in-flight memoisation + batched header read (`sheets.ts`); usage counters + `/api/admin/diagnostics/google-usage` | sheets-startup, google-usage |
| F14 | Integrity check missed donations of a missing donor and donors sharing a contact | no rule | `DONATION_DONOR_MISSING`, `DUPLICATE_DONOR_CONTACT` (detect only, never merge) | integrity-donor-links |
| F15 | Outbound mail not constrained in tests | — | opt-in `EMAIL_RECIPIENT_ALLOWLIST` | email-allowlist |

## 7. E-mail report

Approved addresses: `<owner mailbox A>`, `<SMTP-account mailbox>` (SMTP account), `<owner mailbox B>` used; **`<4th address, spelling as typed in the directive (…khn845)>` NOT used** (differs from the earlier `<4th-address variant>` by one letter; mailing a possibly wrong mailbox was refused).
Controlled live messages, all SMTP-accepted with 0 failures and none to any other address. Dashboard totals at the end: 16 recipient-level acceptances (project_progress 10, contribution_confirmation 2, general_communication 2, allocation_confirmation 1, completion_report 1), including one general message with 2 attachments; in addition donation-confirmation mails for the form donations, one donor-portal code mail, and the live-suite test messages. Per-recipient records show `smtp_accepted`, attempts, content hash, provider id; the UI never says "delivered". **Inbox arrival: not observed by the auditor; later owner-confirmed (E1, §13).**

## 8. Drive evidence report

Proofs, allocation evidence (`Allocation Evidence/`) and attachments (`Communications/`) exist only under the test folder; owner-only permission; authorised retrieval returns identical bytes; anonymous → 401. Historical pre-fix orphans (`idem.png` ×4, `p-n.png`) were left as evidence of F2/F3.

## 9. Data-integrity report

IDs unique (no duplicate donation ids or donor tokens). Designations reconcile exactly; allocations never exceed designations (parallel test: total ≤ designated); reversals keep rows and the original reason (a repeat reversal is an idempotent no-op that does **not** overwrite it). Known fixture anomalies in the test sheet (not app defects): 6 donors share one e-mail (`DNR-LIVE-*`), 5 donations point to missing donor `DNR-TEST` — both now reported by the integrity check.

## 10. Quota and performance

First session: HTTP 429 bursts and 13–15 s admin API responses. Evidence (new counters): a cold instance made 34 Google calls for 3 requests, 30 of them tab/header setup. After F13: 15 calls for a full admin page load; notifications 0.9 s instead of ~15 s. Realtime polling remains one Sheets read per 4 s per instance with SSE clients (≈15/min): acceptable alone, but it shares the 60/min/user read quota with page loads; counters now make this measurable. Not load-tested at scale.

## 11. Regression results (after the last change)

`npx tsc --noEmit` **0 errors** (was 3 in the 2026-10-17 baseline) · ESLint **0 errors**, 213 warnings (pre-existing style warnings) · offline Vitest **167/167** (was 106) · live Vitest **24/24** (Sheets, Drive, SMTP, unified operations) · `next build` **succeeds** · browser smoke chain in §4 **passes**.

## 12. Residual risk register

1. ~~Inbox arrival (E1) and 4th address (E2)~~ closed in §13 (owner-confirmed; address not used).
2. Donor-portal code e-mails are rate-limited per IP only (10/min) and per-code guesses are counted in memory (per instance); add per-donor throttling before public launch. Phone-only donors cannot use the portal (no e-mail to send a code to).
3. Concurrent allocations: the earliest row wins, but a loser may also be rejected when an earlier loser's row is still present (conservative; never over-allocates).
4. Oversize attachments are rejected; a secure Drive-link alternative is **not implemented**.
5. Drive OAuth is in Testing mode (token expiry ≈ 2026-11-02); the GitHub repository is public and old service-account keys remain to be revoked (owner action, unchanged).
6. Legacy content still to review: `app/admin/settings` (static admin list, Firestore wording), donor portal copy claiming tax receipts/"blockchain ledger", cause slug `sheikh-arham-sponsorship`, placeholder footer phone.
7. Test sheet contains synthetic data from several runs (kept as evidence). Production migration/backup validation not run (not authorised).
8. Admin session token (≈1 h) is renewed only while an admin page is open; long scripted sessions saw 401s until reload.

## 13. Changed files

Source: `app/admin/{communications,dashboard,donations,donors}/page.tsx`, `app/admin/donors/[id]/{page.tsx,tabs/OverviewTab.tsx}`, `app/api/{donate,donors}/route.ts`, `app/api/admin/communications/{send,upload}/route.ts`, `app/api/donor/{lookup,dashboard}/route.ts`, `app/donor/{page,dashboard/page}.tsx`, `components/DonateForm.tsx`, `lib/broadcast-worker.ts`, `lib/donations/{metrics,selection}.ts`, `lib/email/providers/gmail.ts`, `lib/google/{retry,sheets}.ts`, `lib/reporting/integrity.ts`, `lib/services/{allocationService,donationService}.ts`.
New: `app/api/admin/diagnostics/google-usage/route.ts`, `app/api/donor/verify/route.ts`, `lib/donations/causeToggle.ts`, `lib/donors/{display,portalAuth}.ts`, `lib/google/usage.ts`, `lib/server/signingKey.ts`.
Tests: `tests/{donate-route-validation,donation-cause-toggle,donation-duplicate-proof,donor-display,donor-portal-auth,email-allowlist,google-usage,integrity-donor-links,sheets-startup}.test.ts` new; `communications`, `donors-and-donations`, `operations`, `helpers/mocks` extended.
Local-only (untracked, not part of the product): `.claude/launch.json` entries `daarayn-d3-isolated`, `daarayn-d3-failure-sim`.
Pre-existing uncommitted changes (`next.config.ts`, `next-env.d.ts`, deleted old docs) were left untouched.

## 13. Final e-mail verification update (owner confirmation, 2026-10-27)

**Owner statement:** the owner received all test e-mails sent during this audit. Evidence class: **owner-confirmed inbox receipt**. The auditor never had mailbox access, so this is not independently observed, and it does not change what the application recorded.

**Reconciliation (read-only query of `Communication_Recipients` on the isolated test sheet):**

| Recipient (approved) | Rows | Recorded status |
|---|---|---|
| `<SMTP-account mailbox>` (SMTP account) | 13 | 13 × `smtp_accepted` |
| `<owner mailbox A>` | 2 | 2 × `smtp_accepted` |
| `<owner mailbox B>` | 1 | 1 × `smtp_accepted` |
| any other address | 0 | none (no real donor, no variant of the 4th address) |

Total 16 recipient rows, 0 failed, 0 unresolved: matches the dashboard figure in §7. Campaigns: project_progress ×10 (`BCAST-1793044578639-5586`, `…046797721-7992`, `…051304214-6606`, `…051542561-6124`, `…107925732-7453`, `…109120169-2262`, `…111108145-8174`, `…112772793-2245`, `…112823040-2322`, `…113008975-3419`), contribution_confirmation ×2 (`…111502665-9072`), allocation_confirmation ×1 (`…111520750-4675`), general_communication ×2 (`…111533285-2627`, `…111653525-2643`), completion_report ×1 (`…111602621-2903`). Each has exactly one recipient row per recipient, one attempt where recorded, and the send allowlist was active for every run.
Mail outside the 16 campaign rows (donation-confirmation mails, one donor-portal code mail, live-suite test messages) is not recorded per recipient in the sheet; the owner's confirmation covers them only as far as the owner saw them, and they were likewise restricted by the allowlist.

**Status wording kept honest:** the app still records and displays `smtp_accepted` / "Accepted by mail server". It has no inbound signal of inbox delivery, so it must never show "Delivered". Inbox receipt is a separate, owner-confirmed audit fact.

**Fourth address (E2) — not tested (see §15.9 for the final wording):** the launcher's original approved configuration contained three addresses with the fourth marked "pending spelling confirmation", and no log or sheet row contains `<4th-address variant>` or `<4th-address variant>` (verified by query). The repository's historical test files use the spelling `<4th-address variant>`, one letter different from the one typed in the directive, so the discrepancy is a typing variant, not a second mailbox. Decision: **no message was or will be sent to either spelling** without the owner stating the exact address; no message was repeated. The other mailboxes already exercised every purpose, but the fourth address itself remains untested.

## 14. Remaining actions before release

1. **Donor portal:** add per-donor (and per-address) throttling and a daily cap on code e-mails, shared across instances (current limit is per IP, in memory). Decide handling for phone-only donors.
2. **Oversized attachments:** currently rejected (422). Implement a secure Drive-link alternative or document the 10 MB / 18 MB limits in the admin UI.
3. **GitHub repository:** make it private (owner action); check history for committed secrets before any visibility decision.
4. **Service-account keys:** revoke the old keys in Google Cloud and confirm only the rotated key is in use (owner action); the SMTP password was already rotated.
5. **Drive OAuth:** the consent screen is in Testing mode, so the refresh token expires about 2026-11-02. Publish the app (or move to a Workspace internal app) and re-authorise before launch.
6. **Production-readiness not yet done:** production migration/backup validation, deployment verification, multi-device realtime test, legacy content cleanup (§12 item 6), commit/review of the uncommitted work, and owner sign-off. None was authorised in this audit.

---

# ADDENDUM D4 — Pre-release hardening (2026-10-28)

Scope: close the remaining release gaps from §12/§14, verify, and prepare an evidence-based recommendation. Same rules as before: test sheet and Drive test folder only, approved test addresses only, no commit/push/deploy/migration/visibility change/credential revocation. Production was touched only by **read-only metadata queries** (worksheet names, header rows, row counts; no cell contents read). Initial state: branch `release/final-daarayn`, 61 pre-existing uncommitted paths (snapshot kept in the session scratchpad as `git_status_T0.txt`); everything below is additional uncommitted work.

## 15. Task results

| Task | Status | Summary |
|---|---|---|
| T1 Donor-portal hardening | **PASS WITH LIMITATION** | Shared, multi-instance limits implemented (below). Limitation: phone-only donors unsupported; live positive path (code arriving by e-mail) not exercised because only the mailbox owner can read the code. |
| T2 Attachments / Drive-link | **PASS WITH LIMITATION** | Oversize files delivered as personal, expiring, fingerprint-bound links; direct attachments kept; file identity bound to the approval. Limitation: per-file upload cap stays 10 MB; links are bearer links (anyone holding the e-mail can open them); no per-link revocation (see below). |
| T3 Multi-session realtime | **PASS WITH LIMITATION** | Two authenticated tabs of one admin identity in one browser, plus anonymous/garbage-credential probes. Not tested: two physical devices, different admin identities, logout/token-expiry mid-stream (the Claude-in-Chrome extension was not connected). |
| T4 Wording/data-display audit | **PASS** (fixes made) | 6 real defects fixed, remainder classified (table below). |
| T5 Credentials / Drive OAuth review | **PASS (review); owner actions OPEN** | Inventory and checklist below; nothing revoked or changed. |
| T6 GitHub / secret exposure | **PASS (review); owner actions OPEN** | One old SMTP password in unpushed history; none at HEAD. |
| T7 Production migration readiness | **PASS WITH LIMITATION (dry-run)** | Read-only schema diff + legacy-shape tests; no production write; a full rehearsal on a copy of production is **NOT RUN**. |
| T8 Regression | **PASS** | See §15.8. |
| T9 Fourth address | **NOT TESTED — owner confirmation required** | See §15.9 (supersedes the "resolved" wording of §13). |
| T10 This report | done | |

### 15.1 T1 donor portal (defects D4-1, D4-2)
Root cause: the code-request limit was per IP in a per-instance `Map`; guess counting and single use were also per-instance, so N instances multiplied every limit and a code could be replayed on another instance.
Fix (`lib/donors/portalGuard.ts`, `portalAuth.ts`, `api/donor/{lookup,verify}`): an append-only ledger in the existing Google Sheets store (tab `Portal_Auth_Events`; IP, identifier, donor and challenge values stored only as keyed hashes; codes never stored or logged). Each request appends first and then reads, and is allowed only if its own row's rank is within the limit (earliest rows win, so concurrent bursts cannot all slip through). Limits: per IP 10 requests / 10 min; per normalised identifier 3 / 15 min; per donor 3 / hour and 10 / day; global daily cap (`PORTAL_DAILY_CODE_CAP`, default 300); per challenge 5 guesses; per IP 30 attempts / 10 min; a code is consumed with an atomic claim and then refused everywhere; expiry 10 min (signed). Refused requests are voided so an attacker cannot extend a victim's lock-out. Responses stay identical for known, unknown, phone-only and refused identifiers (only the per-IP limit answers 429); mail is sent after the response where the framework allows, removing the timing difference. If the ledger cannot be read or written the portal answers 503 and sends nothing (**fail closed, no in-memory substitute**). Residual: the ledger grows (needs a retention job before high volume); per-donor limits still allow up to 10 code e-mails a day to a victim; `x-forwarded-for` is trusted as set by the hosting proxy.
Evidence: 18 new route-level tests (`tests/donor-portal-guard.test.ts`) including separate-instance simulation (module state discarded, only Sheets kept), concurrency (8 simultaneous requests ≤ 3 mails; 6 simultaneous uses of one code → exactly one session), expiry, reuse, wrong codes, unknown identifiers, no plaintext in the ledger, fail-closed. Live (isolated test sheet): 5 unknown-identifier requests → 3 counted + 2 voided, 7 wrong guesses → 401, ledger scan found no IP/identifier/code in plaintext.
**Phone-only donors:** unsupported; they cannot receive an e-mail code. Recommended: (1) collect an e-mail at donation time and keep the e-mail code flow; (2) admin-assisted, time-limited sign-in link sent by the Foundation through an existing channel; (3) SMS/WhatsApp OTP only after the owner chooses a provider, accepts per-message cost and completes India DLT/template registration. Not implemented.

### 15.2 T2 attachments (defects D4-3 .. D4-5)
Findings: (a) the e-mail body listed uploaded files as links to `/api/media/<id>`, which require an admin sign-in, so donors received broken links; (b) the approval bound only the file URL, not its content, so a file replaced after approval would be sent under the old approval; (c) the Gmail transport's 20 s idle timeout aborted every 10 MB message (a 10 MB message took ≈104 s to upload on this connection; the live send of three 14 MB messages failed with `ETIMEDOUT`, recorded honestly as `failed`, 6 attempts, nothing delivered).
Fix: `lib/communications/attachments.ts` — content fingerprint (Drive md5) bound into the approval hash; deterministic plan in the review step (attached ≤ 15 MB total in the order given, the rest as links; shown to the reviewer as `attachments` + a warning); download of what is attached is re-hashed against the approved fingerprint; links `GET /api/files/share/<token>` are HMAC-signed, expire after 30 days (`ATTACHMENT_LINK_TTL_DAYS`), are personal (a hash of the recipient, no address in the token), are pinned to the approved fingerprint (replaced → 410), trashed/removed → 410, expired → 410, tampered → 404, rate limited, `Content-Disposition: attachment`, `no-store`, `noindex`. **No Drive permission is created or changed**; private files stay private. Missing/trashed/inaccessible files stop approval and sending (422). Gmail: 240 s socket timeout for messages with attachments, and a timeout during an attachment upload is treated as *unresolved* (never auto-resent). `ATTACHMENT_DIRECT_BUDGET_MB` can lower the budget.
Evidence: 8 new tests (`tests/attachment-links.test.ts`); live controlled send on the test sheet: 3 files of 1 MB, budget 2 MB → 2 attached, 1 link, **3/3 `smtp_accepted`** (`BCAST-1793126076963-2883`, only the three already-approved addresses; allowlist active). The receiving inbox was not inspected by me. Live link check against the running app: anonymous GET → 200, attachment, md5 matches the Drive file; Drive permissions on the file = owner only; tampered 404; expired 410; modified-file token 410.
Limits: the 10 MB per-file upload cap remains (the serverless request-body limit is lower than that on some hosts, so very large files need a separate upload path); links are bearer links; to revoke all outstanding links rotate `PORTAL_SIGNING_SECRET`/the derived signing secret, or change/trash the file; "expired or revoked permissions" do not apply because no Drive permission is used. The earlier failed broadcast `BCAST-1793125228309-3463` (3 × failed, timeout) is kept as evidence; its recipients later received the new test message.

### 15.3 T3 realtime (no defect found)
Setup: tab A and tab B authenticated as the same admin in one browser profile. B subscribed to `/api/realtime/stream`; A submitted a synthetic donation through the public API (`DA036`, ₹111, `_IntegrationTest` name, contact on the blocked `.invalid` domain so no mail), then verified and then rejected it.
Observed: B received `DONATION_CREATED`, `DONOR_UPDATED`, `NOTIFICATION_CREATED` once each (ids 135–137); B's own `GET /api/admin/donations` showed the canonical row (`pending`, ₹111). With B disconnected during A's verification, B reconnected with `lastEventId=137` and received exactly the missed `DONATION_UPDATED` (id 138) plus `CONNECTED{replayed:true}`: no loss, no duplicate. With B connected, the next change (`rejected`, id 139) arrived within the same millisecond as A's PATCH response (~1.6 s PATCH duration) and B read `rejected` from Sheets. Anonymous and garbage-bearer stream requests → 401. Stale/misleading messages: none seen. Latency note: the first create events arrived about 11 s after the request began because the create call itself (Drive upload + Sheets writes) took that long; there is no defined service level and none is claimed. Limitation: single browser profile / single admin identity; no real second device, no logout or token expiry during an open stream (a long-lived EventSource keeps its connection until it closes, up to the 280 s server lifetime, so authorisation is re-checked at reconnect).

### 15.4 T4 wording and data-display audit
| Finding | Class | Action |
|---|---|---|
| "Generate with Khizr" button/modal/error (route is a fixed template, not AI) | real defect (project rule) | relabelled "Insert template draft", honest warning; unused AI-assist handler removed |
| Donor statement download claimed "90/10 Amanah model" and "verified on the public blockchain/ledger logs" | real defect (fabricated claim) | replaced with the recorded donations and their statuses and "not a tax receipt" |
| Settings: hard-coded administrators (`admin@daarayn.org`, `editor@daarayn.org`), editable roles stored only in the browser, "Firestore Database asia-south1 (Mumbai)", Storage Bucket | real defect | removed; shows how admin access really works; data sources named correctly (Sheets/Drive); SEO save message now says it is browser-only |
| Footer link "Volunteer" and role "Volunteer Manager" | real defect (project rule) | "Field Agents"; role list removed |
| New-donor placeholder "Mumbai" | presentation | changed to "City" |
| Footer phone `+91 98765 43210` | placeholder contact | **owner decision**: supply the real number (not invented) |
| `sheikh-arham-sponsorship` in a cause-icon map; FAQ "delivered directly to Asnaf"; beneficiaries page stored in the browser | intentional copy / known gap | left; beneficiaries remains NOT APPLICABLE as a Sheets feature |
| Dashboard/Donations/Donors/CRM error states | previously fixed (F8–F12) | re-verified by tests; `tests/ui-wording-guard.test.ts` added so the forbidden wording cannot return |
No "Delivered" label for e-mail remains in the admin app.

### 15.5 T5 credentials and Drive OAuth (review only; nothing changed or revoked)
Service-account keys present on this machine (private keys not printed; suffix = last 6 of the key id):
| File / source | Identity | Key suffix | Evidence | Recommendation |
|---|---|---|---|---|
| `daaraynorg-9165c-cbf1e19606e8.json` (via `GOOGLE_APPLICATION_CREDENTIALS`) | `daarayn@…iam` | …3a21bb | **active**: referenced by `.env.local`, preferred by `lib/google/client.ts`, created 2026-10-24 | keep |
| `daaraynorg-9165c-c14dff5b2d5c.json` | `daarayn@…iam` | …2083b0 | not referenced by `.env.local` or app code; created 2026-07-23 | candidate for revocation after owner verifies the active key works (Sheets + Drive), then delete in Cloud Console → IAM → Service accounts → Keys |
| `serviceAccountKey.json` | `firebase-adminsdk-fbsvc@…` | …21de66 | referenced only by legacy `scripts/export-firestore-data.js`; app sign-in verification needs no key (`lib/server/auth.ts`) | candidate for revocation after confirming the legacy export script is no longer needed |
| inline `GOOGLE_PRIVATE_KEY` in `.env.local` | `daarayn@…iam` | unknown | its hash matches none of the three files (could be formatting); used only if the file path is unset | owner: list keys in Cloud Console, identify by "valid after" date, remove the inline copy once the file key is confirmed |
Do not delete anything until the owner has verified Sheets and Drive work with the active key alone.
Drive OAuth: consent token file `.secrets/google-drive-oauth.json` holds a refresh token; scope requested is the full `https://www.googleapis.com/auth/drive` (a **restricted** scope), client `…apps.googleusercontent.com` (id prefix 269969…). Facts I could verify from the repo: scope list, refresh flow (`lib/google/driveOAuth.ts`). Facts I could **not** verify (no Cloud Console access): the consent screen's publishing status, test users list, verification state. Owner steps: (1) Cloud Console → APIs & Services → OAuth consent screen: read "Publishing status". If "Testing", refresh tokens expire after 7 days (the repo notes ≈ 2026-11-02). (2) Decide the scope: the app only needs files it created plus the one configured root folder, so `drive.file` (non-sensitive) is preferable to full `drive` (restricted: unverified external apps show a warning and Google may require verification/security assessment for production). Changing scope requires re-consent and code/config change that I did **not** make. (3) After the owner chooses, re-authorise from Admin → Settings → Google Drive, then I re-run the Drive live suite. Publishing alone is not sufficient: with a restricted scope and an unverified app, the status "In production" still shows the unverified-app screen and tokens are issued, but verification may be required for long-term external use.

### 15.6 T6 GitHub exposure
Repository `Arklintech/Daarayn-NGO` (origin; remote-tracking refs: `origin/main` only). 370 commits scanned for private-key blocks, OAuth client secrets (`GOCSPX-`), refresh tokens, service-account key ids, GitHub tokens, and `SMTP_PASS=` values (values redacted in all output).
- Working tree (ignored, local only): `.env`, `.env.local`, `.secrets/`, two service-account JSON files, `serviceAccountKey.json`, OAuth client secret JSON — all matched by `.gitignore` (`.env*`, `.secrets/`, `daaraynorg-*.json`, `serviceAccountKey.json`, `client_secret_*.json`) and **not tracked**.
- Tracked at HEAD: only `.env.example` and docs that name credentials (no values).
- History: **no** private keys, `GOCSPX-` secrets, refresh tokens or GitHub tokens. **One SMTP app password** (`SMTP_PASS=` in `SMTP_EMAIL_DIAGNOSIS.md`) appears in commit `c8a3f9d` (2026-10-15), which exists only on the **local** branch `fix/realtime-donations-khizr-removal` and on no remote-tracking ref, so by the local evidence it has not been pushed; it starts differently from the current (rotated) password. Firebase web API keys (`AIza…`) appear in tracked source/docs: these are public client identifiers by design; restrict them by HTTP referrer in Google Cloud.
- Possibly exposed externally: nothing proven. The local remote-tracking refs may be stale; the owner should check GitHub (branches list) before assuming the old password never left this machine.
Safe sequence (owner-controlled, none performed): 1) confirm the old SMTP app password is revoked in the Google account (it was replaced on 2026-10-26); 2) make the repository private (Settings → General → Danger Zone); 3) do **not** push `fix/realtime-donations-khizr-removal` (or delete that local branch after review) — if history rewriting is ever wanted, use `git filter-repo` on a fresh clone, never on this working tree; 4) review Firebase key restrictions; 5) rotate again any credential found exposed. Making the repo private does not un-expose anything already copied.
Note on this session's own output: while taking a redacted inventory I printed the first 6 characters of the current SMTP app password into the tool log by mistake; that is not enough to use it, but if transcripts are shared, rotate it again.

### 15.7 T7 production backup and migration readiness (read-only)
Production worksheet vs test worksheet (names, headers, row counts only):
- Production has 15 tabs, test 14. Tabs the new code creates **lazily on first use** (additive): `Allocations`, `Communication_Recipients`, `Donation_Causes`, `Portal_Auth_Events`. Test-only marker tab `_IntegrationTest` must **not** be created in production. Production-only tabs: `Beneficiaries` (0 rows), `Campaigns` (2), `Field_Agents` (2), `Field_Messages` (4), `Programs` (5), `_System` (1) — unaffected.
- Columns the new code appends to existing production tabs: Causes `kind`; Communications `communicationType, causeIds, unresolvedCount`; Donations `confirmationEmailSent, confirmationEmailSentAt, confirmationEmailError, confirmationEmailRetryCount, causeSelection, opStatus, opPending`; Donors `emailSuppressed`; Field_Reports `adminNotes, assignedAdminId`. All additive; no column is renamed or removed; production has no columns the test sheet lacks.
- Existing production data: Donations 23, Donors 15, Causes 5, Communications 12, Notifications 35, Audit_Log 71, Realtime_Events 18, Field_Reports 4. Legacy rows have no `causeSelection`/`opStatus`; `tests/legacy-schema-additive.test.ts` seeds a production-shaped Donations tab and proves legacy rows are read unchanged and counted, a new write preserves every legacy cell and column position, and a missing tab is created without touching others.
- Destructive operations in code: `values.clear` for a single named row/range in `lib/google/sheets.ts` (row-level delete); no sheet deletion, no bulk clear. No migration script runs automatically; `scripts/migrate-firestore-to-sheets.ts` / `execute_live_setup_and_migration.ts` are legacy Firestore imports and must **not** be run.
- Backup / rollback (owner-authorised steps): before deploying, in Google Drive "Make a copy" of the production spreadsheet (record date, name, id) and export `Donations`, `Donors`, `Communication*` tabs as CSV; keep the Drive evidence folder untouched. Rollback = redeploy the previous build (the new columns/tabs are ignored by old code) and, only if data was corrupted, restore the copied spreadsheet by pointing `GOOGLE_SHEET_ID` to the copy.
- Post-deploy reconciliation: dashboard verified/pending totals vs a manual sum of the Donations tab; donor count vs Donors; integrity report empty of new exceptions; one controlled test donation with a `_IntegrationTest` marker removed afterwards by the owner (or flagged).
- Dependencies to validate before release: production env vars (`PORTAL_SIGNING_SECRET`, `COMMUNICATION_APPROVAL_SECRET`, SMTP, Drive OAuth, `NEXT_PUBLIC_SITE_URL`/site URL for link generation), `EMAIL_RECIPIENT_ALLOWLIST` **unset** in production, Drive OAuth scope decision, sheet quota headroom.
**NOT RUN:** a rehearsal on a full copy of the production spreadsheet (requires the owner to create the copy; I will not create or write to production resources).

### 15.8 T8 final regression (after the last code change)
Run after the last code change (clean `.next`, dev server stopped):
| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `npx eslint .` | **PASS** — 0 errors, 214 warnings (213 pre-existing + 1 new style warning) |
| Offline Vitest | **PASS** — 21 files, **201/201** (was 167; +34: portal guard 18, attachment links 8, legacy schema 3, wording guard 5) |
| Live Vitest (real Sheets, Drive; isolated test spreadsheet and Drive folder) | **PASS** — 3 files, **21/21**. The 3 SMTP-send tests were deliberately excluded to avoid duplicate e-mail; SMTP login verified separately (PASS) and the live attachment send above is the SMTP evidence |
| `next build` | **PASS** |
| Browser end-to-end | PASS WITH LIMITATION — manual browser/API workflows of §15.1–§15.3 run against the isolated server (no automated browser E2E suite exists) |
| Authentication/authorization | PASS — anonymous stream/share/dashboard probes (401/404/410), admin-only upload/approve/send covered by route tests |

### 15.9 T9 fourth address (replaces the "resolved" wording of §13)
The reconciled send records contain **three** distinct recipients (`<SMTP-account mailbox>` 13, `<owner mailbox A>` 2, `<owner mailbox B>` 1 `smtp_accepted` rows in §13; the D4 attachment test added one accepted row for each, i.e. 14 / 3 / 2, plus three recorded `failed` rows from the timed-out first attempt). A **fourth** approved address was supplied in the directive as `<4th address, spelling as typed in the directive (…khn845)>`; earlier project test files use `<4th address, suspected spelling (…khan845)>` (and `…4535`, `…57` variants), which is the **suspected** intended spelling. It has **not been tested**: no message was sent to either spelling and none will be without the owner stating the exact address. Do not claim that all four addresses were individually tested.

## 16. Defects found in this round
| # | Defect | Root cause | Fix | Test |
|---|---|---|---|---|
| D4-1 | Portal limits ineffective across instances | per-instance Map | shared Sheets ledger (T1) | donor-portal-guard |
| D4-2 | Code reusable on another instance; guesses multiplied by instance count | per-instance state | consume-claim + attempt counting in ledger | donor-portal-guard |
| D4-3 | Donors received links that need an admin sign-in | email listed `/api/media/…` | per-recipient secure links / "attached" labels | attachment-links |
| D4-4 | Approval did not cover file content | only URL hashed | fingerprint in the approval hash + re-hash at read | attachment-links |
| D4-5 | 10 MB attachment messages always timed out | 20 s SMTP socket idle timeout | 240 s for attachment mail; timeout = unresolved, not auto-resent | email-allowlist, communications (existing) + live diagnosis |
| D4-6 | Fabricated claims/branding in settings, donor statement, communications, footer | legacy copy | rewritten (T4) | ui-wording-guard |

## 17. Files changed in this round
New: `lib/donors/portalGuard.ts`, `lib/communications/attachments.ts`, `app/api/files/share/[token]/route.ts`, `tests/donor-portal-guard.test.ts`, `tests/attachment-links.test.ts`, `tests/legacy-schema-additive.test.ts`, `tests/ui-wording-guard.test.ts`.
Modified: `lib/donors/portalAuth.ts`, `app/api/donor/{lookup,verify}/route.ts`, `lib/communications/approval.ts`, `app/api/admin/communications/{approve,send}/route.ts`, `lib/broadcast-worker.ts`, `lib/google/drive.ts` (`getFileInfo`), `lib/email/providers/gmail.ts`, `app/admin/{communications,settings,donors}/page.tsx`, `app/donor/dashboard/page.tsx`, `components/Footer.tsx`, `tests/{donor-portal-auth}.test.ts`, `tests/setup.ts`, `tests/helpers/mocks.ts`.
Docs: this addendum, `PROJECT_FEATURE_AND_ACCEPTANCE_MATRIX.md`. Local-only (untracked): launcher scripts in the session scratchpad.

## 18. Owner decisions and actions (smallest set before release approval)
1. **Drive OAuth:** read the consent-screen status; decide scope `drive` vs `drive.file`; re-authorise (before ≈ 2026-11-02 if still in Testing).
2. **Service-account keys:** after confirming the active key (…3a21bb) works alone, revoke …2083b0 and (if the legacy export script is retired) …21de66; identify/remove the inline `GOOGLE_PRIVATE_KEY`.
3. **GitHub:** confirm the old SMTP password is revoked; make the repository private; keep local branch `fix/realtime-donations-khizr-removal` unpushed.
4. **Production backup:** make a dated copy of the production spreadsheet and approve a rehearsal on that copy.
5. **Portal:** approve the per-donor limits (3/hour, 10/day, global 300/day) or change them; decide phone-only donor handling.
6. **Contact details:** supply the real footer phone number.
7. **Inbox:** confirm the three D4 test messages (Documents section shows 2 attached files and 1 secure link).
8. **Fourth address:** state the exact spelling if it must be tested.
9. **Commit/deploy:** review and commit the uncommitted work; authorise deploy only after items 1–4.

## 19. Release recommendation
**NO-GO for public launch. GO for continued controlled (isolated) testing.**
Reasons: (a) Drive OAuth status/scope unconfirmed, with a token-expiry risk within days; (b) old service-account keys unrevoked and repository still public; (c) no rehearsal on a copy of production and no verified production backup; (d) multi-device realtime and the live portal sign-in with a delivered code were not independently exercised; (e) work is uncommitted and undeployed; (f) phone-only donors and very large single files unsupported. Green builds and tests do not by themselves make the application production-ready.
