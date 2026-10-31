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

---

# ADDENDUM D5 — Programs, Campaigns and Cause Management integration (2026-10-28)

Isolated test sheet and Drive folder only (launcher-forced); no e-mail campaign was sent; nothing committed, pushed, deployed or written to production.

## 20. Baseline (before changes)
- **Data model:** Programs, Campaigns and Causes are not three tabs: they are rows of the `Causes` tab told apart by `kind` (`project` / `campaign` / `cause`) with one lifecycle (`Draft, Active, Urgent, Completed, Inactive`; selectable = Active/Urgent). `programRepository` / `campaignRepository` exist but nothing uses them. Documented in `docs/OPERATIONS_DATA_MODEL.md`.
- **Worked:** `POST /api/causes` validation (`lib/catalog/causes.ts`), permanent ids, audit, the selectable-status rule, the donation form and ribbon reading `/api/causes`, server refusal of donations to non-open causes.
- **Disconnected / broken:** (1) the Programs screen saved through `/api/causes` without `kind` (programs were plain causes), ignored the HTTP result (silent failure), "deleted" only in local state, uploaded images to a non-existent `/api/media` POST, and listed every cause as a program; (2) the Campaigns screen listed every cause, with no status/publish control; (3) Cause Management Center created every cause as Active immediately, ignored errors, had no edit/status control, and its cards read a field that no longer exists (`goalAmount`, shown as ₹0); (4) the public website had **no** Programs/Campaigns/Causes pages or detail routes (the homepage Programs section is static legacy HTML), so published content could appear only in the donation form; (5) the checkout heading printed the raw cause id.

## 21. Root causes and fixes
| # | Defect | Fix |
|---|---|---|
| D5-1 | Screens did not distinguish kinds, no draft/publish workflow, false success | New `components/admin/CatalogManager.tsx` used by Programs, Campaigns and Cause Management Center: list read from the server (never local/stale), create as draft or publish, edit, publish/unpublish, explicit status wording (Draft / Published / Urgent / Completed / Unpublished), server errors shown ("Not saved … nothing was published"), double-click guard, stable permanent id per form, no delete (history kept) |
| D5-2 | No public pages | `/programs`, `/campaigns`, `/causes`, detail `/causes/[id]` (404 unless open), homepage "Open for contributions" block, nav links; honest "temporarily unavailable" state, no fallback content; Donate links carry the permanent id; checkout heading shows the title |
| D5-3 | Reading Google Sheets inside a server component crashed the response (`ArrayBuffer is not detachable`) | Root cause isolated with a one-page experiment (static shell fine; Sheets read in the page crashes; reading through the API works). Pages now read the public catalog through `/api/causes` with Next's data cache (`lib/catalog/publicClient.ts`, 30 s, tag `public-catalog`) |
| D5-4 | No propagation mechanism | Admin save triggers `revalidateTag('public-catalog')`, `revalidatePath` and in-process cache invalidation (`lib/catalog/public.ts`, 10 s TTL, shared by API and pages); the response states `publication {persisted, publicVisible, publicPagesRefreshed}`; if the refresh fails the screen says "saved, public pages may lag up to a minute" |
| D5-5 | Concurrent double-submit could race | saves serialised per instance (`saveCause`), same id means update; different id with same title gives 409 |
| D5-6 | Broken image upload | `POST /api/admin/catalog/upload` (PNG/JPEG/WebP up to 5 MB, Drive "Catalog Images"; served publicly only once an entry references it) |

## 22. Browser evidence (real admin screens plus anonymous requests, isolated test sheet)
| Test | Result | Records / routes |
|---|---|---|
| A Program: save draft | PASS — draft absent from `/api/causes`, `/programs`, home; `/causes/<id>` returns 404 | `PROGRAM-MVR3CYGU-BZVK`, Causes tab, `kind=project` |
| A publish | PASS — listed on `/programs` and home, detail 200 with text and `/pay?cause=<id>` link; donation form lists and preselects it | `/programs`, `/causes/PROGRAM-MVR3CYGU-BZVK`, `/pay?cause=…` |
| A edit | PASS — title and description updated publicly at once, still one row | |
| A donation | PASS — `DA046` stored with `causeId=PROGRAM-MVR3CYGU-BZVK` (no other cause) | Donations tab |
| A unpublish | PASS — gone from public list, home and API; detail 404; admin shows Inactive; `DA046` still references the id; a new donation is refused ("not open for donations") | |
| B Campaign | PASS — empty form and missing target refused with clear messages; triple-click Publish gives one row; listed on `/campaigns` (not on `/programs`); Urgent shown; Completed removed publicly, admin keeps the record | `CAMPAIGN-MVR3RZ5Q-ASJN` (left as Draft) |
| C Cause | PASS — Draft not public and a donation is refused; Publish makes it appear in the public list, detail and form; `DA047` stored with the cause id; rename and Urgent visible; Completed gives 404 publicly, `DA047` keeps its id, new donation refused | `CAUSE-MVR3VVL4-UPOW` (left Completed) |
| D Errors | PASS (unit tests `tests/catalog-publishing.test.ts`, 16) — invalid forms, duplicate id/title, unauthenticated mutation (401), Sheets write failure (500, no row), unreadable catalog (503, no fallback), revalidation failure (saved and flagged) | |
| Financial Operations screens | PASS — Designations, Allocations, Reconciliation were removed by mistake (the owner had asked about their purpose, not removal); restored from git and verified loading with data | |

Limitations: browsers may cache the public list for up to about a minute (`s-maxage=10, stale-while-revalidate=60`); other server instances serve a change when their 10 s copy expires; cross-instance duplicate creation relies on the title/id check, not a lock; `sitemap.ts` does not yet list the new public pages; cover-image upload is implemented but was not exercised end to end in the browser; Sheets reads inside server components are not supported by this Next/Node combination (use the API route).

## 23. Regression (after the last change)
tsc 0 errors; ESLint 0 errors (201 warnings); offline Vitest 23 files, **220/220** (was 202; +16 catalog tests, +2 elsewhere); live Vitest **21/21** (SMTP send test excluded); `next build` succeeds with routes `/programs`, `/campaigns`, `/causes`, `/causes/[id]`.
Recommendation for these three modules: ready for continued controlled use, not yet for production until the owner reviews the public design and the release gates in §18–§19 are closed.

---

# ADDENDUM D6 — Unified Programs module, public carousel and detail templates (2026-10-28)

Isolated test sheet and Drive folder only; no e-mail campaign was sent (Communications was exercised with the review/approve step, which sends nothing); nothing committed, pushed, deployed or written to production. **Limitation of this work:** the video and screenshots named in the brief were not available to me (only text arrived), so the layouts follow the site's own existing legacy sections (`LegacySections.tsx`, `public/style.css`: Family Relief, Qur'an Endowment, Masjid Fund) and the structure you described. Pixel-level comparison with the video is **NOT RUN** and needs the owner's review.

## 24. Design
- **One module, one id.** A program is a `Causes` row (`kind = project`; permanent id = donation cause id; status, target, image) plus one `Program_Content` row with the same id (template, card, lead, caption/alt, ordered content sections). Campaigns (`kind = campaign`) and causes (`kind = cause`) are managed in the same screen and can carry the same content. Status lives only on the cause row. No second catalog, no deletion; nothing removed from the API layer.
- **Admin (Programs, the only entry under "Programs & Causes"):** list with type tabs (All / Programs / Campaigns / Causes) and explicit status wording; create (draft or publish), edit, publish/unpublish, workspace link (`/admin/causes/<id>`: donations, reports, analytics), view public page; editor with record fields, cover image upload with alt text and caption, template (relief, endowment, project, custom), card summary / supporting lines / button text / order, lead, donate button text, repeatable content sections (text, checklist, highlighted panel, needs with amounts, milestones recorded by Daarayn) with move/remove, and a live **Preview** that renders the same detail component the public site uses. `/admin/campaigns` and `/admin/causes` redirect to Programs; notifications, the cause workspace back-link and the field-report "convert" action point to Programs.
- **Public:** `/programs` carousel (three cards desktop, two tablet, one mobile; arrows move one card; scroll-snap touch; keyboard Arrow/Home/End on the track and Tab through cards; position text "1–3 of 6"; arrows disabled at the ends; no autoplay; reduced-motion respected; no page-level horizontal overflow), `/programs/[id]` detail for any open entry (four templates), `/campaigns` and `/causes` lists, `/causes/[id]` redirecting to `/programs/[id]`, homepage "Open for contributions" block. Design uses the existing tokens/classes (`glass-panel`, `program-card`, `impact-box`, `btn-ivory`, `section-alt`).
- **Truthfulness:** funding progress = verified donations designated to the cause; milestones are labelled as recorded by Daarayn; no testimonials block (the system has no testimonial store); no recurring-payment claim (the endowment page states contributions are one-time); no application CTA (no application workflow).
- **Failure model:** content is validated first and written first; the cause row (which controls visibility) second. A failure of the second step answers 500 `partial: true` (not reported as success; nothing public changed); saving again completes it. Revalidation failure after a successful save is reported as "saved, public pages may lag"; admin save also invalidates the data cache tag and paths.

## 25. Defects found and fixed in this round
| # | Defect | Root cause | Fix / test |
|---|---|---|---|
| D6-1 | Concurrent saves of one id created 3 rows | my earlier read-sharing in `BaseRepository.getAll` also shared **forced** refreshes, returning a snapshot older than the caller's write | forced refresh always reads fresh; `invalidateCache()` drops the shared read; saves serialised per instance; test "triple submission" |
| D6-2 | A signed-in administrator saw Draft/Completed/Inactive entries in the public donation form and ribbon | `/api/causes` returned the admin view whenever an admin cookie was present | public consumers call `?scope=public`; test "public view" |
| D6-3 | Client bundle would have pulled server code | schema shared with the editor imported repositories | pure `programContentSchema.ts` / `errors.ts` split |
| D6-4 | Mobile arrows stacked above and below the card | CSS order | controls row below the card |

## 26. Browser evidence (real admin screens, anonymous public requests, isolated test sheet)
| Check | Result | Records / routes |
|---|---|---|
| Sidebar | PASS — Programs only under "Programs & Causes"; Financial Operations, Donors, Communications unchanged | |
| Create program in the UI with 2 sections, preview, publish | PASS — preview shows two-column relief template, 3 checklist items, panel; saved and published | `PROGRAM-MVR51YPZ-D1KF`, Causes + Program_Content |
| Five more programs (3 templates + 2 custom/relief) via the same API | PASS | `PROGRAM-D5-QURAN` (endowment), `-MASJID` (project), `-X4`, `-X5`, `-X6` |
| Carousel, 6 programs | PASS — desktop 3 visible, "1–3 of 6" → "4–6 of 6", prev/next disable at ends, Home/ArrowRight work, equal card height, no overflow; tablet (820) 2 visible; mobile (375) 1 visible, controls row, position "6–6 of 6" | `/programs` |
| Detail templates | PASS — relief two-column with checklist/panel/CTA/donate link; endowment milestones and one-time note; project needs cards with amounts, no Apply button; unknown id 404; `/causes/<id>` redirects | `/programs/<id>` |
| Edit with real image upload | PASS — image stored in Drive, served publicly once referenced, caption on detail; card and detail show the edit at once | |
| Quick Donation Ribbon and donation form | PASS — published programs listed (also as signed-in admin, after D6-2); `/pay?cause=<id>` shows the title | |
| Donation | PASS — `DA054` ₹500 stored with `causeId = PROGRAM-MVR51YPZ-D1KF`; after verification program progress = ₹500 (supporters 1, verified designations only) | Donations tab |
| CRM | PASS — donor `DNR-MVR55ORZ-7GWF` lists the program under supported causes | |
| Communications | PASS — review for the program cause returns exactly that donor (1); a program nobody supported returns 0 with "never widened"; nothing sent | |
| Reconciliation | PASS — endpoint healthy | |
| Unpublish | PASS — gone from carousel, detail 404, ribbon catalog excludes it, new donation refused ("not open for donations"), `DA054`, content and funding kept | |
| Double-click Publish ×3 | PASS — one row | |
| Old URLs | PASS — `/admin/campaigns` and `/admin/causes` land on Programs; workspace route works | |

## 27. Regression (after the last change)
tsc 0 errors; ESLint 0 errors (198 warnings); offline Vitest 24 files, **237/237** (new: `tests/programs-module.test.ts`, 17); live Vitest **21/21** (SMTP send test excluded, no e-mail sent); `next build` succeeds with `/programs`, `/programs/[id]`, `/api/programs`, `/campaigns`, `/causes`, `/causes/[id]`.
Recommendation: the Programs module is **ready for continued controlled use**; not production-ready until the owner reviews the public design against the video, creates the real programs, and the release gates in §18–§19 are closed.

## 28. Remaining limitations
Pixel comparison against the supplied video/screenshots NOT RUN (not available); the three reference programs exist only as synthetic test-sheet records (the owner creates the real ones through Programs); homepage static legacy Programs/Family/Qur'an/Masjid sections are unchanged (retired by the owner when real programs are published); per-need funding progress is not tracked (only overall verified progress); testimonials, recurring payments and applications are not implemented because no supporting workflow exists; cross-instance duplicate creation still relies on the id/title check; browsers may cache public lists up to about a minute; sitemap does not list the new pages.

---

# ADDENDUM D7 — Homepage integration, three configured programs, sitemap and multi-image galleries (2026-10-28)

Isolated test sheet and Drive folder only; no e-mail sent; nothing committed, pushed, deployed or written to production. The reference video and screenshots were **not available** to me (text only), so no pixel comparison was possible: see §33.

## 29. Homepage is now driven by the Programs module
- **Before:** the homepage "Programs" grid, the Family Relief, Qur'an Endowment and Masjid Fund sections (with copy, "Example Student: Arham", ₹ amounts and two "verified profile" modals) were hardcoded HTML in `LegacySections.tsx`.
- **Now:** `components/programs/HomePrograms.tsx` (server component, reads the published programs through the same Sheets-backed service and data cache) renders the "Programs" carousel (`#programs`, so "Explore Programs" still works) and one presentation section per published program in the admin's order, using the same templates as the detail pages (`#program-<id>`, alternating section backgrounds). The static program sections and the modals that belonged to them were removed; testimonials, donate, about and other sections are unchanged. Navbar anchors `#family/#quran/#masjid` removed (they no longer exist); Programs and Campaigns links remain.
- **Verified:** after editing/publishing in the admin, the carousel card, the homepage section and the detail page change without a deployment (server data tag + path revalidation).

## 30. The three established programs (configured through the real admin screens, test sheet)
Existing Causes rows were inspected first: no original Family Relief/Qur'an/Masjid cause existed in the test sheet; the nearest records were the earlier synthetic D5 programs, so their **permanent ids were reused** (no duplicates) and re-titled/re-contented with the existing site copy:
| Program | Permanent id | Template | Content source | Image |
|---|---|---|---|---|
| Family Relief Program | `PROGRAM-MVR51YPZ-D1KF` | relief | existing homepage copy (card lines, lead, checklist, "What you receive") | `public/images/family_relief.png`, existing caption/alt, uploaded via the gallery UI |
| Qur'an Memorization Endowment | `PROGRAM-D5-QURAN` | endowment | existing card copy and verification checklist; **no** example student, juz progress or monthly payment claim | `public/images/student_profile.png`, caption "Example student profile." |
| Masjid Infrastructure Fund | `PROGRAM-D5-MASJID` | project | existing card copy, example needs (Fans ₹3,000, Carpet ₹5,000) and the 7-day update policy; **no** per-need percentage | none (no existing asset) |
Other synthetic programs were unpublished (records kept). Donation fixture `DA054` (₹500, verified) remains attributed to Family Relief.

## 31. Sitemap
`app/sitemap.ts` is now built per request from the published programs: static URLs plus `/programs/<permanent id>` for every open entry, no duplicates, Draft/Completed/Inactive excluded; if the catalog cannot be read only static URLs are listed. Admin saves and gallery changes revalidate `/sitemap.xml`. Verified live (published programs listed) and in tests (publish/unpublish changes the list).

## 32. Multi-image gallery
- **Data:** new `Program_Images` tab (id, programId, fileId, caption, alt, sortOrder, isCover, mimeType, createdAt, removedAt); binaries only in Google Drive ("Program Images" folder); removal is soft (record kept) and the Drive file is deleted afterwards; no hardcoded image list; the legacy single `imageUrl` remains as a fallback only.
- **Admin ("Images & Gallery" inside the Programs editor):** multi-file upload with local previews before upload, per-image caption and alt text, add images later, card cover selection, reorder, replace, remove (with confirmation), save gallery changes, live preview. A new program saved as draft keeps the editor open so images can be added immediately. Limits: PNG/JPEG/WebP, 5 MB each, 30 per program, validated in the browser and again on the server.
- **Safety:** each file is stored in Drive first, then recorded in Sheets; if the record cannot be written the Drive file is deleted again and that file is reported failed (never shown as added); a partial multi-upload lists which files succeeded and which failed, and only the failed ones are sent again; order/cover updates are validated against the program's own images (foreign or incomplete lists are refused).
- **Access:** gallery files stay private; `/api/media/<id>` serves them publicly only while their program is Active/Urgent (Draft, Completed, Inactive, removed: 401).
- **Public:** the framed media panel is now a gallery (one image at a time, arrows, "n of N", caption and alt text per image, scroll-snap touch swipe, arrow/Home/End keys, no autoplay, reduced-motion aware, no controls for one image, 4:3 crop, no horizontal overflow). Program cards show their selected cover; changing the cover does not change the detail order.
- **Propagation:** every gallery change runs the shared refresh (`refreshPublicCatalog`); if it fails the response reports `publicPagesRefreshed: false` and the screen says the data is saved and public pages may lag.

## 33. Browser evidence (real admin UI + anonymous public requests)
| Check | Result |
|---|---|
| Homepage | PASS — 3 carousel cards from Sheets, three program sections by id, no static Arham/family anchors, no leftover test programs |
| Configure three programs in the editor | PASS — saved and published; titles/orders 10/20/30; relief/endowment/project templates |
| Create synthetic program `PROGRAM-MVR5ZWTI-A0DI`, save as draft (editor stays open), upload 1 image with caption/alt | PASS — detail page shows the image, caption, alt, **no** arrows or position text |
| Add 3 more images (multi-file, with previews) | PASS — 4 rows in order ONE→FOUR; first is cover |
| Public gallery navigation | PASS — "1 of 4" → each click advances one image; caption and alt follow; Home/ArrowRight/End; arrows disable at ends; 4:3 crop; no overflow |
| Change cover to image 3 | PASS — card uses image 3; detail order unchanged |
| Reorder (move image 4 up twice) | PASS — public sequence ONE, FOUR, TWO, THREE; cover unchanged |
| Invalid files (PDF, 6 MB PNG) | PASS — refused in the editor with reasons, nothing sent |
| Replace image 2 | PASS — new file, same id/caption/order |
| Remove image 1 (confirmation) | PASS — 3 remain, cover kept, record soft-removed |
| Images under other programs | PASS — Family, Qur'an, Masjid and gallery programs each return only their own images |
| Failure cases (Drive failure, Sheets write failure, refresh failure, unauthenticated) | PASS in tests (`tests/program-gallery.test.ts`); not provoked live |
| Reload preserves gallery | PASS — data re-read from Sheets (3 images persisted after removal) |
| Screenshots | desktop carousel (3 cards), Family Relief detail (two-column, framed image + caption), Endowment detail, Project detail, homepage and ribbon captured in the browser pane; the pane is small (≈800×500 scaled), so they show structure, not fine detail. Tablet (820 px: 2 cards) and mobile (375 px: 1 card, controls row) verified by layout measurements (earlier round) |

**Not compared / not done:** pixel-level comparison with the supplied video/screenshots (NOT RUN: not available); touch swipe was verified through the native scroll mechanism, not with a physical touch device; Drive deletion of replaced/removed files was verified in tests, not by listing the live Drive folder; per-need funding progress, testimonials, recurring payments and applications remain unimplemented.

## 34. Regression (after the last change)
tsc 0 errors; ESLint 0 errors (198 warnings); offline Vitest 25 files, **251/251** (new: `tests/program-gallery.test.ts`, 14); live Vitest **21/21** (SMTP send test excluded); `next build` succeeds (routes `/programs`, `/programs/[id]`, `/api/programs`, `/api/admin/programs/images`, sitemap).
Recommendation: homepage, three programs, sitemap and gallery are ready for continued controlled use; not production-ready until the owner reviews the design against the video/screenshots, replaces the test programs with real content/assets, and the release gates in §18–§19 are closed.

---

# ADDENDUM D8 — Full architecture + unified Programs end-to-end acceptance (2026-10-28)

## 35. Scope, environment and safety evidence
- **Repository:** branch `feat/daarayn-pre-release-hardening`, HEAD `5332409` (no new commit); 43 tracked paths modified (35 M, 8 D) and 31 untracked, all uncommitted user/session work preserved. Status snapshot kept in the session scratchpad.
- **Effective runtime target (proven by effect, not by `.env`):** the dev server was launched by the isolated launcher (log line "isolated: sheet=TEST(approved), drive=TEST folder, recipients=3 approved addresses"). Row counts read back from both spreadsheets: before the D8 writes TEST `Audit_Log 175 / Causes 37 / Donations 98 / Donors 46`, PROD `71 / 5 / 23 / 15` (+ Realtime 18, Notifications 35); after all D8 writes TEST `207 / 39 / 104 / 50` (+32 audit rows) and **PROD unchanged `71 / 5 / 23 / 15 / 18 / 35`**. Drive objects found under the test root only (`<<TEST ROOT>>`), owner-only permissions.
- **E-mail:** no message was sent. Existing logs reconciled earlier (§13/§15.9: 16 + 3 `smtp_accepted`, 3 `failed` timeouts, 1 allowlist refusal); preview/approve paths used for every purpose; the fourth address remains untested.
- **Synthetic records (all marked `_IntegrationTest`, preserved):** programs `PROGRAM-MVR6KYAZ-24WX` (P8, two gallery images) and `PROGRAM-MVR6MER1-CXNV` (Q8); donors A `DNR-MVR6NCMT-8WRJ`, B `DNR-MVR6ODMY-WNZ4`, C `DNR-MVRP3WJP-8NP7`; donations `DA067`–`DA072`.

## 36. System-wide acceptance matrix (Diagram A)
| Module | Evidence | Status |
|---|---|---|
| Authentication / authorization | 33 admin API route files × (anonymous, signed-in field agent) = 66 route tests: every handler refuses before touching Sheets (401/403/410); OAuth callback authorised by signed state only (tested); live: admin token expired after ≈1 h → `401 Authentication required`, page reload renewed it → 200 | PASS (Firebase credential entry NOT RUN: existing session used) |
| Google Sheets (canonical) | live suite 13 Sheets cases + 21 live total; every D8 record read back from the test sheet by an independent script; wrong id / permission / 429 / missing tab covered by live+offline tests; unreadable catalog → 503, no fallback content | PASS |
| Google Drive | live suite 7/7; D8 gallery images (`Program Images/`) and payment proofs (`Payment Proofs/`) found under the test root, owner-only; draft image `401` publicly, open program image `200`, removed/unpublished `401`; Drive failure and metadata failure paths tested | PASS |
| Dashboard | independent calculation from raw Sheets rows matches the API exactly: verified 66 / ₹16,181, pending 35 / ₹3,370, rejected 1 / ₹111, average ₹245, donors 49 (40 with a verified donation), active allocations 9 / ₹1,090; invariant unrestricted ₹3,450 + unresolved ₹0 + Σ designated ₹12,731 = ₹16,181; pending ₹2,047 + ₹1,323 + ₹0 = ₹3,370; per-program P8 designated ₹750 / pending ₹250 / contributors 2 / allocated ₹400, Q8 ₹550 / 0 / 2 / ₹200. Source failure → 503 and "—" (live, F12) | PASS |
| Donations | public form UI submitted `DA067`–`DA070`; stored with stable donor tokens (A: one token for `DA067` and `DA068`), unique ids, correct cause ids; validation (unknown cause, negative, zero, text, missing contact, bad contact, missing proof, malformed causes) all 400; replay of one submission key ×3 → one row | PASS (after D8-2) |
| Donor CRM | A: verified 1 / ₹400, pending ₹250, supports P8; B supports Q8; C supports P8 and Q8; no duplicate donors; profile page 200; communication history empty (nothing sent) | PASS |
| Financial Operations | pending and unresolved allocations 409; stale verify 409; wrong split total 409, zero/unknown/duplicate part 400; valid split 350/250 and its replay; zero/negative 400; over-allocation and wrong cause 409; replay idempotent; 5 concurrent ₹100 requests on ₹300 headroom → 3 accepted, 2 refused (active = ₹400 = designated); reversal needs a reason (400 without), repeat reversal does not overwrite, record kept; inactive cause cannot receive allocations; after republish a new allocation fits exactly and ₹1 more is refused | PASS |
| Communications | five purposes previewed for P8: contribution_confirmation and project_progress → A, C (not B, not A's pending donation); allocation_confirmation → A only (C excluded "no allocation record"); completion_report → 0 recipients "cause is not marked Completed" (no widening); general_communication → A, C; Q8 allocation → C only; 7 tamper attempts on approval (no token, altered notes/heading, extra recipient, other cause, other type, forged token) all 403; no history created, no mail | PASS WITH LIMITATION (no new live send; inbox arrival owner-confirmed earlier) |
| Reports / reconciliation | Reconciliation page lists all 12 warnings (headline 12 = list 12); dashboard banner now shows 5 + "…and 7 more" with a link (D8-1); invariants above | PASS (after D8-1) |
| Realtime (SSE) | a second session received `CAUSE_UPDATED` (id 288) when P8 was edited; earlier rounds: replay after reconnect, 401 anonymous | PASS (single browser profile) |
| Gmail SMTP | login verified; sends only via existing evidence (see §35) | PASS WITH LIMITATION |

## 37. Programs acceptance matrix (Diagram B)
| Step | Result |
|---|---|
| Programs is the only entry under "Programs & Causes"; old routes redirect; workspace link kept | PASS |
| Create P8 as Draft through the admin UI; editor stays open; upload 2 images | PASS — row in `Causes` (kind project) + `Program_Content` + 2 `Program_Images` |
| Draft invisibility | PASS — not in carousel, homepage, sitemap, public catalog, `/api/programs`; detail 404; image 401; a donation to its Draft cause refused ("not open for donations") |
| Publish (list button) and create/publish Q8 | PASS |
| Public carousel card with cover, detail page with 2-slide gallery, homepage card and section, sitemap entry | PASS |
| Quick Donation Ribbon lists the program, no duplicates, no non-open entries (also as a signed-in admin) | PASS |
| Ribbon → checkout hand-off | FAIL then PASS: the ribbon passed the **title** (`cause=D8 Other Program …`); now passes the permanent id (D8-3) and the checkout shows "Directing contribution to: …" |
| Main donation form loads the same canonical cause; submit through the real form | PASS — `DA067` ₹400 (A, P8), `DA068` ₹250 (A, P8), `DA069` ₹300 (B, Q8), `DA070` ₹600 (C, P8+Q8 unresolved) |
| Edit program (card summary) | PASS — card updated at once, still one cause row and one content row, `created:false`, realtime event |
| Unpublish (negative scenario) | PASS — carousel/home/sitemap/ribbon/detail/image all withdrawn; new donation refused; designated ₹750, pending ₹250, allocated ₹400, donations, allocations, program record and images unchanged; Communications still resolves the historical audience (2) |
| Republish | PASS — same id, gallery back (2 images), allocation capacity honoured |
| Carousel/gallery behaviour (3/2/1 cards, arrows, keyboard, caption/position, cover vs order, replace/remove) | PASS (D6/D7 browser evidence; re-checked on P8) |

## 38. End-to-end trace (one chain)
Program `PROGRAM-MVR6KYAZ-24WX` (cause id identical) → public carousel/home/detail/gallery → ribbon → donation `DA067` (donor token `DNR-MVR6NCMT-8WRJ`, ₹400, status pending → verified by admin) → Donations tab row (`causeId` = program id) → `Donation_Causes` row `DC-DA067-PROGRAM-MVR6KYAZ-24WX` → dashboard P8 designated 750 (= DA067 400 + DA070 350) → CRM profile of A → allocation `ALLOC-MVRP63BW-P59B` and three more (₹400 total) → reconciliation (12 warnings, 0 incomplete) → Communications previews (A, C) and approval binding → reports. Negative branch: unpublish → public paths close, history intact → republish.

## 39. Defects found in this acceptance run
| # | Defect | Root cause | Fix | Retest |
|---|---|---|---|---|
| D8-1 | Dashboard said "12 warnings" (earlier 9) but listed five | list was `slice(0, 5)` with no remainder | headline unchanged, list shows five plus "…and N more" with a link to Reconciliation; `tests/operations-summary.test.ts` | live: "12 warning(s)… and 7 more. See all in Reconciliation" |
| D8-2 | A retry of an already-recorded donation answered 503 when Drive briefly failed (`ECONNRESET`) | the proof upload ran before duplicate detection, so a failed upload aborted a legitimate retry | on upload failure look for a finished donation with the same submission key and return the original result; `tests/donation-duplicate-proof.test.ts` (2 new) | live: same key ×3 → `DA072` once, `duplicate:true` |
| D8-3 | Quick Donation Ribbon handed the checkout the cause **title** | ribbon state keeps the display name | pass the permanent id; source-guard test | live: `cause=PROGRAM-MVR6MER1-CXNV` |
| — | Session expiry observed (not a defect): admin ID token expires ≈ 1 h → 401, renewed by reload | | | |

## 40. Final regression
Run after the last code change (clean `.next`, dev server stopped): `tsc` **0 errors**; ESLint **0 errors** (198 warnings); offline Vitest **27 files, 323/323** (new in this run: `admin-auth-sweep` 66, `operations-summary` 3, 2 donation-replay cases, 1 ribbon guard); live Vitest against the isolated Sheets/Drive **21/21** (SMTP send test excluded: no e-mail); `next build` **succeeds**. Browser end-to-end: the manual/real-UI scenarios of §36–§38 (no automated browser suite exists).

## 41. Remaining blockers and limitations
Firebase sign-in with credentials NOT RUN (an existing signed-in session was used; unauthenticated/forged access is covered); live HTTP 429 and live Sheets/Drive outage were not provoked in this run (offline tests and the earlier live failure simulation cover them); no new e-mail was sent (selection, preview and approval verified; SMTP outcomes rely on the reconciled earlier sends); fourth approved address untested; realtime verified in one browser profile; pixel comparison with the owner's video NOT RUN; owner items in §18 unchanged (credentials, Drive OAuth, GitHub privacy, production backup/rehearsal).
**Release readiness:** the connected system works end to end on the isolated environment and all three defects found here are fixed and re-tested; **NO-GO for public launch** until the owner gates in §18–§19 are closed and the work is reviewed and committed.

---

# ADDENDUM D9 — Live source-failure acceptance across modules (2026-10-28)

Continuation of D8 for the scenarios D8 could not exercise. Method: the separate failure-simulation server (same code, spreadsheet id that does not exist, no Drive, send allowlist to an invalid address) with the same admin session; no production resource touched, no e-mail possible.

## 42. Results (live, failure-simulation server)
| Surface | Observed | Status |
|---|---|---|
| `/api/admin/dashboard` | 503 "No figures are shown rather than showing zeros" | PASS |
| `/api/admin/donations`, `/api/admin/allocations`, `/api/admin/reconciliation`, `/api/admin/programs`, `/api/causes` (admin and `?scope=public`), `/api/programs` | 503 with a specific "could not be read from Google Sheets" message | PASS |
| `/api/donors` | was 500 "Failed to retrieve donor records" → now 503 "Donor records could not be read from Google Sheets" | FIXED (D9-1) |
| `/api/admin/communications` | was 500 with Google's raw text "Requested entity was not found." → now 503 "Communication history could not be read from Google Sheets" | FIXED (D9-1) |
| Communications approve | 503 "Could not read donor records … Nothing was approved" | PASS |
| Admin screens Programs, Donations, Reconciliation, Donors | explicit error banner, "—" figures, no empty-register or "₹0" claims; Programs tab counts now also show "—" (was "(0)") | PASS (D9-2) |
| Sitemap | 200 with only the static URLs; no program URLs invented | PASS |
| Public `/programs`, `/`, `/programs/<id>`, ribbon catalog | **were still showing the last cached programs** because Next serves the last good copy of a cached fetch while the source is down | FIXED (D9-3), see below |

## 43. Defects found and fixed
| # | Defect | Root cause | Fix | Retest |
|---|---|---|---|---|
| D9-1 | Two admin endpoints answered 500 and one leaked a raw Google error | generic catch blocks | 503 with a plain "could not be read" message, no raw text | live (above) |
| D9-2 | Programs tab counts showed "(0)" during a source failure | counts rendered unconditionally | "—" while an error is shown | typecheck; seen live next run |
| D9-3 | Public pages kept presenting stale program/cause content as current for as long as Sheets was down (cached fetch is served while revalidation fails) | the data cache has no upper bound on staleness | API responses carry `X-Generated-At`; public pages refuse data older than `PUBLIC_CATALOG_MAX_STALE_SECONDS` (default 600) and show "temporarily unavailable"; `tests/public-staleness.test.ts` (3) | live: warm cache with healthy server, switch to failure server (limit 20 s) → carousel, homepage block and detail all showed the honest unavailable message and no cards |

## 44. Remaining (unchanged)
Firebase credential sign-in NOT RUN; live HTTP 429 provoked only offline; no new e-mail; fourth address untested; real touch-device swipe not verified (native scroll-snap mechanism only); pixel comparison with the owner video NOT RUN; owner gates §18.

## 45. Regression
After the last change: `tsc` 0 errors; ESLint 0 errors (198 warnings); offline Vitest 28 files, **326/326**; live Vitest **21/21** (SMTP send test excluded); `next build` succeeds.

---

# ADDENDUM D10 — Configuration, integration and resilience hardening (2026-10-28)

Scope: Google Sheets/Drive configuration contract, schema drift detection, readiness diagnostics, error classification, and the secrets/route inventory. Nothing was committed, deployed, rotated or written to production; the live checks below are read-only.

## 46. Configuration inventory (names only)
| Area | Variables | Notes |
|---|---|---|
| Sheets | GOOGLE_SHEET_ID, GOOGLE_TARGET_ENV (new, optional: test/production) | id format now validated |
| Google credentials | GOOGLE_APPLICATION_CREDENTIALS (file, wins) or GOOGLE_CLIENT_EMAIL/GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY | file+inline with different identities is blocking |
| Drive | GOOGLE_DRIVE_ROOT_FOLDER_ID, GOOGLE_OAUTH_CLIENT_SECRET (+ stored refresh token in `_Secrets`) | OAuth consent/scope is a console matter (owner) |
| Auth | NEXT_PUBLIC_FIREBASE_*, FIREBASE_PROJECT_ID, ADMIN_EMAILS | authentication only |
| Email | SMTP_*, RESEND_API_KEY, FROM_EMAIL, REPLY_TO_EMAIL, EMAIL_PROVIDER, EMAIL_RECIPIENT_ALLOWLIST | |
| Signing / limits | PORTAL_SIGNING_SECRET, PORTAL_DAILY_CODE_CAP, COMMUNICATION_APPROVAL_SECRET, ATTACHMENT_LINK_TTL_DAYS, ATTACHMENT_DIRECT_BUDGET_MB | |
| Cache | PUBLIC_CATALOG_MAX_STALE_SECONDS | bounded public staleness |
| Runtime | NODE_ENV, VERCEL, NEXT_PUBLIC_SITE_URL/APP_URL | |

## 47. Implemented
| Item | Result |
|---|---|
| `lib/google/config.ts` `inspectGoogleConfig` (pure, secret-free): missing/malformed spreadsheet id (URL, quotes, spaces), credentials missing, credentials file missing/invalid/non-PEM key, file+inline conflict (identity mismatch = blocking), Drive folder id, undeclared test/production target | PASS (offline, 36-test file `tests/config-hardening.test.ts`) |
| Write/read guard: `SheetsService` refuses a missing/malformed id with a `GoogleConfigError` before any request; never retried | PASS (offline) |
| Legacy `lib/sync/GoogleSheetsClient`: silent `return` on unconfigured writes replaced by an error (it used to let a sync "succeed" without writing); id format checked | PASS (code + typecheck; no dedicated test) |
| Error categories `categorizeGoogleError`: configuration, authentication, permission, not_found, quota, transient, timeout, invalid_request, unknown. Auth/permission/not-found/400 never retried; append not retried after an ambiguous 5xx; attempts bounded with the original error kept | PASS (offline) |
| Schema registry (`lib/google/schemaRegistry.ts`) filled by every repository and the non-repository tabs; pure `compareSchema`: missing tab, empty header row, duplicate header, possible rename (blocking); extra column and header a legacy sheet predates (info) | PASS (offline) |
| `GET /api/admin/diagnostics/google-readiness` (admin only, read-only, no ids/secrets/data): states configuration_invalid, authentication_failed, permission_denied, spreadsheet_not_found, schema_incomplete, quota_limited, temporarily_unavailable, operational; Drive folder checked by metadata read | PASS (offline classification incl. failing→healthy recovery); live library check below |

## 48. Live read-only evidence
- Effective runtime target (`.env.local` as loaded by the app) ends `…cs7D_U`: **this is NOT the isolated test spreadsheet**. All checks here were reads only. GOOGLE_TARGET_ENV is not set, so the target is "undeclared" (warning).
- Readiness against that target: `schema_incomplete`, 13/19 worksheets present, Drive folder reachable. Missing worksheets: Allocations, Donation_Causes, Communication_Recipients, Program_Content, Portal_Auth_Events, `_Secrets` (the code creates a tab on first use). Legacy sheets also lack newer columns on Causes, Donors, Donations, Field_Reports, Communications (informational; appended on first write). **Consequence: the Programs unification and portal guard need the production backup/rehearsal before release (owner action, unchanged).**
- A well-formed but non-existent id → `spreadsheet_not_found`; malformed id → `configuration_invalid` with no request.
- NOT RUN: a live outage→recovery cycle through the readiness endpoint with the dev server (offline failing→healthy recovery is covered; the D9 live failure simulation already proved module recovery).
- NOT RUN / BLOCKED: forcing a live 429, rotating or invalidating credentials (prohibited).

## 49. Secrets and routes
- Client bundle scan of the existing `.next/static` (58 chunks): no server-secret value (6 secret-class variables checked by 40-char prefix) and no private-key marker. Re-scan after the final build: see §50.
- API inventory: 55 routes; 36 admin-only, 7 agent or admin|agent, 6 token/portal; the 6 without an auth marker are the public donate/programs/manifest routes and three 410 stubs (seed-sheets, seed-field-ops, ai-assist). Previously proven by the 66-test auth sweep.
- Old SMTP password: unchanged (only in local commit `c8a3f9d`, not on remote-tracking refs); rotation/revocation remains an owner action.

## 50. Remaining
| Item | Status |
|---|---|
| Set GOOGLE_TARGET_ENV on every deployment (test vs production) | OWNER / NOT DONE |
| Cached data never authorizes donations/allocations/balances | PASS (design: repositories' 30 s in-process read cache is bypassed with forced refresh for writes and eligibility; public cache applies to public pages only) — no new test added in D10 |
| Separate "Masjid Infrastructure" and "General Causes" management experiences | NOT IMPLEMENTED: one Programs module with templates (`project` template carries needs); no distinct Masjid/project/need entities |
| Firebase password sign-in | BLOCKED (owner) |

---

# ADDENDUM D11 — Masjid Infrastructure vs General Causes, and the two-domain trace (2026-10-28)

All writes went to the approved test spreadsheet through the isolated server (test sheet, test Drive folder, approved recipient allowlist). Synthetic records carry `ZZ_D10 … _IntegrationTest`. Nothing committed, deployed, or sent by e-mail (donor e-mail was a non-allowlisted `.invalid` address, so no message could leave).

## 51. Domain model (documented before change)
One permanent id per program in the Causes row (kind project/campaign/cause); presentation lives in Program_Content with the same id. No second catalog. The domain is derived from the page template: `project` = **Masjid Infrastructure**, `relief` / `endowment` / `custom` = **General Causes** (`lib/catalog/programDomains.ts`). A Masjid's needs are content lines on the parent program (name, amount); they are NOT separate financial destinations: donations resolve to the parent's cause id, and a need is never reported as funded by a donation to the parent. Separate per-need financial entities are NOT IMPLEMENTED (would need an owner decision and a schema change).

## 52. Implemented
| Item | Result |
|---|---|
| Admin Programs screen now has two experiences: Masjid Infrastructure and General Causes (tabs, counts, new-entry presets; Masjid form has no type/template picker, General cannot select the project template). No Campaigns/Cause Center navigation restored. | PASS (browser, live) |
| Masjid update tracking: `lastUpdateAt` (server clock only; a client-supplied date is ignored) and `updateNote`, kept across edits; "Record a verified update now" in the admin form; recording an update on a General Cause is rejected | PASS (offline `tests/masjid-domain.test.ts`, 6 tests; live write verified in Sheets) |
| 7-day hold rule computed from the persisted timestamp (exactly 7 days is current, beyond is overdue; none recorded = "not yet shown as verified"). Public detail shows current / on hold / no update. Donations are NOT blocked while on hold (documented decision; owner may want it blocked). | PASS (boundaries offline; public "current" state live; overdue state offline only) |
| Duplicate "Needs" heading on the project template | FIXED (cosmetic) |

## 53. Live trace (test sheet)
| Step | Evidence | Status |
|---|---|---|
| Create Masjid project in admin UI, Draft | Causes row 50 `PROGRAM-MVRXS3EG-B5RD` (kind project), Program_Content row 12; Draft absent from public catalog and carousel | PASS |
| Publish | status Active; appears in public causes and programs after the 10 s cache window; detail page shows needs ₹60,000 / ₹40,000, update note, 0% funded | PASS |
| Public donation via real form (cause carried from the link) | Donation `DA92466`, donor `DNR-MVRXV7X2-EFP6`, ₹500, status **pending**, Donation_Causes row 60 designated 500 | PASS |
| Second donation, same donor, General cause `CAUSE-D10-GENERAL` (created in admin, Draft→Active) | Donation `DA92467`, same donor token, new Donation_Causes row 61, ₹300, pending | PASS |
| Admin Donations + Dashboard APIs | both contain DA92466 and the program id | PASS |
| Communications preview (resolve, no send) for each cause | each audience lists only its own donor, excluded as "payment not yet verified"; nothing sent | PASS |
| Donor totals while pending | Donors row totals 0 (verified-only accounting) | PASS |

## 54. Not done in this pass (honest)
- Verification → designation → allocation → reversal → reconciliation was **not re-run** live for these two donations (covered by the D3–D9 live E2E and offline suites).
- Gallery upload/Drive evidence, ribbon lifecycle, multi-cause split, concurrency, 429, SSE reconnect, donor-portal limits: NOT RE-RUN in D11; last evidence in §15–§45.
- A cross-domain donor-exclusion case with distinct single-domain donors was not run live (this donor is in both domains); covered offline.
- Overdue (>7 days) public state: offline only. Production build and live Sheets/Drive test suites were not re-run after D11 changes (offline: 376 tests pass, tsc clean, eslint 0 errors).
- Finding: every donation note stamps "Allocation split: Direct Aid 90% / Ops 10%" (matches the public hero policy, not an Allocations record); owner should confirm it is intended wording.

## 55. Recommendation
Still NO-GO for public launch: production sheet lacks six worksheets and newer columns (rehearse migration), owner credential actions pending, GOOGLE_TARGET_ENV unset, per-need funding model undecided.


---

# ADDENDUM D12 — Masjid hold, financial chain, configuration gates (2026-10-28)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409` (unchanged), all work uncommitted. No commit, push, deployment, production write, credential action or production migration. See section 62 for the one e-mail that was sent.

## 56. Target discrepancy (cs7D_U): root cause and gate
`.env.local` sets GOOGLE_SHEET_ID to the PRODUCTION spreadsheet (ends cs7D_U) and GOOGLE_TEST_SHEET_ID to the approved test sheet. Any process started without overrides therefore targets production. The earlier read-only readiness test loaded `.env.local` and read production metadata only (no write). The isolated launcher (`daarayn-d3-isolated`) overrides GOOGLE_SHEET_ID with the approved test id and the Drive folder with the test folder, and aborts if the ids are equal or missing. All live writes in D10 to D12 ran through it (rows verified in the test sheet: Donations rows 133/134, Donation_Causes 60/61, Program_Content 12). GOOGLE_TARGET_ENV is still unset (warning). Status: PASS WITH LIMITATION (a process started without the launcher still targets production; the owner should set GOOGLE_TARGET_ENV and use separate env files).

## 57. Hold enforcement and clearance (Masjid Infrastructure)
Rule implemented (recommended policy; no contrary approved requirement found): a Masjid project whose newest verified update (or hold clearance) is MORE than 7 days old is on hold: it stays visible with "Contributions paused" and is closed to new donations until an administrator clears it.

| Check | Result |
|---|---|
| Boundary: exactly 7 days allowed, 1 ms beyond held; General causes and never-updated projects never held | PASS (offline) |
| Enforcement in the donation service (all entry points); direct API request refused with 400; unrelated Masjid project and General cause stay open; pre-hold history kept | PASS (offline) |
| Held project removed from the public catalog used by ribbon/form, kept in the program list | PASS (offline) |
| Fails closed when Program_Content cannot be read | PASS (offline) |
| Clear-hold: admin only (401), reason required (400), only when held (409), server time and actor stored, audit entry CLEAR_PROJECT_HOLD, donations reopen | PASS (offline) |
| Live overdue case on the test sheet | NOT RUN (needs a backdated timestamp; manual row edits are not allowed) |

## 58. Cached data never authorizes a financial decision: defect found and fixed
Defect: donation eligibility read the causes through the 30-second repository cache and only re-read fresh after a rejection, so a cause completed or removed by another server instance still accepted donations for up to 30 s. Root cause: `resolveSelection` in `lib/services/donationService.ts`. Fix: eligibility (causes and holds) is always read fresh; failure to read gives a 5xx and nothing is stored; allocation also reads causes fresh. Regression: `tests/cache-authority.test.ts` (stale-cache completed cause refused, deleted cause refused, unreadable source gives 5xx and nothing stored, unknown id refused, designation lowered elsewhere gives refused over-allocation). Public presentation caching and `PUBLIC_CATALOG_MAX_STALE_SECONDS` are unchanged. PASS (offline). Limitation: the new tests were not run against the old code to prove they fail there.

## 59. Live financial chain on the test sheet (isolated server)
Donations DA92466 (Masjid, 500) and DA92467 (General, 300), same donor token DNR-MVRXV7X2-EFP6.

| Step | Result |
|---|---|
| Allocate against a pending donation | rejected 409 "Only a verified donation can be allocated": PASS |
| Verify (status `completed`) | 200: PASS |
| Zero, negative, over-limit (600 vs 500), wrong-cause allocation | rejected: PASS |
| Valid 200 allocation; replay with the same key | same allocation id, duplicate=true: PASS |
| Two concurrent 200 requests with 300 left | one created, one rejected 409: PASS |
| Reverse without reason; with reason; second reversal | 400; status reversed; second call returns the reversed record unchanged (idempotent); a new allocation is possible afterwards: PASS |
| General domain: verify, allocate 100, over-allocate 250 against 300 | PASS / rejected: PASS |
| Reconciliation view | loads; lists earlier test donations that refer to a missing donor (kept as evidence): PASS WITH LIMITATION; independent recount of dashboard totals for these two donations NOT RUN |
| Multi-cause split live, designation rejection live | NOT RUN (offline coverage from D3 to D8) |

## 60. 90/10 wording
Where it occurs: homepage text (presentation); a free-text `notes` string "Allocation split: Direct Aid ..., Ops ..." computed as 90/10 when the donation is created (an informational note on the Donations row; no designation or allocation record); the donor dashboard computes the same display figures. It is NOT a recorded designation, NOT an allocation, and nothing enforces it. Historical rows untouched. Automatic 90/10 financial treatment: BLOCKED pending an owner-approved policy.

## 61. Configuration-hardening gates
| Gate | Result |
|---|---|
| Readiness endpoint contract: admin only; outage 503 `temporarily_unavailable`; reachable but worksheets absent 424 `schema_incomplete`; nonexistent sheet `spreadsheet_not_found`; bad credentials `authentication_failed`; invalid id `configuration_invalid` with no request; recovery to operational; body has no id or secret; only read calls | PASS (offline route test `tests/readiness-route.test.ts`). Live: operational/schema_incomplete classification and unknown-id `spreadsheet_not_found` PASS (read-only). Live outage of the isolated sheet NOT RUN (would need hiding or damaging the test sheet) |
| Legacy sync client (`tests/sync-client.test.ts`): success writes once; Google failure propagates the original error with no retry; unconfigured or malformed configuration throws `GoogleConfigError` without secrets and sends nothing | PASS. A SyncEngine-level test was NOT WRITTEN (its audit logger is not isolated) |
| Offline 429/5xx classification, bounded backoff, no append retry after an ambiguous 5xx, request dedup (sheets-quota, google-usage, config-hardening tests) | PASS (offline). Live quota induction NOT RUN (unsafe by design) |
| Final suites | offline: 35 files, 396 tests PASS (final run, after the last test files were added); `tsc` 0 errors; eslint 0 errors; `next build` exit 0 |
| Bundle scan after the build | 62 client files, 0 server-secret value hits (6 secret-class variables, 40-character prefix match), 0 private-key / client_secret / GOCSPX pattern hits. Limits: `.next/static` only; values shorter than 8 characters not checked |
| Live suites against isolated resources (operations, integrations, drive-oauth, config-readiness) | 24 tests PASS (test spreadsheet and test Drive folder; files private; missing file gives 404) |

## 62. Disclosure: one e-mail sent
A background run of the existing live suite (started by an earlier command whose parent task I stopped; the stop did not kill the child process) executed `integrations.live` "sends the test communication ONLY to the SMTP account's own mailbox": one message to the SMTP account's own mailbox (the suite's designed behavior). No donor address was used. Treat as SMTP-accepted only; inbox delivery not verified. In audits where e-mail is prohibited that test must be excluded.

## 63. Production schema gaps (no production change)
Read-only comparison: production has 13 of 19 registered worksheets. Missing: Allocations, Donation_Causes and Communication_Recipients (core to designations, allocations and communications: BLOCKING for the current code); Program_Content (Programs pages: BLOCKING for that feature); Portal_Auth_Events (donor-portal rate limits; the portal fails safe without it: feature-blocking); `_Secrets` (Drive OAuth refresh token: blocking for Drive uploads). Missing columns on Causes, Donors, Donations, Field_Reports and Communications are legacy-compatible (appended on first write, older rows read blank): not blocking. Migration preparation (rehearsal BLOCKED: no production copy provided): 1 verify source and destination ids and owner approval; 2 full copy and per-tab row counts; 3 rehearse on the copy with the application's idempotent tab/header creation; 4 preflight (readiness must be `operational`) and post-check (counts, key integrity, reconciliation); 5 rollback = restore the copy and revert the deployment; 6 only the owner-authorized executor runs it.

## 64. Decision
PARTIALLY READY: the combined acceptance audit on isolated resources can continue. Still NOT RUN on the final code: live overdue hold, live multi-cause split, gallery/ribbon lifecycle, realtime reconnect, donor-portal limits. Public launch remains NO-GO (production schema, owner decisions on 90/10 and per-need funding, GOOGLE_TARGET_ENV, credential actions).


---

# ADDENDUM D13 — Final-code verification of the remaining gaps (2026-10-28)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, 106 uncommitted entries. No commit, push, deployment, production write, credential action, migration or e-mail in this addendum.

## 65. Process and e-mail containment
A process scan found no vitest, next, tsc or eslint process still running (the earlier stray live-suite process had finished). The offline suite never reaches SMTP (`tests/setup.ts` mocks `@/lib/email`, the provider manager and Resend). The new live test (`tests/live/final-acceptance.live.test.ts`) mocks e-mail, Drive uploads (stub id, nothing uploaded), realtime fan-out and Firebase, so it cannot send. The single earlier e-mail (D12 section 62: the existing live Gmail test, to the SMTP account's own mailbox) stays recorded as SMTP-accepted only; inbox delivery was not verified. The existing `integrations.live` Gmail test must be excluded from any run where e-mail is prohibited.

## 66. Target isolation
The new live test refuses to run unless GOOGLE_TEST_SHEET_ID is the approved id, differs from production, and the sheet carries the `_IntegrationTest` marker tab; it then forces GOOGLE_SHEET_ID to the approved id, empties the Drive folder and sets GOOGLE_TARGET_ENV=test for its own process only. Evidence printed by the run: effective target fingerprint `…UceGzM`, declared target `test`. The launcher `daarayn-d3-isolated` (scratchpad, not the user's env files) is isolated: it aborts when ids are missing or equal. The unset GOOGLE_TARGET_ENV does leave an unsafe path: any process started WITHOUT the launcher or a test guard (for example a plain `npm run dev`) targets production because `.env.local` holds the production id. I did not change `.env.local` or the owner variable; status PASS WITH LIMITATION; owner action: set GOOGLE_TARGET_ENV per environment and keep production ids out of development env files.

## 67. SyncEngine regression (gap closed)
Why the earlier test failed: it used the wrong task shape (`action` instead of `operation`/`entityId`) and `executeSyncTask` returns nothing, so there was nothing to assert. Defects found and fixed in `lib/sync/SyncEngine.ts`: (1) the outcome was visible only in the audit log, so a caller could not tell a failed write from a completed one: it now returns `{ success, error }` (never throws); (2) CREATE was not idempotent: replaying it appended a duplicate row: it now updates the existing row. Test `tests/sync-engine.test.ts` (5 tests, real SyncEngine, Google API replaced by a double): new id appends once, audit SUCCESS; replayed CREATE appends nothing and updates the existing row; Google 503 returns success=false with the reason, audit FAILED, exactly one attempt; unconfigured returns failure, sends nothing, no secret in the message; DELETE updates the row, unknown id writes nothing. PASS. Limitation: SyncEngine has no caller in the application today (dead code), so there is no runtime path to observe.

## 68. Live financial acceptance on the FINAL code (approved test sheet)
Run `ZZ_FINAL_mvs4h887` (causes A, B, C; synthetic donor; donation 1 = DA92478). All PASS:
| Check | Result |
|---|---|
| Draft cause refuses a donation (400); Active cause accepts | PASS |
| Pending donation cannot be allocated (409) | PASS |
| Verified (status completed); allocation 60 accepted; replay with same key returns the same allocation (duplicate=true); allocation 41 over the remaining 40 refused (409) | PASS |
| Two concurrent 30 allocations with 40 remaining: one 200, one 409 | PASS |
| Reversal with reason sets status reversed; reversal with empty reason refused (400) | PASS |
| Cause set to Completed: new donation refused (400, "not open for donations"); unknown cause id refused; donation row count unchanged | PASS |
| Multi-cause donation (B and C, 300): both designations UNRESOLVED, no invented split; three invalid splits (200+200, 350 and -50, only one cause) refused and nothing changed; explicit 200 + 100 persisted, sum 300 | PASS |
| Independent recount (raw Sheets read) of verified designated amounts: A 100, B 200, C 100; the application's per-cause funding reports exactly 100, 200, 100 | PASS |
| Reconciliation exceptions referring to this run's donations | none; PASS |
Not live (offline only, see tests/cache-authority.test.ts): stale-cache cause completed by another instance, unreadable eligibility source, cached balance. The earlier old-test-donor reconciliation warnings (donor DNR-TEST with no donor record) are historical fixtures and were left untouched.
Load note: the final-code eligibility checks read causes and holds fresh on every donation, which roughly adds two reads per donation; during the live run Google returned HTTP 429 twice and the bounded retry recovered with no failure and no duplicate. When retries are exhausted the donation route now answers 503 with Retry-After and a generic message (defect: it used to return HTTP 500 with the raw Google error text, which included a Google project number; fixed, covered by a new offline test).

## 69. Remaining scenarios
| Scenario | Status |
|---|---|
| Masjid hold: boundary, blocking, clearance, audit, fail-closed | PASS offline (tests/masjid-hold.test.ts). Live overdue case NOT RUN (no supported way to backdate a timestamp without hand-editing a row) |
| Quick Donation Ribbon: server-side eligibility for stale entries | PASS offline for the server rule (cache-authority, masjid-hold: held/ineligible causes refused whatever the client sends); ribbon UI after lifecycle changes NOT RUN on the final code (admin browser session expired and password sign-in is not permitted) |
| Gallery upload, order, cover, captions, reload, access control | NOT RUN live on the final code (needs the admin session and Drive); offline program-gallery tests PASS (32 earlier tests) |
| Realtime reconnect and replay | NOT RUN live on the final code (earlier D9 live evidence stands; live replay of Realtime_Events passed in integrations.live) |
| Donor portal ownership and rate limits | PASS offline (donor-portal-auth, donor-portal-guard); live NOT RUN (no OTP or e-mail allowed) |
| Readiness outage and recovery | PASS offline route test (503 outage, recovery, 404/auth/config classes); live: unknown id gives `spreadsheet_not_found`, production shows `schema_incomplete` (13 of 19 worksheets); a separate-process outage was covered by the unknown-id live check, not by killing a resource |
| Live quota | NOT RUN by design; two natural 429s in the live run were retried successfully |

## 70. Final checks
Offline: 36 files, 402 tests PASS. TypeScript 0 errors. ESLint 0 errors (200 warnings). `next build` exit 0. Bundle scan after that build: 62 client files in `.next/static`, 0 server-secret value hits (6 secret-class variables, 40-character prefix), 0 private-key / client_secret / GOCSPX pattern hits; limits: `.next/static` only, values under 8 characters not checked. Live (isolated resources): final-acceptance 6/6, config-readiness 3/3.

## 71. Decision
PARTIALLY READY. Open: production schema (6 worksheets missing, 4 blocking) and rehearsal BLOCKED, owner decisions (90/10 policy, per-need funding, GOOGLE_TARGET_ENV), credential actions, and the live-UI scenarios marked NOT RUN above.


---

# ADDENDUM D14 — Runtime write guard, quota cost, allocation integrity under rate limits (2026-10-28)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, 116 uncommitted entries. No commit, push, deployment, production write, migration, credential action or e-mail. No process was left running. E-mail: every test in this phase mocks the mail transport; the Gmail live test and the operations live test (which sends an approved test campaign) were NOT run.

## 72. Runtime write guard (high-priority hazard closed)
Hazard confirmed: `.env.local` holds the production spreadsheet id and Drive folder, so a plain `npm run dev` pointed at production with write access.
Implemented in `lib/google/config.ts` (`decideWriteTarget`, `guardWrites`) and applied where the Google clients are created, so no write path can skip it: `getSheetsClient` and `getDriveClient` (lib/google/client.ts, used by SheetsService, the realtime event log and everything else), the Drive OAuth write client (`getDriveApi`), and the legacy sync client. Every mutating call (spreadsheets.batchUpdate/create, values.append/update/clear/batchClear, Drive files.create/update/delete/copy) is refused with a configuration error BEFORE any request is sent; reads are never blocked; the refusal is not retried.
Rules: in a development or test runtime a write is allowed only if GOOGLE_TARGET_ENV is `test` AND the spreadsheet id equals GOOGLE_TEST_SHEET_ID (Drive: root folder empty or equal to GOOGLE_DRIVE_TEST_FOLDER_ID). Unset, unknown or `production` label, or a mismatching id: refused. A label alone never authorizes a target. In a production runtime (NODE_ENV=production or VERCEL) `production` or an unset label is accepted (existing deployment unchanged and not exercised here) unless the id is the declared test sheet. The readiness response now reports the guard decision codes (no ids).
Tests (`tests/write-guard.test.ts`, 19 tests): decision table (unset, unknown, production-in-dev, test-label-with-production-id, no test id, matching test id, test runtime, production runtime variants, Vercel), real SheetsService writes refused with no Google call while reads work, the event-log style direct client, Drive writes vs reads, no retry of a refusal, and a regression for the guard implementation itself.
Defect found by the first live run: the guard was first built as a Proxy over the googleapis resource; googleapis defines non-configurable properties, which makes a Proxy return raw values (every Sheets save failed with HTTP 500). Fixed by proxying an empty shadow object; the unit test now uses non-configurable properties like the real library.
Answer: ordinary development can no longer write to production: a plain `npm run dev` is read-only until the developer declares `GOOGLE_TARGET_ENV=test` with the matching test ids. Remaining bypasses: a developer who deliberately sets both GOOGLE_TARGET_ENV=test and GOOGLE_TEST_SHEET_ID to the production id (an explicit act), and scripts that build raw googleapis clients (only `scripts/inspect_google.ts`, read-only). Scripts using the shared clients are guarded. Owner actions: put `GOOGLE_TARGET_ENV=test` and the test ids in development env files only, and `GOOGLE_TARGET_ENV=production` in the production environment (not done; `.env.local` untouched). The isolated launcher (scratchpad) now exports GOOGLE_TARGET_ENV=test, GOOGLE_TEST_SHEET_ID and GOOGLE_DRIVE_TEST_FOLDER_ID. Live suites declare the same before importing the app.

## 73. Google request cost per operation (live, approved test sheet, `tests/live/quota-cost.live.test.ts`)
| Operation | Google requests | Detail |
|---|---|---|
| Valid new donation (new donor) | 18 | Causes 1, Program_Content 1, headers 3, Donors 2 read + 1 append, Donations 3 read + 1 append + 2 update, Audit_Log 1, Notifications 1, Donation_Causes 1 read + 1 append |
| Valid donation, same donor | 15 | as above, one fewer donor write |
| Rejected ineligible donation | 2 | Causes, Program_Content |
| Verification | 3 | read, update, audit append |
| Valid allocation | 8 | |
| Rejected allocation | 4 | pure reads |
| Dashboard | 2 | one batched read |
| Reconciliation | 1 | one batched read |
Findings: the fresh-eligibility fix adds the Causes read and (for a specific project) the Program_Content read, 2 of 18 requests; a general (unrestricted) donation now skips the Program_Content read (optimization applied, no correctness change). The largest cost is the donation-id claim/verify protocol (Donations read 3 times, updated twice): it is the cross-instance duplicate guard, so I did not weaken it without a design review. Google's per-user read quota is about 60 requests a minute; at 15 to 18 requests per donation, roughly 3 donations a minute from one instance can exhaust it. Next safe remedies (not done): share one Donations read inside the claim protocol, write the two Donations status updates as one, and queue notifications. Not claimed resolved.
Quota behavior: 429 classification, bounded backoff and exhaustion are covered offline; the live runs hit natural 429s three times and the bounded retry absorbed most. Responses after exhaustion are sanitized (donation route: 503 with Retry-After, no provider text).

## 74. Defect found by a live 429: allocation could stay active without its cap check
When Google rate-limited the post-write verification read, the allocation row was already written but the request failed with HTTP 500; two concurrent requests could both stay active (live recount saw 120 allocated against a 100 donation). Fix in `lib/services/allocationService.ts`: if the verification cannot run, the row is reversed as a system action and the caller gets 503 (a retry with the same key starts clean); if even that fails the caller is told the outcome is unknown. A system-reversed row is no longer returned as a successful replay. Tests `tests/allocation-verify-failure.test.ts` (3). The affected test donation of that run (ZZ_FINAL run `mvs4h887` successors) remains in the test sheet as evidence; it was not edited. PASS (offline); the live rerun passed 6/6 with no over-allocation.

## 75. 90/10 and per-need funding
Found and fixed: the donor dashboard API presented every donation as an "allocation" with a derived 90/10 split, and the page rendered "Funding Split Allocations", "Complying with 90/10 direct aid metrics", and read fields that did not exist (it would have crashed on `allocatedAmount.toLocaleString()` as soon as a donor had a donation). The dashboard also described updates as "AI-Generated" (the platform uses no AI). Now: the API returns only the signed-in donor's ACTIVE rows from the Allocations tab with public-safe fields (no admin e-mail, notes or evidence ids); the page says "Allocations recorded from your contributions", has an empty state, and no 90/10 or AI wording. Tests `tests/donor-dashboard-allocations.test.ts` (3). Still true and NOT changed: the 90/10 sentence on the homepage (presentation, `HeroSection`), the note "Allocation split: Direct Aid ..., Ops ..." written into each new donation (descriptive note, no allocation record), and the unused `generateAIMessage` template in lib/db.ts. Owner decision required: approve or remove the 90/10 policy; recommended: reporting must label it as a stated policy, never as an allocation. Masjid needs remain line items of the parent project; no need-level funded amount is shown or stored: need-level funding NOT IMPLEMENTED (needs a design and approval).

## 76. Live UI acceptance
The admin browser session expired and password sign-in is not permitted, so no write-capable browser group was run. BLOCKED, owner action: sign in once on the preview browser (http://localhost:3100/admin/login) or approve a test-auth mechanism. Affected: Quick Donation Ribbon after lifecycle changes (server-side rule PASS offline and via live API for Completed/Draft/unknown causes), gallery upload and reload, realtime reconnect, live overdue hold. Phone-width check of the public homepage, Programs, a project detail page and the donation form: no horizontal overflow (PASS, read-only). Donor portal: ownership and rate limits PASS offline only; cross-instance behavior of `Portal_Auth_Events` limits NOT verified live (no OTP or mail allowed); the donor dashboard ownership boundary is covered by the new test.

## 77. Release prerequisites (unchanged unless stated)
Six production worksheets still missing (Allocations, Donation_Causes, Communication_Recipients, Program_Content, Portal_Auth_Events, `_Secrets`; four blocking); migration rehearsal BLOCKED (no production copy); credential actions pending (owner); GOOGLE_TARGET_ENV needs per-environment values (new requirement, section 72); Drive uploads depend on `_Secrets` and the OAuth connection (Testing-mode consent expires about 2026-11-02, owner action). ESLint: 201 warnings, 0 errors; the warnings are unused variables and hook-dependency notices, none in the write guard or financial paths. Bundle scan scope: `.next/static` only (62 client files); server bundles and values under 8 characters are not scanned.

## 78. Final checks and decision
Offline 39 files, 428 tests PASS; tsc 0 errors; eslint 0 errors; `next build` exit 0; bundle scan 62 files, 0 secret-value hits, 0 pattern hits. Live (isolated resources, no e-mail): final-acceptance 6/6, quota-cost 1/1, config-readiness 3/3, integrations (Sheets, donation workflow; Gmail excluded) passed in the earlier run before the allocation fix and were not repeated after it. Decision: PARTIALLY READY (isolated acceptance can continue once an authorized admin session exists); production release remains NO-GO.


---

# ADDENDUM D15 — Allowlisted write targets, request counts, live browser and operational acceptance (2026-10-28)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, 121 uncommitted entries. No commit, push, deployment, production write, migration, credential action or e-mail. No test, server or build process is left running. E-mail: the offline setup now also mocks `nodemailer` itself (any attempt to open a real SMTP connection throws), the live tests mock the mail modules, and the Gmail live test and the operations live test were NOT run.

## 79. Environment/target matrix (stronger than two agreeing variables)
D14 left a bypass: setting GOOGLE_TARGET_ENV=test and GOOGLE_TEST_SHEET_ID to the production id. Closed. A development or test process may now write only if ALL hold: label `test`; GOOGLE_SHEET_ID equals the declared GOOGLE_TEST_SHEET_ID; the id is on the COMMITTED allowlist `lib/google/approvedTargets.ts` (approved test sheet and approved test Drive folder; code, not environment); and it is not the production id when GOOGLE_PRODUCTION_SHEET_ID / GOOGLE_PRODUCTION_DRIVE_FOLDER_ID are configured (veto). Throw-away resources created by a live test are approved for that process only through a function that does nothing outside a test runner (`VITEST`).
| Case | Decision |
|---|---|
| Dev, label unset / unknown / `production` | refused |
| Dev, label test, production id in both variables | refused (not on allowlist) |
| Dev, label test, approved sheet, declared id matches | allowed |
| Dev, approved sheet but no label, or no declared id | refused |
| Configured production id equals the sheet | refused even if allowlisted |
| Drive folder declared as test but not allowlisted, or equal to the production folder | refused; empty folder allowed |
| Production runtime (NODE_ENV=production / VERCEL), label production or unset | allowed (unchanged, not exercised) |
| Production runtime on the declared test sheet | refused |
Tests (`tests/write-guard.test.ts`, 25): the matrix, plus the real client: a write with label and id both set to the production id never reaches Google (the googleapis double records zero calls); the guard is applied to the Sheets client, Drive client, OAuth Drive client and the legacy sync client; reads are never blocked. Answer to "can accidental development writes reach production": no, demonstrably, for every route that uses these clients; the residual bypass is editing the committed allowlist or running a script that builds its own raw client (`scripts/inspect_google.ts` is read-only). Owner mapping to set (not done): development env files `GOOGLE_TARGET_ENV=test`, `GOOGLE_TEST_SHEET_ID`, `GOOGLE_DRIVE_TEST_FOLDER_ID`; production environment `GOOGLE_TARGET_ENV=production`, plus `GOOGLE_PRODUCTION_SHEET_ID` and `GOOGLE_PRODUCTION_DRIVE_FOLDER_ID` for the veto. `.env.local` was not touched.

## 80. Google request counts (before = D14, after = now)
| Operation | Before | After | Outcome |
|---|---|---|---|
| New donation to a project (new donor) | 18 | 18 | PASS 200 |
| Same donor again | 15 | 15 | PASS 200 |
| General (unrestricted) donation | not measured (would have read Program_Content) | 12 | PASS 200; the holds read is skipped when no specific cause is chosen |
| Rejected ineligible donation | 2 | 2 | 400 |
| Verification | 3 | 3 | 200 |
| Allocation / rejected allocation | 8 / 4 | 8 / 4 | 200 / 409 |
| Dashboard / reconciliation | 2 / 1 | 2 / 1 | 200 |
Candidate review: (1) one shared Donations read inside the claim protocol: NOT done: the first read is the idempotency/adoption check before the placeholder append, the second must follow the append (it fixes the id), the third verifies uniqueness after the write; removing any of them weakens duplicate protection across instances. (2) combine the two Donations updates: NOT done: the first writes the claimed id before the uniqueness check, the second records the completed follow-up state; merging would drop the recoverable intermediate state. (3) header reads: only on a cold instance (zero on the second donation). (4) batching Causes and Program_Content into one request: would save 1 of 18 and needs repository changes; not done. Conclusion: no safe reduction beyond the holds skip; the donation path still costs 12 to 18 requests, Google's per-user read quota is about 60 a minute, so roughly 3 to 5 donations a minute from one instance can exhaust it (bounded retry absorbs bursts; retry exhaustion now returns 503 and the allocation path undoes unverified rows, D14 section 74). Material quota risk REMAINS for campaign-style traffic; next remedy: a short-lived single-flight/queue for the claim protocol or a higher Google quota, both owner-level.

## 81. Live browser and live isolated acceptance (authorized admin session was available this time)
Effective target of the preview server: readiness reports write guard `target_ok` for Sheets and Drive on the isolated launcher.
| Scenario | Evidence | Status |
|---|---|---|
| Quick Donation Ribbon, stale entry | Browser: ribbon listed the new Active cause; the admin set it to Completed; the stale ribbon choice still routed to `/pay?cause=...`; submitting the form showed "not open for donations (status Completed)"; admin donations list has zero rows for that donor; direct API for Completed/Draft/unknown causes refused (live final-acceptance) | PASS. Mobile layout: public pages checked for overflow only (no overflow); ribbon touch interaction NOT RUN |
| Program gallery | Browser/admin API on the isolated Drive folder: 3 images uploaded in one request; a text file refused with a clear message and nothing stored; reorder + independent cover (cover was the last image, not the first) + caption/alt edit persisted on reload; public detail page showed positions 1 of 3 to 3 of 3 in the stored order with the right captions and alt texts; removal left 2 images and a valid cover; anonymous POST/DELETE 401; anonymous read of a donation proof 401 while a gallery image is public (200); a failed Drive upload and a real touch swipe NOT RUN | PASS WITH LIMITATION |
| Realtime/SSE | Live: connected, a real persisted program save produced a CAUSE_UPDATED event; the stream was closed, a second save made while disconnected was replayed after reconnecting with the last event id (id 399), no earlier event repeated; an admin page re-render from the event and the source-unavailable case were not re-run (D9 evidence stands) | PASS WITH LIMITATION |
| Masjid overdue hold | New supported mechanism: `TEST_CLOCK_OFFSET_DAYS` (lib/catalog/clock.ts) shifts the server clock only for a process already authorized for the approved test target; ignored everywhere else (offline test, production/Vercel/unlabeled/non-allowlisted all ignored). Live, in-process on the approved sheet: fresh update accepted; +6 days accepted; +8 days refused (400, "on hold"), project still listed publicly but absent from the donation catalog; clearance without a reason 400, with a reason 200; accepted after clearance; clearing a non-held project 409; audit row CLEAR_PROJECT_HOLD present in Audit_Log. Exactly 7 days cannot be hit live (time passes); the exact boundary is covered offline | PASS WITH LIMITATION |
| Donor portal limits | Live on the approved sheet with a mocked transport (no e-mail possible): 6 requests for one identifier across different IPs queued at most 3 codes; a fresh module instance (a second server) was bound by the same Sheets state; the stored rows contain no raw identifier; 10 requests per IP allowed and the 11th refused with 429; wrong-donor access covered offline | PASS. Cross-instance persistence IS verified live (state is read from Sheets); concurrent-instance races NOT tested |

## 82. Donor dashboard and 90/10
Offline tests (3) prove the dashboard returns only the signed-in donor's active Allocations rows with five public-safe fields, no 90/10 figures, no admin e-mail/notes/evidence ids, a truthful empty state, and no AI wording in the page. The 90/10 homepage sentence and the per-donation note "Allocation split" remain: descriptive, not an allocation, owner decision still required (approve as a stated policy or remove). Per-need Masjid funding: NOT IMPLEMENTED; the project page shows needs as listed lines with amounts and a parent-level funding bar only.

## 83. Drive OAuth, production schema, gates
Drive OAuth (non-destructive status call): configured and connected, publishing status `testing`, re-authorization required by 2026-11-02T19:27Z (5 days from today). Affected: every Drive write (donation proofs, program galleries, allocation evidence, communications attachments) and the isolated tests that upload; reads use the stored token until it expires. Owner action: move the consent screen to production or reconnect before that date; I did not rotate or revoke anything. Production schema unchanged: six worksheets missing; blocking: Allocations, Donation_Causes, Communication_Recipients (financial designations/allocations/recipient history) and Program_Content (Programs pages); Portal_Auth_Events (portal fails safe) and `_Secrets` (Drive token) are feature-blocking. Migration rehearsal BLOCKED (no production-equivalent copy). Nothing was created in production.
Final gates: offline 39 files / 435 tests PASS; `tsc` 0 errors; eslint 0 errors, 206 warnings (unused variables and hook dependency notes; none in the guard, clock or financial services); `next build` exit 0; bundle scan: all 62 files in `.next/static` (js, css, html, json, map), 7 secret-class variables checked by 40-character prefix, 0 hits; patterns BEGIN PRIVATE KEY, "private_key", client_secret, GOCSPX-: 0 hits; scope limits: server bundles and values shorter than 8 characters are not scanned.

## 84. Decision
PARTIALLY READY for continued isolated acceptance; production release remains NO-GO (production schema and migration rehearsal, quota headroom, owner decisions on 90/10 and per-need funding, GOOGLE_TARGET_ENV/GOOGLE_PRODUCTION_* mapping, Drive OAuth before 2026-11-02, credential actions).


---

# ADDENDUM D16 — Row-position integrity under concurrency, OAuth continuity, exact hold boundary, quota capacity (2026-10-28)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, 127 uncommitted entries. No commit, push, deployment, production write, migration, credential action, OAuth setting change or e-mail. No test, server or build process remains running. All tests mock the mail transport (offline setup also mocks `nodemailer`); the Gmail live test and the operations live test (campaign send) were not run.

## 85. Defect found by the concurrency tests: Google reports wrong row numbers for overlapping appends (HIGH)
Evidence (raw Sheets API, approved test sheet, 14 simultaneous `values.append` calls): 14 distinct rows were written (149 to 162) but the responses reported only two distinct `updatedRange` rows (149 and 152). The append response is therefore NOT a reliable row position when appends overlap. Four application protocols ordered themselves by that number:
1. Donor-portal guard (rank by row): 14 concurrent requests from one IP admitted 12 (limit 10); 8 concurrent requests for one identifier queued 4 codes (limit 3); `consume()` could let two racers both win a one-time code (compared reported row numbers).
2. Donation claim (`createWithUniqueId`): two concurrent donations could believe they owned the same row, overwriting one another and leaving a PENDING placeholder.
3. Donor creation across instances: duplicate-donor detection compared reported rows.
4. Communication recipient queue: outcomes were written back by `first + i`, i.e. possibly onto another campaign's recipient rows.
Fix: each protocol now finds its OWN row by a unique marker in the data it just read (guard event id, donation claim marker in `notes`, Donor Token, recipient id), retries the read a few times, and fails safe if the row never appears; `consume()` compares ids. Files: `lib/donors/portalGuard.ts`, `lib/repositories/donationRepository.ts`, `donorRepository.ts`, `communicationRecipientRepository.ts`. Regression: `tests/append-row-misreport.test.ts` (5 tests; the fake sheet can now misreport appended rows like Google does). The portal and identifier tests were run against the OLD code and fail with exactly the live numbers (11 vs 10, 4 vs 3); they pass on the new code.
Live verification (approved sheet, separate module instances = separate servers): 14 simultaneous requests from one IP: exactly 10 allowed, 4 refused (429); 8 simultaneous requests for one identifier across 8 IPs: 3 codes queued (limit 3), identical answers for all; 6 simultaneous donations by one new donor via 6 instances: 6 accepted, 6 distinct ids, 6 intact rows, 1 donor row, no PENDING rows. The event rows hold hashes only (no raw identifier or IP). PASS. Limitation: Sheets has no atomic multi-row transaction; these protocols are append-then-verify and have been shown correct for the tested concurrency (up to 14 simultaneous), not proven for arbitrary load.

## 86. Drive OAuth continuity
Live read-only diagnostics (`tests/live/oauth-continuity.live.test.ts`; prints no token, secret, client id or e-mail): OAuth client configured; the client belongs to the SAME Google Cloud project as the service account (project number match true); only the scope `drive` (full Drive, restricted) is requested and granted; a refresh token is stored and still USABLE today (an access token was issued with 3599 s lifetime); the app records when it was connected. The date 2026-11-02T19:27Z in the admin status is COMPUTED by the app (connection time plus 7 days) from the declared GOOGLE_OAUTH_PUBLISHING_STATUS=testing: it is the app's assumption, not a value read from Google. Whether the consent screen is actually in Testing is a console fact I cannot read; Google documents that Testing-mode refresh tokens for sensitive/restricted scopes expire after 7 days.
Errors are not hidden: `invalid_grant` is returned as 503 `DRIVE_REAUTH_REQUIRED` by the media route and as "authorisation revoked or expired" by the status check; uploads fail with an explicit error. When the token lapses, new donation proofs, gallery uploads, allocation evidence and campaign attachments fail; public gallery images and proof viewing fail with 503 as well (they are fetched through the same token), so public program pages would show broken images. Sheets, donations without proof, allocations without evidence and all other features keep working.
Narrower scope: `drive.file` only reaches files this OAuth client created, so it would work if the evidence root folder were created BY this app (new folder, migrate or re-link existing files by copy); it does not work for the current owner-created root folder. This is an architectural option for the owner, not done.
Owner checklist (no credentials shared): 1) in Google Cloud Console, open the OAuth consent screen of the project used by this client and read the Publishing status. 2) If Testing: either publish to Production (the full `drive` scope is restricted: Google may require app verification and possibly a security assessment, which can take weeks) or switch to a design that needs a narrower scope; as a stop-gap, reconnect through Admin, Settings, Google Drive before 2026-11-02 and then every 7 days. 3) After any change set GOOGLE_OAUTH_PUBLISHING_STATUS accordingly. 4) Verify: Admin, Settings, Google Drive shows Connected; upload one test image to a test program; open it in the public page; the diagnostics above must report `refreshTokenUsable:true` and scope `drive`. I did not change the consent screen, scopes, project or tokens.

## 87. Remaining gallery acceptance
Offline with the test adapter (existing, re-run): a failed Drive upload stores no record, only the failed file is reported, a retry adds it exactly once with distinct file ids; a metadata write failure deletes the just-uploaded file. A real-provider Drive failure was NOT induced (NOT RUN). Live at 390 px width on the isolated server: no horizontal overflow; scroll-snap gallery moved from 1 of 2 to 2 of 2 when the track was scrolled one slide, ArrowLeft returned to 1 of 2, the Next button advanced; a deliberately broken image did not affect the page (Contribute and the Next control remain); an unknown media id anonymously returns 401, donation proofs 401, gallery images 200 (D15). A real finger swipe could not be produced with the available tools: native scroll was simulated, so real touch is NOT RUN (the component relies on native scroll-snap, no custom touch code). Order, independent cover and captions persisted after reload (D15).

## 88. Exact Masjid boundary (live, frozen test clock)
New `TEST_CLOCK_FIXED_ISO` (lib/catalog/clock.ts) freezes the server clock for a process already authorized for the approved test target; ignored for every other process (offline test: no label, non-allowlisted id, production runtime, Vercel). Live on the approved sheet: update stamped by the server; clock = update + 7 days minus 1 ms: donation accepted; exactly 7 days: accepted; plus 1 ms: refused 400 "on hold"; the project stays listed publicly and a General donation in the same run is accepted. Clearance with a reason and audit event, re-evaluation from the clearance time, and the +0/+6/+8 day sequence were verified in D15. Missing or unreadable hold data failing closed is covered offline only (NOT RUN live: it would need an unreadable tab). PASS WITH LIMITATION.

## 89. Quota capacity (Google documentation checked)
Google's documented default Sheets quotas: 300 read and 300 write requests per minute per project, and 60 read and 60 write requests per minute PER USER per project; over-quota requests get 429 and should be retried with exponential backoff (cap about 32 to 64 s). The live 429 text names "Read requests per minute per user". This service uses ONE service account, so the 60 and 60 limits are shared by every server instance together, not per instance (correcting the earlier "per instance" wording). Measured cost of a project donation: about 9 to 12 reads and 7 to 8 writes (a general donation: 12 requests in total); with 60 reads a minute the sustained ceiling is therefore about 5 to 6 donations a minute for the whole deployment, less whatever dashboard views, polling, allocations and communications also consume; bursts above that are absorbed by bounded retry (up to 5 attempts, capped backoff) and then answered 503 with Retry-After while nothing is half-recorded (donation id claim is recoverable, allocation undoes unverified rows, D14). Telemetry limits: counts come from one test run per operation, not production traffic; the estimate is arithmetic from documented quotas, not a stress test (no real quota was exhausted). The allocation-fix path measured 8 requests and rejected allocation 4 (unchanged). Remaining mitigations (owner-level): request a higher per-user quota from Google, add a second service-account identity for read-heavy dashboards, or queue donations. Realistic limitation for campaign-style traffic remains.

## 90. Live integrations rerun after the allocation fix
Final-acceptance live (verification, allocation, replay, concurrency, over-allocation, reversal, multi-cause designation, independent recount, eligibility): 6/6 PASS on the final code. Integrations live (service-account auth, Sheets read/write, donation workflow with Drive proof, token/id uniqueness, Admin Donations verification, Realtime_Events replay): PASS; one run failed with a genuine Google 429 after retries and passed on rerun after the quota window (Gmail test excluded). The reconciled totals again matched an independent recount.

## 91. Release blockers and owner decisions (unchanged, re-verified)
Six production worksheets still missing: Allocations, Donation_Causes, Communication_Recipients, Program_Content (blocking), Portal_Auth_Events and `_Secrets` (feature-blocking: portal fails safe; Drive token store). Production-equivalent migration rehearsal BLOCKED. GOOGLE_TARGET_ENV, GOOGLE_PRODUCTION_SHEET_ID, GOOGLE_PRODUCTION_DRIVE_FOLDER_ID need per-environment owner configuration (not set). Drive OAuth continuity (section 86). Credential actions pending (old SMTP password, unused service-account keys). The 90/10 wording still exists, unchanged and unapproved: homepage sentence in `components/HeroSection.tsx`, the note written by `lib/services/donationService.ts` into every new donation ("Allocation split: Direct Aid ..., Ops ...") and an unused template line in `lib/db.ts`; none is an executed allocation and the donor dashboard no longer presents it as one. Per-need Masjid funding: NOT IMPLEMENTED.

## 92. Gates and decision
Offline 40 files / 440 tests PASS; `tsc` 0 errors; eslint 0 errors (208 warnings, none in security or financial paths); `next build` exit 0; bundle scan: 62 files in `.next/static`, 7 secret-class variables by 40-character prefix, 0 hits, patterns BEGIN PRIVATE KEY / "private_key" / client_secret / GOCSPX- 0 hits (server bundles and short values not scanned). Decision: PARTIALLY READY WITH NAMED BLOCKERS (production schema and rehearsal, Drive OAuth continuity, quota headroom, per-environment target configuration, 90/10 and per-need decisions, credential actions). Not authorized for public launch.


---

# ADDENDUM D17 — System-wide append integrity and concurrency audit (2026-10-29)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, uncommitted work only (see section 100). No commit, push, deployment, production write, migration, credential action, OAuth change or e-mail. The offline setup mocks `nodemailer` itself; the live tests mock the mail modules; the Gmail and campaign live tests were not run. No test, server or build process remains running.

## 93. Root fact
Google's append response is not a reliable row position when appends overlap (D16 section 85: 14 simultaneous appends wrote 14 rows but reported 2 distinct row numbers). Rule applied everywhere: a row is identified by a unique marker found in the data that was just read, never by the number an append returned.

## 94. Inventory of every append path (repository, scripts, legacy clients, sync)
| Operation (owner) | Worksheet | Stable marker | Row identified after write by | Retry behaviour | Append-response row used? | Evidence / status |
|---|---|---|---|---|---|---|
| Donor creation (`donorRepository.createOrFind`) | Donors | Donor Token (id) | read, find by id; earlier rows of the same contact win; token collision re-issues | quota-only append retry | NO (fixed D16) | offline misreport test + live 6-instance run PASS |
| Donation claim (`createWithUniqueId`) | Donations | submission key + claim marker in `notes` | read, find by marker; earliest row for a submission key wins; waiting caller now gets the winner's answer | append retried on quota only; PENDING placeholder adopted after 2 min | NO (fixed D16; waiting added D17) | offline A/B tests, live 6 distinct + 5 identical-key runs |
| Designations (`donationCauseRepository.createMissing`) | Donation_Causes | id `DC-<donation>-<cause>` | read-then-append, then re-read; rows after the earliest of an id are blanked | idempotent | NO | **defect fixed D17** (check-then-append could duplicate); offline test PASS |
| Allocation create (`allocationService`) | Allocations | allocation id + requestKey | re-read, find by id; earliest row of a requestKey wins, later same-key rows are system-reversed; unverifiable rows are reversed | key replay returns the earlier allocation | NO | **defect fixed D17** (concurrent same-key replays created several active rows); offline PASS, live PASS |
| Portal request / attempt / consume events (`portalGuard`) | Portal_Auth_Events | event id | read, find by id; rank by real row | append retried on quota only | NO (fixed D16) | offline + live concurrency PASS |
| Campaign recipient queue (`createQueued`) | Communication_Recipients | `<broadcast>:<donor>` id | read, find by id; outcomes written to the located row | not auto-resent | NO (fixed D16) | offline PASS; live campaign NOT RUN (mail) |
| Realtime event log (`eventLog.appendEvent(s)`) | Realtime_Events | eventId | read column A, find the unique eventId (null if absent or duplicated) | log failure falls back to local-only | **YES before D17** | **defect fixed D17** (event id = row number was taken from the append response; wrong or duplicate ids, wrongly skipped events); offline PASS, live PASS |
| Audit entries, notifications (`auditLogRepository`, `notificationRepository.append`) | Audit_Log, Notifications | unique ids, nobody updates them by row | not needed (append-only, ids unique) | duplicates harmless | NO | no change needed |
| Generic save (`baseRepository.save`: programs, content, images, campaigns, field agents ...) | various | entity id | updates by id; creates append | none | NO | RISK (documented): two instances creating the SAME new id at once can add two rows (check-then-append, no marker); admin-only, low frequency; reconciliation reports duplicate ids; not changed |
| Drive token store (`driveOAuth.saveRefreshToken`) | `_Secrets` | key | read then append/update | none | NO | RISK (documented): concurrent first connection could add a second row; reads take the first match |
| Legacy `GoogleSheetsClient` / `SyncEngine` | any | entity id | CREATE now looks the id up first (D15) | none | NO | no application caller; tests PASS |
| Sheets service `appendRow` return value | n/a | n/a | n/a | n/a | the number is still returned by `SheetsService.appendRow/appendRows` and must be treated as untrusted | all current consumers fixed; no remaining consumer in lib/, app/ or scripts/ (grep) |
Scripts (`seed_*`, `migrate_*`, `reconcile_*`) call the repositories, so they inherit the fixes and the write guard; they are not run by the app.

## 95. What each critical operation establishes (tested versus not provable)
| Operation | Reliable row identity | Retry idempotency | Duplicate detection | Single use | Rate-limit exactness | Exclusivity | Crash recovery |
|---|---|---|---|---|---|---|---|
| Donation | yes | yes (key) | yes | n/a | n/a | n/a | yes (PENDING adoption, recovery of follow-up steps) |
| Donor token | yes | yes | yes (earliest row wins) | n/a | n/a | n/a | n/a |
| Allocation | yes | yes (key, concurrent replays collapse) | yes | n/a | n/a | append-then-verify keeps active total within the designation for the tested concurrency; NOT a lock | unverifiable rows are reversed |
| One-time code | yes | n/a | n/a | one winner in every tested race (earliest consume row by id) | n/a | n/a | n/a |
| Rate limits | yes | n/a | n/a | n/a | exact in the tested races (10 per IP, 3 per identifier) | n/a | fails safe if events are unreadable |
| Recipient outcomes | yes | not auto-resent | yes | n/a | n/a | n/a | admin decides on ambiguous SMTP |
Google Sheets offers no atomic multi-row transaction or compare-and-swap; every property above is append, read, then decide by real row order. It has been shown for the tested loads (up to 14 simultaneous requests offline and live; 6 simultaneous live donations; 8 simultaneous identifier requests) and must not be read as arbitrary-load or strict mutual-exclusion proof. A stricter guarantee (hard single-use codes, hard spend caps under any load) needs a store with transactions, which is an architectural decision outside this audit.

## 96. Duplicate-operation versus distinct-concurrency tests
| Case | Offline (fake sheet that misreports appended rows) | Live (approved sheet, separate module instances) |
|---|---|---|
| A. identical donation, 8 callers | PASS: 1 donation, 1 designation, 1 donor, 1 audit entry, same Donation ID for all, 7 redundant proofs deleted | PASS (5 callers: 1 row, 1 designation, 1 id) |
| A2. identical allocation key, 5 callers | PASS after fix: one active allocation, the rest system-reversed duplicates | covered by offline; not repeated live |
| B. 8 distinct donations, one donor | PASS: 8 ids, 8 designations, 1 donor | PASS (6 callers, D16) |
| C. one-time code, 6 racers | PASS: exactly 1 winner, replay refused as used | live D16 (portal) PASS |
| C2. 12 guesses at one challenge | PASS: at most 5 evaluated | not run live |
| D. rate limits | PASS: 10/4 per IP, at most 3 per identifier | PASS D16 (10/4 and 3 of 8) |
| E. 6 allocations of 30 on a 100 designation | PASS: never more than 100 active, every success is one active row | live final-acceptance PASS (cap, concurrency) |
| F. recipient outcomes | PASS: outcomes land on the correct campaign rows | NOT RUN live (needs mail) |
| G. 6 overlapping designation writers | PASS: exactly one row | n/a |
| Event log, 20 concurrent events | PASS: 20 distinct real rows | PASS (realtime replay live test) |

## 97. Read-only integrity analysis of the isolated test sheet (nothing deleted or repaired)
188 donations, 82 donors, 106 designations, 46 allocations, 208 portal events, 42 recipient rows. No duplicate donation ids, submission keys, donor ids, designation ids, event ids, recipient ids or cause ids; no PENDING placeholders; no orphan designation or allocation; no allocation on an unverified donation; no one-time nonce consumed twice; no raw e-mail or IP in the portal events. Findings kept as evidence: (1) ONE over-allocated pair, DA92484 / cause ZZ_FINAL_mvs5050l-A, 120 allocated against 100 designated: the live 429 incident documented in D14 section 74 (fixed afterwards); not repaired. (2) 16 donations refer to a missing donor (the old `DNR-TEST` live fixtures). (3) Two e-mail addresses are shared by 15 and 15 donor rows: the historical live-suite fixtures (SMTP-mailbox and `must-not-be-mailed@example.invalid`), created before the cross-instance donor protocol was fixed or deliberately; not merged.

## 98. Quota and recovery
Request counts retained as historical evidence (D15). Changes in D17: one extra read after writing designations (duplicate check), one extra read after each realtime publish (event-row lookup); these buy integrity and were not removed. Estimated cost of a project donation is now about 18 to 20 requests; with Google's documented 60 reads and 60 writes per minute per user per project (shared by all instances, one service account) the realistic sustained ceiling is about 4 to 5 donations a minute for the whole deployment. Exhaustion is bounded (5 attempts, capped backoff), answered 503 with Retry-After, ambiguous allocation writes are undone or reported as unknown, and replays reconcile by key. Remedies requiring the owner: higher per-user quota, a second service identity for read-heavy views, or a queue in front of donations.

## 99. Live runs of D17
Concurrent distinct donations (6 instances): 6 accepted, 6 distinct ids, 1 donor row. Identical-key concurrency (5 instances, one submission key): all 5 answered 200 with the same Donation ID, exactly 1 donation row and 1 designation row stored (PASS). Realtime event log: events appended and replayed with their real row ids. Allocation chain (final-acceptance): PASS 6/6. A run that hit a real Google 429 in `beforeAll` was repeated after the quota window; no test was weakened.

## 100. Gates, OAuth and blockers
Offline 42 files / 450 tests PASS; `tsc` 0 errors; eslint 0 errors (209 warnings, none in persistence or security code); `next build` exit 0; bundle scan: 62 files in `.next/static`, 7 secret-class variables by 40-character prefix, 0 hits, key and client-secret patterns 0 hits; server bundles and values under 8 characters are not scanned. Drive OAuth evidence (unchanged, D16 section 86): same Google project as the service account, scope `drive` only, refresh token usable today, the 2026-11-02 date is the app's own calculation (connected-at plus 7 days under a declared Testing status), the real consent-screen status is only visible in Google Cloud Console; owner action: read the Publishing status there, publish or re-authorize before the date, expect verification for the restricted scope, then confirm with Admin, Settings, Google Drive. Production blockers unchanged: six worksheets missing (Allocations, Donation_Causes, Communication_Recipients, Program_Content blocking; Portal_Auth_Events, `_Secrets` feature-blocking), migration rehearsal BLOCKED (no production copy), GOOGLE_TARGET_ENV and the two GOOGLE_PRODUCTION_* ids need per-environment configuration, credential actions pending, the 90/10 wording unapproved, per-need funding NOT IMPLEMENTED.

## 101. Decision
PARTIALLY READY WITH NAMED BLOCKERS. The persistence layer now identifies rows by data in every protocol that orders itself by position, and the concurrency results hold at the tested loads; they are not proofs for arbitrary load. Not authorized for production.


---

# ADDENDUM D18 — Drive OAuth: leaving Testing mode (preparation), public privacy page (2026-10-29)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, uncommitted work only (135 entries before this note). No commit, push, deployment, production write, migration, credential action, Google Cloud setting change or e-mail. The preview server uses the isolated launcher (approved test sheet and Drive folder, write guard `target_ok`).

## 102. OAuth findings (verified today)
Same Google Cloud project for the OAuth client and the service account; one scope requested and granted: `drive` (restricted); the stored refresh token works. The consent screen status (External, Testing) and the "reconnect by 5 Nov 2026 13:38" value are the owner's report and an app-side estimate (connected time plus 7 days); the real token expiry is not published by Google. `daarayn.org`, the domain written into the site's metadata, sitemap and footer e-mail, does NOT resolve in DNS (lookup failed today): no public site exists on a verified domain yet. The footer "Privacy Policy" link pointed at `/#about` (a placeholder) and no privacy page existed.

## 103. Engineering work done
| Item | Result |
|---|---|
| Public privacy page `/privacy` (separate from `/admin`), footer link fixed, sitemap entry; includes the owner's wording on organisational information and connected accounts verbatim, plus an explicit Google Drive section (what is accessed, only Daarayn's own Drive through an administrator's authorisation, donors and visitors never connect Google accounts, no sale or advertising or AI-model training, Limited Use statement with the Google API Services User Data Policy link, revocation) | PASS (renders; build lists `/privacy`); content is operational wording, not legal advice; the contact address defaults to the organisation mailbox the platform sends from (`NEXT_PUBLIC_CONTACT_EMAIL` overrides) and must be confirmed by the owner |
| Scope mode `GOOGLE_DRIVE_SCOPE_MODE=file` (non-sensitive `drive.file` scope) with default unchanged (`full`); consent URL carries exactly the selected scope; unknown value never changes the scope | PASS (`tests/drive-scope-mode.test.ts`) |
| `POST /api/admin/google-drive/create-root`: admin-only, creates the app-owned root folder, returns only the id, refuses when a root is already configured unless `force` | PASS (offline); live creation NOT RUN (needs the owner's consent with the new scope) |
| Owner checklist `docs/oauth/DRIVE_OAUTH_PRODUCTION_READINESS.md`: facts, options (A narrow to drive.file, B keep drive with restricted-scope verification and security assessment, C Workspace Internal, D stay in Testing), ordered actions, single next action | DONE |

## 104. Transition assessment
Publishing status and Google's approval of a restricted scope are separate. With the full `drive` scope the app can be set to In production but is then unverified (warning screen, 100-user cap) until Google verifies it, which needs a verified domain, public homepage and privacy policy, scope justification, a demo video and normally an independent security assessment (weeks to months; no one-day result is possible). The faster honest route is Option A: `drive.file` is non-sensitive, needs no restricted-scope verification, and ends the 7-day expiry once published; the cost is one re-authorisation and an app-created root folder (the old owner-made root becomes unreachable; files the same client already created stay reachable). Not done and not claimed: any Google verification, publishing, domain ownership or deployment.

## 105. Blocker and next owner action
BLOCKED on an external prerequisite: there is no public domain or deployment. Single next action: register or point a domain, deploy the public site on it, then verify it in Google Search Console (checklist section 5, step 1 to 3). Also open: `DRIVE_TOKEN_ENCRYPTION_KEY` must be set in production (the privacy page says the token is stored encrypted), the `_Secrets` worksheet is missing in production, the footer Terms link is still a placeholder, the footer phone number is a placeholder.

## 106. Persistence and migration preparation (carried from D17 and D12 section 63)
No new persistence change in D18. Append-integrity inventory and results: D17 sections 93 to 101. Migration preparation remains BLOCKED (no production-equivalent copy); six production worksheets are missing (Allocations, Donation_Causes, Communication_Recipients, Program_Content blocking; Portal_Auth_Events and `_Secrets` feature-blocking).

## 107. Gates
Offline 43 files / 455 tests PASS; `tsc` 0 errors; eslint 0 errors (209 warnings); `next build` exit 0 and lists `/privacy` and the create-root route; bundle scan 62 files, 7 secret-class variables by prefix, 0 hits, key patterns 0 hits (server bundles not scanned). After the build `.next` was deleted and the preview server restarted (running a build while the dev server is up corrupts its styling).

## 108. Decision
PARTIALLY READY WITH NAMED BLOCKERS. OAuth cannot leave Testing today: no public domain, no deployment, Google Cloud steps pending. Production release remains NO-GO.


---

# ADDENDUM D18 (continued) — one-day critical path: domain, OAuth strategy, persistence residuals, schema preparation (2026-10-29)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, uncommitted work only (about 140 entries). No commit, push, deployment, DNS change, production write, migration, OAuth scope or publishing change, credential action or e-mail. The preview server was stopped before the build, `.next` was removed afterwards and the server restarted on the isolated launcher (approved test sheet and folder).

## 109. P0 OAuth, domain and privacy
| Item | Result |
|---|---|
| Domain `daaraynorg.com` | NOT reachable: DNS lookup returns no answer from here (no hosting, no certificate, no pages live). Treated as prepared-but-not-live. |
| Public URLs in code | site metadata, structured data, robots and sitemap now use `https://daaraynorg.com`; footer shows the organisation mailbox only, the invented phone number and the placeholder Terms link were removed (no Terms page prepared; not required by the consent screen) |
| Privacy page | vendor-neutral, owner's sections 4 and 5 verbatim; names no provider (test enforces it); no approval or compliance claim |
| Mandatory-wording conflict | Google's Limited Use sentence is required only for sensitive and restricted scopes. With `drive.file` (non-sensitive) the neutral text is expected to suffice; with full `drive` the one-sentence addition is needed or the review fails. Documented with the choice for the owner (OAuth doc section 12). |
| `drive.file` compatibility | code-inspection matrix (OAuth doc section 9): create, upload, delete, galleries, links work; the old owner-made root and hand-placed files are unreachable; per-file read access of already uploaded files expected but NOT RUN live (needs owner re-consent on isolated resources) |
| Strategy comparison | four options compared (OAuth doc section 10); recommendation: prove `drive.file` on isolated resources first, full `drive` as fallback, Shared Drive only with Workspace |
| Branding and verification pack | prepared (OAuth doc section 11): fields, URLs, redirect URIs, scope justification, data description, demo steps |
| Publishing | not changed; publishing status is not Google's approval; no date promised |
| Hidden authorisation failures | none found: invalid_grant returns 503 DRIVE_REAUTH_REQUIRED, uploads fail explicitly |
Single next owner action: deploy the application on `daaraynorg.com` (host, DNS records, HTTPS), then verify the domain in Search Console.

## 110. P1 persistence residuals (D17 list)
| Residual | Outcome |
|---|---|
| Concurrent creation of the same new administrative entity | FIXED: after a create, the rows for that id are re-read; an IDENTICAL later row is blanked, a row with DIFFERENT content is never touched and is logged as an integrity incident. Tests `tests/concurrent-entities.test.ts` (3 instances, identical and different content). |
| Concurrent first Drive connection | FIXED: after the first token row is appended the earliest row is kept and later rows blanked; nothing is printed or returned. Offline only (no token exercised). |
| Designation duplicate cleanup | REVIEWED and tightened: a row is a duplicate only if donation, cause, amount, status and provenance are identical to the earliest row; blanking is recorded in the audit log (`REMOVE_DUPLICATE_DESIGNATION`); a differing later row is kept and reported; an interrupted cleanup is simply repeated by the next write (deterministic, idempotent). Rows are blanked, not deleted. Test PASS. |
| Campaign recipient outcomes | PASS offline (mocked transport; outcomes land on the located rows of the right campaign under concurrent queues, D16); not inbox delivery; live campaign NOT RUN (mail) |
| One-time codes, rate limits | unchanged evidence (D16/D17); strict single-use under arbitrary load NOT claimed |
| ₹120 against ₹100 incident (donation DA92484) | classified HISTORICAL INCIDENT, preserved: it comes from the D14 live 429 run (documented, fixed afterwards); it is not repaired or deleted; no new occurrence in later runs |
| 16 donations of the retired `DNR-TEST` donor; donor rows sharing two e-mail addresses | KNOWN TEST FIXTURES; not merged (e-mail equality alone never merges donors) |
| Duplicate or orphan designations, recipient rows, ids | none found (D17 section 97) |

## 111. Quota (live, approved sheet, reads and writes separated)
| Operation | reads | writes | total |
|---|---|---|---|
| New donation to a project, new donor | 12 | 7 | 19 |
| Same donor again | 10 | 7 | 17 |
| General donation | 7 | 6 | 13 |
| Rejected ineligible donation | 2 | 0 | 2 |
| Verification | 1 | 2 | 3 |
| Allocation / rejected allocation | 6 / 4 | 2 / 0 | 8 / 4 |
| Dashboard / reconciliation | 2 / 1 | 0 / 0 | 2 / 1 |
No retries or 429 occurred in this run. Google's documented per-user limits are 60 reads and 60 writes per minute, shared by all instances (one service account). Reads bound the deployment at about 5 to 6 donations a minute (60 divided by 10 to 12), writes at about 8; dashboards and other views use the same budget. Realistic supported workload: a few donations per minute sustained, short bursts absorbed by bounded retry and then answered 503 with Retry-After. Invariants the architecture cannot guarantee under arbitrary load: strict single use of a code, hard spend caps and duplicate suppression are append-then-verify, not locks. Remedy needing an owner decision: a transactional store or a higher quota plus a queue.

## 112. P3 schema and migration preparation
Done: `docs/migration/PRODUCTION_SCHEMA_PREPARATION.md` (expected headers dumped from the registry, six missing worksheets with feature impact, blocking classification, preflight, idempotent logic, backup, rehearsal, rollback criteria, approver, record-count and relationship checks, owner environment mapping for `GOOGLE_TARGET_ENV`, `GOOGLE_PRODUCTION_SHEET_ID`, `GOOGLE_PRODUCTION_DRIVE_FOLDER_ID`). Blocking: `Allocations`, `Donation_Causes`, `Communication_Recipients`, `Program_Content`; feature-blocking: `Portal_Auth_Events`, `_Secrets`. Rehearsal BLOCKED (no production-equivalent copy).

## 113. Gates
Offline 45 files / 462 tests PASS; `tsc` 0 errors; eslint 0 errors (210 warnings); `next build` exit 0 (lists `/privacy` and the create-root route); bundle scan: 62 files in `.next/static`, 7 secret-class variables by 40-character prefix, 0 hits, key and client-secret patterns 0 hits (server bundles and values under 8 characters not scanned). Live isolated checks this session: quota measurement PASS; the earlier D17 live runs stand (concurrent donations, identical-key, portal, allocation chain). Not rerun live: the new entity/token dedupe (offline only).

## 114. Owner actions, blockers, decision
Owner actions: deploy on `daaraynorg.com` and verify it in Search Console; decide the OAuth route (live-test `drive.file` on isolated resources, or keep `drive` and accept the review incl. a policy sentence naming Google); set the production environment variables; confirm the contact mailbox; supply a real phone number if one should be shown; resolve the 90/10 wording and per-need funding; credential actions (old SMTP password, unused service-account keys). External dependencies: Google review (weeks to months for the restricted scope), registrar and hosting. Decision: PARTIALLY READY WITH NAMED BLOCKERS. Production release remains NO-GO.


---

# ADDENDUM D19 — Shared program template, three categories, live statistics, hero blend (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, uncommitted work only. No commit, push, deployment, production write, e-mail, OAuth or credential change. Builds were run with the preview server stopped; `.next` was removed afterwards and the preview restarted on the isolated launcher (approved test sheet and folder).

## 115. Root causes
- **Inconsistent program pages:** `ProgramDetailView` had a separate JSX branch per template. Only `relief` used the two-column grid; `endowment` and `custom` used a narrow single column (`pg-one`, max 800 px), so the Qur'an page was a narrow centred column on desktop. Fixed at the source: every template except the Masjid project cards now renders through ONE composition (`pg-std`): desktop (960 px and up) copy left, image card right, heading centred; below 960 px: introduction, image, content, CTA stacked. Programs without images use one centred column. One threshold, no per-program CSS.
- **Masjid project template:** top composition now shared; its two needs/updates cards stay below (they are content, not layout).
- **Hero/section gap:** the hero's bottom gradient faded to a different near-black (`rgba(2,6,13,.95)`) than the page below (`rgb(3,10,6)`), producing a visible dark band at the seam; the hero also had no background of its own. The gradient now ends in the page colour and the section carries the same background (a slow video never shows a different band). Measured at 1440 x 900: hero 900 px, video 900 px, `object-fit: cover`, no gap, no overflow. Poster fallback and reduced-motion handling were already in place.

## 116. Changes
| Area | Result |
|---|---|
| Shared detail layout | `components/programs/ProgramDetailView.tsx`, `programs.css` (`.pg-std*`) — PASS: measured on the Qur'an program: desktop copy 573 px left, image 519 px right, title centred; at 375 px order title, introduction, image, content, CTA with no overflow |
| Trust Allocation Model | mobile only: three equal columns (`repeat(3, minmax(0, 1fr))`), smaller padding/icons/text; tablet and desktop CSS untouched. Measured: 280, 320, 375 and 430 px all single row, no card or page overflow; 900 px tablet still flex row |
| Live statistics | `/api/public/stats` (counts only, 30 s cache, 503 when the source cannot be read), `lib/catalog/stats.ts`; hero cards show "…" while loading and "—" when unavailable; refresh every 60 s while the tab is visible and on tab focus |
| Cases Completed definition | number of causes whose lifecycle status is Completed (the existing canonical completion state), each id counted once; reopened causes drop out; re-saving the same completion cannot double count (same id, one row) |
| Masjid Projects | open (Active or Urgent) Masjid Infrastructure projects |
| Students Sponsored | NOT IMPLEMENTED: the data model has no sponsorship record, so the card shows "—" rather than an invented number (blocker documented) |
| Category model | additive column `programCategory` (masjid, hifz, general) in `Program_Content`, derived for legacy rows (project to masjid, endowment to hifz, other to general); Masjid category is tied to the project template (and the Masjid-only update hold); Hifz and General do not inherit Masjid rules; schema registry updated |
| Admin | Programs screen has three experiences (Masjid Infrastructure, Qur'an Hifz, General Causes); Hifz new entries default to the endowment template; General and Hifz forms have a category selector |
| Public discovery | homepage: three carousels (desktop 3, tablet 2, mobile 1; first 12 per category; honest empty and unavailable states), each with View All to `/masjid-projects`, `/quran-hifz`, `/general-causes` (full listings, server-rendered from the cached public API); the long stacked per-program sections were removed; menu entries now link to `/programs/<id>`; sitemap lists the three routes |
| Diagrams | `docs/architecture/DAARAYN_ARCHITECTURE_D19.md` (admin and public flows, as implemented) |

## 117. Evidence
| Check | Result |
|---|---|
| Offline tests: categories (derivation, validation, API filter, unpublished hidden, invalid save stores nothing), statistics (Completed counted once, retries, reopen, failed save, Masjid count, Students null, 503 without numbers, counts-only body), template and homepage structure | PASS (`tests/d19-categories-stats.test.ts`, 10) |
| Live (isolated server, approved sheet, real admin session): the homepage was open at 15; an admin save of a new cause to Completed (twice, retry) moved it to 16 within 2 s of the page's refresh trigger (the automatic poll is 60 s) | PASS WITH LIMITATION (no push channel: public SSE is admin-only by design, so the open page polls) |
| Live: three carousels rendered from persisted data (Masjid 5, Hifz 1, General 72 published) with correct View All links, three cards visible at 1280 px, no overflow | PASS |
| Failed admin save leaves the count unchanged; source failure answers 503, never 0 | PASS (offline) |
| Admin Hifz tab, category selector and admin-to-public publication of a new Hifz program | PASS (offline save and API filter); admin screen not re-inspected visually |
| Tablet widths for detail pages, category listing pages at 280 px to 430 px, keyboard use of the new listing pages | NOT RUN visually (listing uses the existing card styles and a responsive grid) |
| Gallery / donation / hold behaviour | unchanged and covered by earlier evidence |
| Full suite | 46 files, 472 tests PASS; `tsc` 0 errors; eslint 0 errors (210 warnings); `next build` exit 0 (new routes listed); bundle scan 62 files, 0 hits (server bundles not scanned) |

## 118. Schema implication and blockers
New column `programCategory` on `Program_Content`: additive and idempotent (the app appends missing columns on first write; legacy rows read through the derived default). `Program_Content` is still MISSING in production, so the D18 migration blockers are unchanged and nothing was created there. Hifz needed no new worksheet: sponsorship, student records, recitation audio and teacher verification are NOT modelled; the Hifz category reuses programs, milestones sections, gallery and evidence media. Private student records, consent records and recordings are not stored by the platform today and must not be added to public content until a separate private store and consent process are designed (open owner decision).

## 119. Limitations and owner decisions
Students Sponsored needs a defined sponsorship record; the 90/10 wording and per-need funding stay open; `daaraynorg.com` hosting and OAuth steps stay blocked as in D18. Hero video: fixed seam verified by measurement and computed colours, not by a frame-by-frame visual review on every device. Production release remains NO-GO.


---

# ADDENDUM D19 (continued) — category listing alignment and master acceptance pass (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, about 150 uncommitted entries. No commit, push, deployment, production write, DNS, OAuth, credential or e-mail action; no real e-mail, OTP or campaign was sent (offline setup also mocks `nodemailer` itself; the Gmail and campaign live tests were not run). The build ran with the preview stopped; `.next` was removed and the preview restarted afterwards.

## 120. Category listing alignment (root cause and fix)
Root cause: the listing was a fixed three-column CSS grid, so one or two cards were anchored to the left of an empty row. Fix, one shared component and stylesheet for all three categories (`CategoryListing` + `.pg-list*`): a centred, wrapping flex row whose items use the same width as the carousel cards (3 per row, 2 on tablet, 1 on mobile). The number of published records decides the shape; nothing depends on a category or a count. The homepage carousel track also centres collections that fit (`justify-content: safe center`).
| Case | Evidence (rendered preview, isolated test data) | Result |
|---|---|---|
| 1 card, desktop 1280 | listing and homepage carousel: gaps 391/390 px (listing), 377/377 px (carousel, no arrows) | PASS |
| 2 cards | gaps 195/195 px, one row, equal heights | PASS |
| 3 cards | fill the row, equal heights, no gaps | PASS |
| More than fit (3 at 820 px) | two rows, the last card centred (200/200 px) | PASS |
| Mobile 375 and 280 px | single column, side margins preserved, no horizontal overflow | PASS |
| Unpublish and publish through the admin API | counts followed 1, 2, 3 and back to 2 with no redeploy | PASS |
| Empty category | intentional empty message, no dummy cards; unreadable source shows "temporarily unavailable" and is not shown as empty | PASS (offline render test); not seen live (no category was empty) |
Tests: `tests/category-listing.test.ts` (6). The two synthetic Hifz programs used were set to Inactive afterwards (records kept as evidence).

## 121. Master acceptance matrix (reuse of earlier evidence is stated; "rerun" means executed in this pass)
| Area | Evidence in this pass | Status |
|---|---|---|
| Repository and processes | branch, HEAD and ~150 uncommitted entries verified; no leftover test, build or server process besides the preview | PASS |
| Public routes | every internal link on the home page (26) answers below 400; listing routes `/masjid-projects`, `/quran-hifz`, `/general-causes`, `/privacy` exist and build | PASS |
| Hero video and seam | measured at 1440 x 900: hero 900 px, video 900 px `cover`, no gap; gradient now ends in the page colour (D19) | PASS WITH LIMITATION (measurement, not every device) |
| Three carousels, View All | rendered from persisted data (Masjid 5, Hifz 1, General 72 at the time; first 12 shown); View All links correct; arrows only scroll loaded cards | PASS |
| Shared detail template | Qur'an page measured: two columns on desktop, stacked in the approved order on 375 px | PASS (tablet and 280 px not inspected) |
| Live statistics | Completed count moved 15 to 16 within 2 s of the page's refresh trigger after an admin save; failed save leaves it; source failure 503 not zero; Students Sponsored shows a dash (no data model) | PASS WITH LIMITATION / NOT IMPLEMENTED (Students) |
| Qur'an Hifz | category, admin tab, template default, public carousel/listing/detail: PASS. Sponsorship records, student records, consent, recordings, teacher verification: NOT IMPLEMENTED (no private store exists; nothing is shown publicly) | PASS WITH LIMITATION |
| Masjid hold | rerun live: +0 and +6 days accepted, +8 refused, clearance with reason and audit; exact boundary with the frozen test clock: 7d minus 1 ms accepted, 7d accepted, +1 ms refused | PASS |
| Donation, designations, allocations, reversal, reconciliation (live, approved sheet) | rerun: eligibility incl. Completed/unknown cause refused, multi-cause unresolved then explicit split, independent recount 100/200/100 equals the app, passed in the run that did not hit the quota; two other runs failed at different steps because Google returned 429 until retries ran out (the application answered with an error and stored nothing partial). Logic is unchanged since the D17/D18 passes. | PASS WITH LIMITATION (quota) |
| Identical-key concurrency | rerun live: 5 instances, 1 donation row, 1 designation, same id for all | PASS |
| 6 simultaneous distinct donations (live) | failed this time on quota exhaustion; passed in D17 and D18 | PASS WITH LIMITATION (not reproduced this pass) |
| Communications, portal, field operations | offline suites pass (communications, portal auth/guard, field-and-sync); no real e-mail or OTP; live portal limits passed in D17; live campaign NOT RUN | PASS WITH LIMITATION |
| Drive, privacy, OAuth | no setting changed; D18 findings stand; privacy page vendor-neutral | BLOCKED on domain and owner actions |
| Dashboard / CRM live inspection in the browser | admin pages not re-inspected visually in this pass; APIs covered by live tests | NOT RUN |
| Failure handling | offline fault injection suites pass (quota, ambiguous writes, stale cache, allocation verification) | PASS (offline) |
| Known historical anomaly DA92484 (120 vs 100) | preserved, not repaired | PRESERVED |

## 122. Gates
Offline 47 files / 478 tests PASS; `tsc` 0 errors; eslint 0 errors (210 warnings); `next build` exit 0; bundle scan 62 files, 0 hits, key patterns 0 hits (server bundles and short values not scanned). Live isolated runs as listed above.

## 123. Observation: live quota is the practical limit
Running three live suites back to back (or the preview server polling at the same time) exhausts Google's 60 reads per minute per user; the application then retries with bounded backoff and fails honestly, so tests that pass in isolation can fail together. This confirms the capacity limit in D17 section 98; the supported workload is a few donations per minute.

## 124. Decision
PARTIALLY READY WITH NAMED BLOCKERS. Production release remains NO-GO: production worksheets and migration rehearsal, public domain and OAuth, Students Sponsored and Hifz private data design, quota capacity, 90/10 wording and per-need funding decisions.


---

# ADDENDUM D20 — Google Sheets quota remediation and reliability (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, about 153 uncommitted entries. No commit, push, deployment, production write, e-mail, OAuth or credential change. Live runs used only the approved test sheet through the write guard, serially, with the preview server stopped (`.next` removed after the build and the preview restarted).

## 125. Root cause (evidence)
Documented Google limits: 60 read and 60 write requests per minute per user per project; this platform uses ONE service account, so every instance and every test shares that budget. A project donation cost 11 to 12 reads and 7 writes (D17 to D19). Reads are what run out: roughly five such donations in a minute, or three live suites run together (or alongside the preview server's polling), exceed 60 reads and Google answers 429 "Read requests per minute per user" (text captured in the failed D19 runs). Nothing in the application paced its own requests, so concurrent callers released uncontrolled bursts; bounded retry then ran out. The failed D19 runs returned errors and stored nothing partial. All Sheets calls go through `SheetsService.call` except the realtime event log reads, which now use the same retry/pacing wrapper; the legacy sync client has its own client (no application caller).

## 126. Changes
| Item | Detail |
|---|---|
| Request-rate control (`lib/google/requestControl.ts`) | separate read and write budgets, per-minute rates with a small burst (GCRA scheduling), bounded wait, penalty of the whole budget when Google returns 429; defaults 45 reads and 45 writes per minute, burst 5, maximum wait 25 s (env: `GOOGLE_SHEETS_READS_PER_MINUTE`, `..._WRITES_PER_MINUTE`, `..._BURST`, `..._MAX_WAIT_MS`, 0 disables a budget) |
| Backpressure | a request that would wait longer than the maximum is refused before it is sent with a retryable "busy" error (`GoogleBackpressureError`, mapped to HTTP 503 by the existing handlers) |
| Retry (`withGoogleRetry`) | every attempt, first and retries, takes a slot; Retry-After honoured; truncated exponential backoff with full jitter; new maximum elapsed time (40 s default); exhausted retries throw the original error annotated `retryable`, `quotaExhausted`, `retriesExhausted`, `attempts`; appends are retried only after a definite 429, never after an ambiguous 5xx or timeout |
| Metrics (`lib/google/usage.ts`) | adds reads, writes, retries, total limiter wait to the existing counters (labels and numbers only; no values, ids or tokens); exposed by the existing admin diagnostics endpoint |
| Read coalescing (`SheetsService.getRowsWithNumbers`) | identical concurrent reads of one worksheet share one request, but only if that request started AFTER the last write finished, so a caller that just wrote can never receive an older snapshot |
| Batched fresh reads | donation to specific causes: Causes and Program_Content in ONE request (`readEligibilityFresh`); allocation: Donations, Donation_Causes, Allocations and Causes in ONE request. Both still read fresh from Sheets and refresh the repositories from those rows: no cached authorization |
| Cross-instance limiting | NOT IMPLEMENTED (BLOCKED on an infrastructure decision). The limiter state is shared by every route bundle of ONE process (globalThis). Separate server instances would each spend their own allowance. The backend is an interface (`LimiterBackend.reserve/penalize`); a shared store approved by the owner (for example a managed Redis/KV service) only has to implement it. No such infrastructure exists in this project, and a Google-Sheets-based limiter was deliberately not built. |

## 127. Request counts per workflow (live, approved sheet; before = D19, after = this pass)
| Workflow | Reads before | Reads after | Writes (unchanged) |
|---|---|---|---|
| New donation to a project, new donor | 12 | 11 | 7 |
| Same donor again | 10 | 9 | 7 |
| General donation | 7 | 7 | 6 |
| Rejected ineligible donation | 2 | 1 | 0 |
| Verification | 1 | 1 | 2 |
| Allocation | 6 | 3 | 2 |
| Rejected allocation | 4 | 1 | 0 |
| Dashboard / reconciliation | 2 / 1 | 2 / 1 | 0 |
Not reduced (kept for integrity): the donation-id claim protocol (three Donations reads, two updates) and the duplicate checks after the designation and donor writes. Estimates only: with a 45 per minute read ceiling and 9 to 11 reads per project donation the paced capacity is about 4 donations a minute from one process (writes: 45 / 7 = about 6); dashboards and other views use the same budget.

## 128. Offline results (`tests/quota-control.test.ts`, 15 tests, plus the updated cache, allocation and hold tests)
PASS: bounded exponential backoff with jitter and single logical effect after three 429s; Retry-After honoured; persistent 429 returns a structured retryable error after the attempt limit; the elapsed-time budget stops retries early; a definite 429 on an append is retried but an ambiguous 503 is not replayed; requests are paced (burst then one slot per interval), not released at once; three independent clients charge one limiter (protocol test with a shared test double, not proof of distributed correctness); read and write budgets are independent; a request that would wait too long is refused unsent; a 429 penalises the budget for all callers; metrics carry counts only; batching: one batched request for eligibility and one for allocation inputs while ineligible causes are still refused; identical concurrent reads coalesce into one request and a read that began before a write finished is not shared with a read after it. Existing evidence kept: identical concurrent donations (one row), distinct concurrent donations (unique ids), ambiguous write reconciliation, exhausted retries never create success (donation answers 503, nothing stored), reconciliation tests.

## 129. Live results (isolated, serial, preview stopped)
| Test | Result |
|---|---|
| A. Single financial chain (final-acceptance, 6 steps: eligibility, verification, allocation, replay, concurrency cap, reversal, multi-cause designation, independent recount) | PASS 6/6, no 429, no retry |
| B. Six concurrent independent donations (separate module instances sharing this process' limiter) | PASS: 6 accepted, 6 distinct ids, 6 intact rows, 1 donor; 51 reads, 41 writes, 0 retries, 0 HTTP 429, total 71 s; the limiter queued callers for 278 s in aggregate. Read rate: 51 reads in 71 s = about 43 per minute (under the 45 ceiling and Google's 60) |
| C. Idempotency (5 requests, one submission key) | PASS: 1 donation row, 1 designation, same id for all |
| D. Safe exhaustion (fake transport) | PASS (offline): persistent quota failure answers 503 retryable, nothing stored, no success reported |
| Per-workflow counts run | PASS: no 429 anywhere in this pass |

## 130. Limitations and release impact
- A burst of six donations takes about 70 s to drain at the 45 per minute ceiling. Production default maximum wait is 25 s, so beyond roughly four near-simultaneous donations callers are told "busy, retry shortly" (503) instead of hanging; this is the intended honest behaviour but it is a real capacity ceiling of this architecture.
- Separate instances are not coordinated (see section 126); a deployment with several instances needs the owner's decision on shared infrastructure, a higher Google quota, or a queue in front of donations.
- Google can still return 429 or 503; retries are bounded and failures are truthful, not eliminated.
- The limiter protects against Daarayn's own bursts only; other applications using the same service account would also consume the budget.
- Historical anomaly DA92484 (120 vs 100) untouched.
Status: request reduction PASS WITH LIMITATION (reads 12 to 11 on donations, 6 to 3 on allocations); in-process pacing and bounded retry PASS; cross-instance limiter BLOCKED (decision required); live verification PASS; production release remains NO-GO (production schema and migration rehearsal, domain and OAuth, owner decisions).

## 131. Gates
Offline 48 files / 493 tests PASS; `tsc` 0 errors; eslint 0 errors (212 warnings); `next build` exit 0; bundle scan 62 files, 7 secret-class variables by prefix, 0 hits, key patterns 0 hits (server bundles not scanned); preview restarted on the isolated launcher after the build.


---

# ADDENDUM D21 — Shared Google request limiter (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, all work uncommitted. No commit, push, deployment, production write, e-mail, credential or configuration change. Nothing was provisioned.

## 132. Infrastructure inspection
`vercel.json` present (serverless hosting likely); no Redis/KV/Upstash dependency, environment name or provisioned service exists in the project. Therefore no approved shared coordination infrastructure is available. Per the directive nothing was provisioned and no credentials were created.

## 133. Implemented (code ready, not enabled anywhere)
`lib/google/requestControl.ts`: `RedisRestLimiterBackend` (atomic GCRA reservation as one Lua `EVAL` using the store's clock, one key per budget (read, write) per Google service identity hash), `createBackendFromEnv` (shared only when both `GOOGLE_LIMITER_REDIS_REST_URL` and `..._TOKEN` are set), explicit failure policy (`fail_closed` default: request refused unsent with a retryable 503-class error; `degraded_local` opt-in with reduced share), 1.5 s timeout, 5 s cool-down, shared 429 penalty, `limiterStatus()` surfaced (no URL/token) in the admin readiness endpoint with a warning when process-local. Google Sheets is not used as limiter storage. Configuration and approval steps: `docs/ops/SHARED_LIMITER.md`.

## 134. Offline evidence (`tests/shared-limiter.test.ts`, 20 tests; local HTTP emulation of the coordinator, NOT a real Redis)
PASS: 3 independent clients x 8 simultaneous reservations share one budget (24 grants, spacing at least one interval, total span at least 23 intervals); contrast shows three process-local limiters would allow 3x; separate read/write keys; identity-hash keys; a 429 seen by one client penalises another; withGoogleRetry on the shared backend retries once with a single effect; outage, HTTP 500, timeout and wrong token all fail closed unsent; cool-down avoids hammering; degraded_local paces at 25%; status never exposes URL/token; a half-configured pair stays process-local; backpressure refusal works on the shared backend; 8 identical simultaneous donations through the coordinator = one donation and one designation; coordinator outage stores nothing and the replay after recovery creates exactly one; ambiguous append is never replayed blindly while a definite 429 is.

## 135. Live (isolated, serial, preview stopped, approved test sheet, limiter routed through the LOCAL EMULATED coordinator)
Six concurrent donations and five identical-key replays: 2/2 PASS. Six donations: 70 s, 51 reads, 41 writes, 0 retries, 0 HTTP 429, limiter wait 282 s aggregate; 153 coordinator reservation calls. This exercises the real Google path with the coordinator protocol over HTTP in ONE process; it is not a multi-instance run and not a real managed service.

## 136. Gates
Offline 49 files / 513 tests PASS; tsc 0 errors; eslint 0 errors; `next build` exit 0 (first attempt failed on a transient Google Fonts fetch, second passed); bundle scan 62 files: only hit is the public `NEXT_PUBLIC_FIREBASE_API_KEY` web identifier (public by design), 0 server secrets or private keys; `.next` removed and preview restarted.

## 137. Status
Code and offline protocol: PASS. Cross-instance enforcement in any real environment: **BLOCKED** — requires the owner to approve and provision a Redis-compatible REST service, set the secrets server-side, choose the failure policy, redeploy, and run a multi-instance live test. Until then separate instances are NOT coordinated. Production release remains NO-GO.

## 138. Preview visual verification after D20 (D21 session; http://localhost:3100, production build served by the isolated dev launcher; visual/measurement inspection, not functional tests)
Method: DOM measurements through the in-app browser at emulated widths (screenshots of emulated sizes larger than the pane are scaled and show black pane margin, so they are NOT used as evidence). Fresh tab: 0 console errors, all page requests 200/206. No production write, e-mail, commit or deploy.
| Check | Result |
|---|---|
| Styling (body rgb(3,10,6), Poppins, logos, fonts, no broken images) | PASS |
| Page-level horizontal overflow at 280, 320, 375, 430, 820, 1440 | PASS (scrollWidth <= viewport) |
| Three carousels; arrows on long collections; Hifz single card positioned inside the viewport (20 to 356 px at 375); arrow moved a track 352 px; View All links /masjid-projects, /quran-hifz, /general-causes | PASS |
| Live data (stats 21 / dash / 7, programs from Sheets) | PASS |
| Hero button "View Our Impact" at 280 and 320 px | FAIL: right edge 326 px, clipped (hero actions never wrap) |
| "Quick Donate" ribbon button at 820 px | FAIL: right edge 858 px, clipped; fine at 375, 1024, 1440 |
| Program detail pages (two programs tested at 375 and 1440) | PASS single column in both; two-column (image) variant NOT exercised: neither test program has a hero image (BLOCKED) |
| Hero video sizing/transition | NOT verified visually (video requests 206 OK) |
A stale console buffer from before the server restart showed `ScrollTrigger is not defined` (script.js:256) and refused connections; a fresh load showed none (not reproduced).


---

# ADDENDUM D23 (covers the D22 and D23 directives) — Shared limiter completion, quota-exhaustion recovery, UI defects (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, about 160 uncommitted entries, all work preserved. No commit, push, deploy, production write, DNS/OAuth change or communication. Live runs: approved test sheet only, serial, preview stopped, e-mail/Drive stubbed.

## 139. Hosting and shared-limiter configuration (inspected)
`vercel.json` exists and there is no single-process guarantee: serverless or multi-instance hosting is assumed, so process-local limiting is NOT an acceptable production design and `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true` must not be used there. `GOOGLE_LIMITER_REDIS_REST_URL` and `_TOKEN` are NOT configured (checked by presence only) and no approved shared service exists. Nothing was provisioned. Status: real distributed limiter NOT VERIFIED (BLOCKED on owner infrastructure).

## 140. Code changes
| Change | Detail |
|---|---|
| Production fail-safe | `limiterStatus()` reports `production`, `ready`, `reason`. With `GOOGLE_TARGET_ENV=production` or `VERCEL_ENV=production` and no shared coordinator (and no explicit single-instance decision) the readiness endpoint answers 503 `limiter_not_configured` and every Google request is refused UNSENT with a retryable error (`GOOGLE_LIMITER_NOT_CONFIGURED`). |
| Coverage | The legacy sync client (`GoogleSheetsClient`) and the readiness checks bypassed the limiter before; both now pass through the same read/write budget (one attempt; a 429 still penalises the shared budget). SheetsService, the realtime event log, readiness and the sync client are all inside the boundary. Drive has its own quota (not covered). |
| Metrics | Longest single wait and backpressure refusals (limiter busy, coordinator unavailable, not configured) are now counted. |
| Real-service verification | `tests/live/shared-limiter-real.live.test.ts`: three independent processes, throw-away key prefix, no Google calls. NOT RUN until the two variables exist. |
| Documentation | `docs/ops/SHARED_LIMITER.md` (production behaviour, lifecycle, compatibility to confirm, verification command). |

## 141. Offline evidence
`tests/shared-limiter-processes.test.ts` (5 tests): three independent OS processes (separate Node runtimes) x 8 requests against the LOCAL EMULATED coordinator: combined rate within the limit, a penalty from one process slows the others, a restarted process does not reset the budget, read and write budgets are independent, an outage makes every process refuse (fail closed). `tests/shared-limiter.test.ts` (24 tests incl. production fail-safe, legacy client charged, ambiguous append not replayed, identical donations one row, outage stores nothing and the replay creates one). These are EMULATOR tests, not live distributed verification.

## 142. Live financial results (approved test sheet, serial)
| Run | Result |
|---|---|
| Single chain (final-acceptance, 6 tests) | PASS, about 114 s |
| Six concurrent distinct donations, default 25 s maximum wait | PASS: 6/6 accepted, 6 distinct ids, 1 donor; 71 s; 51 reads, 41 writes, 0 retries, 0 HTTP 429; limiter wait 282 s aggregate, LONGEST SINGLE WAIT 9 s, 0 backpressure refusals. Legitimate requests are not rejected as busy at the default limit; the 70 s is queue drain at 45 per minute, not an overlong wait. |
| Five identical-key replays | PASS: 1 donation, 1 designation, one id |
| Controlled quota exhaustion and recovery | PASS: read budget exhausted: 503, 1 read, 0 writes, nothing stored; write budget exhausted after the first write: 503, no donation id returned, 0 donation rows left; replay of the same key with normal limits: 200, exactly 1 row, 1 designation, 8 reads, 6 writes, 0 429 (the backpressure counter printed 0 in this run because it was not yet wired; it was fixed afterwards and covered offline) |
| Per-operation counts (unchanged since D20) | new donation 11 reads / 7 writes, same donor 9/7, general 7/6, rejected donation 1/0, verification 1/2, allocation 3/2, rejected allocation 1/0, dashboard 2, reconciliation 1 |
No further request reductions were made this round: the remaining reads are the donation-id claim protocol and fresh eligibility checks, kept for financial integrity (no weakening to improve numbers). Capacity estimate (about 4 donations a minute from one budget at 45 reads a minute) still applies. No queue was added: the limiter already bounds waits honestly and Sheets must stay the only ledger.

## 143. UI (rendered preview; screenshots in `docs/audit/evidence-d22/`)
| Check | Result |
|---|---|
| "View Our Impact" at 280 and 320 px | FIXED, PASS (buttons stack, fully inside the viewport; root cause: non-wrapping flex row) |
| "Quick Donate" at 820 px | FIXED, PASS (root cause: three non-shrinking ribbon groups need about 850 px, the ribbon had 782; now wraps onto a second row; hero content padded so it does not cover the eyebrow) |
| Ribbon at 280 px | IMPROVED (the CTA moves to its own row; the cause name was cut to one letter) |
| 375, 430, 1440 px | PASS, unchanged layout; no page overflow at any tested width |
| Program detail with image (Family Relief) | PASS: desktop two-column (heading centred, text left, image right), mobile single column, CTA after content, no overflow |
| Detail pages without image (Masjid, Quran endowment) | captured; single column by design (screenshots saved, not individually reviewed) |
| Hero video | PASS WITH LIMITATION: plays (1920x1080), poster present, reduced motion hides the video and keeps the poster; on mobile the hero starts below the ribbon, leaving a faint tonal step to the page background (judged by eye, not measured) |
| Categories, carousels, View All, stats | PASS (D21 check; stats 23 / dash / 7 after the final build) |
| Console/network (headless captures) | 0 script errors, 0 HTTP errors; "ERR_ABORTED" entries are in-flight requests cancelled by the next navigation. A stale console buffer from server restarts showed refused connections (not reproduced on fresh loads) |
Regression guards: `tests/responsive-css.test.ts` (rule presence only; the screenshots are the visual evidence).

## 144. Gates
Offline 51 files / 526 tests PASS; tsc 0 errors; eslint 0 errors; `next build` exit 0 (run after the last code change); bundle scan: 62 files, only hit the public `NEXT_PUBLIC_FIREBASE_API_KEY` web identifier, 0 server secrets, 0 private keys (scan run before the final server-only metrics change; the client bundle is unaffected by it); `.next` removed and the preview restarted: styled (body rgb(3,10,6), Poppins, 3 carousels, no overflow).

## 145. Other readiness items
Admin dashboard/CRM visual review: BLOCKED (sign-in required; credentials must not be entered by the assistant). Production worksheet schema, migration rehearsal, domain/HTTPS, OAuth readiness, 90/10 policy, per-need Masjid funding, Students Sponsored definition, Hifz private data and credential actions: unchanged from D18 to D20 and still need the owner. Communication transport stayed stubbed; no e-mail or OTP was sent.

## 146. Decision
**READY AFTER SPECIFIED EXTERNAL SETUP.** Required before deployment: (1) approve and provision a Redis-compatible REST service per environment and set `GOOGLE_LIMITER_REDIS_REST_URL` and `_TOKEN` as server-side secrets; (2) run `tests/live/shared-limiter-real.live.test.ts` and the six-donation run with those variables set on every process; (3) the earlier owner items (production worksheets and migration rehearsal, domain/HTTPS, OAuth choice, financial policy). Without step 1 the application deliberately refuses Google requests in production.


## 147. Addendum D24 (2026-10-30): landing-page video visibility and View All backgrounds (owner screenshots)
Findings: the hero video was playing (1920x1080, readyState 4) but three stacked overlays (dark 0.45, side gradient up to 0.95, top 0.8) hid it, so the page looked like a dark background. On a portrait crop the dark centre of the frame was shown. The View All pages used the generic page gradient while the home sections use `.section` (Masjid, General) and `.section-alt` (Hifz).
Changes (CSS/TSX only, `app/redesign.css`, `components/programs/CategoryListing.tsx`): dark overlay 0.45 to 0.12; side gradient 0.6/0.05/0.3; top shading 0.45; text shadow on the hero text; mobile crop `object-position: 72% center`; the three View All pages now wrap their content in the same section class as the matching home section.
Evidence (`docs/audit/evidence-d24/`, headless Chrome at 375, 820 and 1440 px; 0 script errors, 0 HTTP errors): the video (Earth at night) is clearly visible on desktop; on mobile the lit part shows behind the text with the text still readable. Computed backgrounds: home Masjid and General sections rgb(7,17,31) equal their View All pages; Hifz rgb(13,23,38) with border equals its View All page.
Limits: the strip above the hero on mobile (ribbon area) is still the page colour by layout; the video is a visual judgement, not a measured contrast ratio. Regression: `tests/responsive-css.test.ts` (rules and class mapping), 15 related tests pass, tsc 0 errors. A full build and the full suite were not re-run after this CSS change; the dev preview was restarted (a stale Turbopack CSS chunk had left the page unstyled until the stylesheet was recompiled).


---

# ADDENDUM D26 (covers D24, D25 and D26) — Self-hosted coordinator hardened, live runs through it, admin review (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, about 175 uncommitted entries, all preserved. No commit, push, deployment, production write, DNS/OAuth change, credential change or communication. Live runs: approved test sheet only, serial, preview stopped, e-mail/Drive stubbed. The coordinator ran as a separate local process, NOT hosted.

## 148. Architecture decision (no Upstash)
Hosting is Vercel (serverless, many instances, one Google identity). Process-local limiting cannot protect that. Implemented, provider-neutral: (a) any Redis-compatible server over TCP (`GOOGLE_LIMITER_REDIS_URL`, own minimal RESP client), (b) any REST front end, (c) the self-hosted coordinator service `tools/limiter-server` (Dockerfile included). The reservation takes the identity slot and a project-level slot (`GOOGLE_SHEETS_PROJECT_*`, default 200 a minute, under Google's 300) in ONE atomic step; a 429 penalises both. Which host runs the coordinator is an owner decision; nothing is hosted or paid for.

## 149. Coordinator hardening (tools/limiter-server/server.cjs)
| Property | Implementation |
|---|---|
| Durable state | written (fsync, atomic rename) BEFORE a reservation is answered; a failed write refuses the request (503) and rolls the slot back |
| State loss | missing, unreadable or invalid state quarantines every budget for `LIMITER_QUARANTINE_MS` (default 75 000 ms: Google's 60 s window plus a 15 s margin; the earlier 15 s hold-off was NOT enough and was replaced). The quarantine is itself persisted so a crash loop cannot shorten it. The corrupt file is kept as evidence. `LIMITER_ACCEPT_EMPTY_STATE=true` skips it only for a deliberate first start |
| Single authority | exclusive lock file with heartbeat; a live instance on the same host or a fresh heartbeat refuses a second instance; a dead owner is taken over. Instances on different disks cannot see each other: max instances = 1 is a hosting setting (documented) |
| Access | token of at least 24 characters required to start; all quota requests authenticated; HTTPS enforced when `LIMITER_REQUIRE_HTTPS=true`; `/health` and `/ready` expose no secret |
| Package | `tools/limiter-server/Dockerfile`, `docs/ops/LIMITER_SERVICE_DEPLOYMENT.md`, variable names in `.env.example` |
| Application side | production without a shared limiter: readiness 503 and every Google request refused unsent; all Sheets paths (SheetsService, event log, readiness, legacy sync client) pass through the limiter |

## 150. Offline evidence
Full suite 52 files / 547 tests PASS; tsc 0 errors; eslint 0 errors. `tests/limiter-server.test.ts` (17 tests, real separate processes): three client processes share one budget; restart with intact state; missing state quarantined and /ready reports it; corrupt state quarantined and kept; quarantine survives a restart; hard kill during concurrent reservations loses no granted slot; restart while callers wait; storage failure refuses and recovers; duplicate reservations get distinct slots; second instance refused; shared 429 penalty; outage fails closed and recovers; auth and HTTPS; short token refused. `tests/shared-limiter*.test.ts` and `tests/quota-control.test.ts` cover the client side, the project budget and the TCP path (local RESP emulator).
One defect found by a test run and fixed: after a hard kill the lock file remained and blocked the restart for 15 s; the lock now detects a dead owner on the same host.

## 151. Live results (approved test sheet, serial, limiter routed through the local coordinator process)
| Test | Result |
|---|---|
| A. single financial chain (6 tests) | PASS, 115 s |
| B. six concurrent distinct donations | PASS: 6/6, 6 distinct ids, 1 donor; 70 s; 50 reads, 41 writes, 0 retries, 0 HTTP 429; limiter wait 280 s aggregate, LONGEST SINGLE WAIT 10 s (limit 25 s), 0 refusals |
| C. five identical-key replays | PASS: 1 donation row, 1 designation, one id |
| D. controlled exhaustion | PASS: read budget exhausted: 503, 1 read, 0 writes, nothing stored; write budget exhausted after the first write: 503, no id returned, a PENDING placeholder remained; first replay 409 (placeholder younger than 20 s, retryable); next replay adopted it: 200, exactly 1 row, 1 designation, 0 429 |
Attempt history (not hidden): the first D25 run of test D failed with 409 because the test replayed 5 s after the cut, inside the designed 20 s adoption window; the expectation was wrong, not the code. The test now retries on 409. A later run produced a 200 on the first replay (no placeholder left). One PENDING placeholder from the failed first attempt remains in the TEST sheet and the admin dashboard reports it as an integrity warning (correct behaviour).
Request cost per workflow is unchanged since D20 (project donation 11 reads / 7 writes, same donor 9/7, general 7/6, rejected 1/0, verification 1/2, allocation 3/2, rejected allocation 1/0): the remaining reads are fresh eligibility and the donation-id claim protocol and are kept for financial integrity.

## 152. Admin dashboard and CRM review (signed in by the owner, test sheet)
PASS WITH FINDINGS (pages rendered in the mobile-width preview pane; text and layout inspected, no state changed, nothing sent): Dashboard loads live data and reports 1 integrity error (the PENDING placeholder above) and 23 warnings (historic `T-LIVE-*` test donations pointing at the missing test donor DNR-TEST); the cause table lists test data. Donors/CRM: 106 donors, filters by period, segment and cause, verified badges. Communications: audience picker over 143 causes; Masjid and Hifz programs are labelled GENERAL in the audience list (labels do not yet reflect the three categories) — finding, not changed. Programs: three tabs Masjid Infrastructure (7), Qur'an Hifz (3), General Causes (133). Reconciliation: 4 interrupted donations (DA92477, DA92527, DA92526, DA92533, outstanding designations/notification/audit) offered with a Recover action; NOT run (it writes), and these are test-sheet leftovers from cut-off runs.

## 153. Visual verification
Screenshots saved under `docs/audit/evidence-d26/` (headless Chrome, 280/320/375/430/820/1440 and the Masjid, Hifz and Relief detail pages). The Turbopack dev preview repeatedly served stale or incomplete stylesheets after restarts (unstyled pages, a Google-font resolution error page); screenshots taken from it were discarded as invalid. The final evidence is from the production build served with `next start` on the isolated test configuration. Findings recorded in section 154.

## 154. Gates
`tsc` 0 errors; eslint 0 errors; `next build` exit 0 (one earlier attempt this pass exited 1 with output not captured, a later one passed); bundle scan 62 files: only hit the public `NEXT_PUBLIC_FIREBASE_API_KEY` web identifier, 0 server secrets, 0 private keys, 0 coordinator tokens; `.next` was rebuilt for the production preview.

## 155. Status and decision
| Item | Status |
|---|---|
| Coordinator package (hardened, tested as separate local processes) | PASS WITH LIMITATION (not hosted) |
| Real hosted coordinator reached from Vercel; multi-instance Vercel run | NOT RUN (no host) |
| `tests/live/shared-limiter-real.live.test.ts` | NOT RUN |
| Production worksheets, migration rehearsal, domain/HTTPS, OAuth, financial policy, Students Sponsored | unchanged, owner action required |
**READY AFTER SPECIFIED EXTERNAL SETUP.** Exact external actions: (1) host ONE coordinator instance with a durable disk and HTTPS per `docs/ops/LIMITER_SERVICE_DEPLOYMENT.md` and choose the token; (2) set `GOOGLE_LIMITER_REDIS_REST_URL` and `GOOGLE_LIMITER_REDIS_REST_TOKEN` on Vercel for every environment (separate approval to redeploy); (3) run the real-service live test and the six-donation run against it; (4) the earlier owner items. Until (1) to (3) the shared limiter is not production-verified and production deliberately refuses Google requests.


---

# ADDENDUM D27 — Hosting inspection, communications category fix, final verification (2026-10-30)

State: branch `feat/daarayn-pre-release-hardening`, HEAD `5332409`, all work uncommitted and preserved. NOT committed, NOT pushed, NOT deployed, no production write, no e-mail, no DNS/OAuth/credential change.

## 156. Coordinator hosting (the mandatory step): BLOCKED, not performed
Inspected this machine: no Vercel CLI, no Fly, Railway, Render, Docker, gcloud, aws, az or Cloudflare tooling, no logged-in hosting account, no `.vercel` project link. The only deployment-related credential is `VERCEL_OIDC_TOKEN` in `.env.local` (a short-lived project token); it was NOT used, because Vercel functions cannot host the coordinator (no durable disk, no single persistent process) and nothing authorises changing the Vercel project from it. Therefore: coordinator NOT hosted, Vercel server-side limiter variables NOT set, real shared-limiter tests NOT RUN, deployed readiness NOT CHECKED, six-donation run through a hosted coordinator NOT RUN. No simulated result is reported as live verification.
Smallest viable options (approximate cost, to be confirmed by the owner before any purchase): (1) a small Compute Engine VM in the existing Google Cloud project `daaraynorg-9165c` (an e2-micro may fall in the free tier in some US regions; otherwise a few dollars a month) with a persistent disk, run as one systemd service behind HTTPS; (2) a Fly.io machine with a 1 GB volume (roughly 2 to 4 dollars a month); (3) any small VPS (roughly 4 to 6 dollars a month). Each needs ONE always-on instance, a durable disk, HTTPS and the token as a platform secret, exactly as in `docs/ops/LIMITER_SERVICE_DEPLOYMENT.md`. The authoritative application variables are `GOOGLE_LIMITER_REDIS_REST_URL` (HTTPS URL of the coordinator) and `GOOGLE_LIMITER_REDIS_REST_TOKEN` (same value as the service's `LIMITER_TOKEN`); `GOOGLE_LIMITER_REDIS_URL` is only for a real Redis server and must not be combined with them.

## 157. Fixes in this pass
| Item | Result |
|---|---|
| Communications audience labels | FIXED and verified in the rendered admin page (signed-in session): 7 Masjid Infrastructure, 3 Qur'an Hifz, 133 General Causes, matching the Programs tabs (labels come from the Programs data; causes that are not programs keep their own category) |
| Untraced browser console error | NOT REPRODUCED: 19 captures of the production build (home at 280/320/375/430/820/1440, three category pages, three detail pages, carousel section) show 0 console errors and 0 failed requests; the earlier single error was captured while the dev server was serving a broken font module |
| Masjid "no update recorded" note | PASS: note aligned with its card (screenshot `evidence-d27/masjid-detail-1440.png`) |
| Single-card category page | PASS: the Qur'an Hifz card is centered (`hifz-list-1440.png`) |
| Detail layouts | PASS: desktop two-column with image, mobile stacked with the CTA after the content (`relief-detail-1440.png`, `relief-detail-375.png`) |
| Hero video, hero buttons at 280/320 px, quick-donate at 820 px | PASS (screenshots in `evidence-d27/`) |
Screenshots are from the production build served with `next start` on the isolated test configuration; the Turbopack dev preview was unreliable (stale stylesheets) and its captures were discarded.

## 158. Interrupted test donations and the placeholder (read only; nothing deleted or recovered)
From the reconciliation API on the test sheet: DA92477 and DA92527 status pending with designations, notification and audit outstanding; DA92526 and DA92533 partial with designations outstanding; one STALE_PLACEHOLDER (`PENDING`). All are test leftovers from cut-off quota and concurrency runs. They are retained as evidence; recovery must use the approved test-data recovery procedure and was not run. The 23 other warnings are historic `T-LIVE-*` donations pointing at the absent test donor DNR-TEST.

## 159. Gates
Offline 52 files / 547 tests PASS; tsc 0 errors; eslint 0 errors; `next build` exit 0; bundle scan 62 files: only the public `NEXT_PUBLIC_FIREBASE_API_KEY`, 0 server secrets, 0 private keys, 0 coordinator-token patterns. The live financial suites (single chain, six concurrent donations, replay, exhaustion and recovery) were last run in D26 through the LOCAL coordinator process and passed; they were not repeated in D27 because no code on the financial path changed and the only open item is the hosted coordinator.

## 160. Production readiness
Production worksheet schema, migration rehearsal (needs an approved production-equivalent copy, none available), domain and HTTPS, OAuth verification, financial-policy decisions, Students Sponsored definition, Hifz private data: unchanged, owner action required; no production write was attempted.

## 161. Decision
**READY AFTER SPECIFIED EXTERNAL SETUP.** No deployment was made. Exact next boundary: the owner chooses and authorises one hosting option above (or supplies access to one), then: host the coordinator, set the two variables on Vercel, run `tests/live/shared-limiter-real.live.test.ts`, the six-donation, replay and exhaustion runs against it, check the deployed readiness endpoint, rehearse the production migration, then commit, push and deploy with explicit authorisation.


## 162. Deployment attempt (owner instruction: "deploy on vercel") — PREVIEW deployed, PRODUCTION NOT deployed
Done: reviewed the 242 changed paths (credential files are gitignored and untracked; secret scan of the changed files found only fake test fixtures; `.claude-flow/` tooling state was deliberately NOT committed); committed everything else as `742e065` (237 files) and pushed ONLY the branch `feat/daarayn-pre-release-hardening` (not `main`). The Vercel Git integration for project `arklintech/daarayn-ngo` built it: deployment `dpl_AkvWwmyqzyeHPLtgJf1wLNtKmLK3`, a PREVIEW deployment, status success, URL https://daarayn-m8bl1b2iu-arklintech.vercel.app (publicly reachable, no deployment protection).
Not done and why: no Vercel CLI or account access exists on this machine, so no environment variable was read or set, no coordinator URL/token was configured, and nothing was promoted to production (production would need a merge to `main` or a promotion, which is deliberately withheld: the release gates are not met).
Smoke test of the preview (read-only GETs): `/` 200 (page renders, no Masjid/Hifz projects listed), `/masjid-projects` 200, `/api/public/stats` 200 with zero counts, `/api/programs` 200 returning five legacy seed programs, but `/api/causes`, `/api/admin/programs` and `/api/admin/diagnostics/google-readiness` answer HTTP 500 (an unhandled error page rather than the expected 401/503 JSON). Cause could not be determined without the Vercel runtime logs or environment settings; the most likely explanations are missing or different server-side environment variables on the Preview target (Google credentials, Firebase Admin) and the production spreadsheet lacking the worksheets this release needs (already a recorded blocker). The shared-limiter mode of the deployment could not be checked because the readiness endpoint cannot be reached without an administrator session on that deployment.
Status: deployment of the BUILD is verified (it compiles and serves pages on Vercel); the DEPLOYED INTEGRATION (Sheets-backed routes, limiter, readiness) is NOT verified and currently returns 500 on several routes. Production remains NOT deployed. Required next: owner (or access for me) to read the Preview environment variables and runtime logs of `daarayn-ngo`, host the coordinator, set the two limiter variables for the target environment, then re-run the smoke test and the live suites.


---

# ADDENDUM D29 — Google Sheets reliability, priorities, governance, capacity (2026-10-30)
Full report: `docs/audit/D29_GOOGLE_SHEETS_RELIABILITY_REPORT.md` (also `D29_PERMANENT_RELIABILITY_PLAN.md`, `D29_CAPACITY_AND_LOAD_TEST_REPORT.md`, `D29_FAILURE_MODE_AND_RECOVERY_MATRIX.md`, runbooks in `docs/ops/D29_*`, evidence in `docs/audit/evidence-d29/`). Uncommitted; nothing deployed.
Implemented: request priority P0 to P3 with atomic admit-or-refuse; rolling 60 s measurement; coordinator `/metrics`, validation, bounds and constant-time auth; quota alert evaluator and admin route; CI guard against Sheets calls outside the limiter; the maintenance script that bypassed the limiter fixed.
Tests: offline 55 files / 573 PASS; tsc 0; eslint 0; build 0; bundle scan clean. Live (test sheet, local coordinator): 12 simultaneous donations 12/12, 0 429, longest wait 15 s; allocation contention 6 x 30 against 100 gave total 90 (3 admitted, 3 refused).
NOT VERIFIED: hosted coordinator, Vercel connection, independent Vercel instances, real Google quotas, alert configuration, 5x burst, transactional allocation guarantee (optimistic protocol only; single-writer design not built).
**Status: READY AFTER SPECIFIED EXTERNAL SETUP** (not certified as permanently hardened).


---

# ADDENDUM D30 — Architecture resolved, serialised allocations, load and failure tests (2026-10-30)
Reports: `docs/audit/D30_PRODUCTION_INFRASTRUCTURE_REPORT.md`, `D30_ALLOCATION_CONCURRENCY_REPORT.md`, `D30_CROSS_INSTANCE_ACCEPTANCE_REPORT.md`, `D30_CAPACITY_AND_FAILURE_TEST_REPORT.md`; runbooks `docs/ops/D30_FINAL_DEPLOYMENT_RUNBOOK.md`, `D30_MONITORING_AND_INCIDENT_RUNBOOK.md`; evidence `docs/audit/evidence-d30/`. Uncommitted; nothing deployed or provisioned.
Architecture: the "Redis REST" adapter and the "HTTP coordinator" are the same thing: Vercel posts commands to the Daarayn coordinator (one VM, own disk); no Redis in the selected design. Variables renamed to `GOOGLE_LIMITER_URL` / `GOOGLE_LIMITER_TOKEN` (old names kept as aliases). Correction to D29: Production and Preview must share the same key prefix while they share the Google project.
Allocation: per-donation lease with a strictly increasing token held by the coordinator, self-fencing before the write, production pause until `ALLOCATION_SERIALIZATION_VERIFIED=true`. Offline 2/6/12/20 competitors and live (test sheet, local coordinator) 2/6/12/20: no violation, no surplus row, audit consistent, 0 429; dead-worker and stale-worker cases pass. NOT a transaction; storage-level fencing is not possible with Sheets.
Load (local coordinator, test sheet): 20 simultaneous donations 19 accepted, 1 retryable refusal; 30 simultaneous 19 accepted, 11 retryable refusals, identical quota consumption (162 reads, 132 writes), 0 429, 0 duplicates, 0 placeholders.
New: `/api/ops/quota-status` for an external monitor (200/503 at 70/80/90 percent), priority-starvation and latency tests, coordinator leases (6 process tests).
Gates: 57 files / 597 tests PASS; tsc 0; eslint 0; build exit 0 (a first attempt exited 1 while other network activity ran, the repeat passed); bundle scan clean (public Firebase key only).
NOT VERIFIED / NOT DONE: hosting, Vercel Preview configuration, independent Vercel invocations, real Google quotas, alert configuration and delivery, production migration, domain, OAuth, owner policies.
**Status: READY AFTER SPECIFIED EXTERNAL SETUP.**


---

# ADDENDUM D31 / D32 — Infrastructure inspection, real-build multi-instance run, production restriction (2026-10-30)
Reports: `docs/audit/D31_*.md` (6), `docs/audit/D32_*.md` (4), runbooks `docs/ops/D31_*.md` (4) and `D32_*.md` (3), deploy files `tools/limiter-server/deploy/`, evidence `docs/audit/evidence-d31/`. Uncommitted; nothing provisioned, deployed or published.
Blocked by missing access: no gcloud, Vercel CLI, Docker or logins; the OIDC token in `.env.local` is expired and is not a deploy credential; `daaraynorg.com` has no DNS. So: coordinator NOT hosted, Preview NOT deployed with the current code, independent Vercel invocations NOT VERIFIED, alerts NOT CONFIGURED, Production NOT deployed.
Done: backend conflict guard; Preview-only probe route and acceptance driver; global 429 alert; financial activation switch (production starts with donations, donation changes and allocations paused); onboarding validator; VM deployment files; three instances of the real production build against a local coordinator (one budget, priority protected, fail closed on stop, recovery after restart and SIGKILL, quarantine after state loss).
Findings: Google Fonts fetch makes `next build` fail intermittently (retry works; self-hosting fonts recommended); Production and Preview must share one key prefix.
Gates: 60 files / 612 tests PASS; tsc 0; eslint 0; build exit 0; bundle scan clean.
**Status: READY AFTER SPECIFIED EXTERNAL SETUP.**


## 163. Addendum D33 (2026-10-30): hero video behind the mobile navbar
Finding (owner report, confirmed): on phones the navbar and the quick-donation ribbon sit above the hero scene in the normal flow, so the video started below them and a black band showed behind the navbar. Fix (CSS and one wrapper, no logic change): `app/page.tsx` wraps `GlobalHeader` and `HeroSection` in `.hero-with-header`; at 768 px and below the wrapper is the positioning context of the video layer, so the video covers the header area as well; lighter shading, `object-position` 36 % (the cloud and day/night part of the frame) and a small brightness lift on the video; the navbar and ribbon stay above it. Desktop is unchanged. Evidence: `docs/audit/evidence-d33/` (280, 320, 375, 430, 820, 1440 px; 0 console errors, no horizontal overflow); the video is clearly visible behind the navbar, the ribbon and the headline at 375 and 430 px. Visual judgement by inspection, not a contrast measurement; the video content varies over its loop.

## D34 (hero video clarity)
The hero video looked blurred because the 2.4 MB low-bitrate file was served first. The 1080p high-bitrate master is now the default; the small file is used only for save-data or 2G/3G connections. No 4K source exists in the repository: `public/hero-video-4k.mp4` is used automatically on screens of 2560 px or wider if the owner supplies one (suggested 3840x2160 H.264/H.265 at about 8 to 12 Mbps, keeping the 1080p master). The 33 MB master is heavy on mobile data. Desktop at 1440 px was checked visually (evidence-d34/home-1440.png); the 375 px capture was taken but its sharpness was not separately assessed.

## D35 (performance and reliability audit)
See `docs/architecture/` and `docs/testing/`, `docs/operations/production-readiness-gaps.md`. Two financial-control defects were reproduced by failing tests and fixed (status change with active allocations; completion write overwriting an admin verification); designation changes now share the allocation lease. Verdict: NOT READY.
