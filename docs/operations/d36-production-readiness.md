# D36 production readiness

Date 2026-10-31. Supersedes nothing: `production-readiness-gaps.md` (D35) is preserved and still applies. Labels: VERIFIED / LIVE (approved test spreadsheet only) / EXTERNAL.

## 1. Release verdict: **NOT READY**

Not "ready after specified external setup": three hard gates would still be open after the external setup that is possible today.

1. **Capacity gate FAILS.** LIVE: 6 simultaneous donations took 68 s and 12 took 142 s against a 60 s function limit; 0 of 18 finished in time. At the documented per-user quota (60 reads per minute) at most 7 can; the 12/20/30 targets need 1.8x to 6.5x that. The remedy is a quota decision or a queued-intake design, both owner decisions.
2. **Stale-writer prevention is not provable under Google Sheets** and the lease that mitigates it has never run on Vercel with a hosted coordinator.
3. **No Vercel Preview and no real-quota acceptance** has been performed.

## 2. What is verified at this point

| Area | Status |
|---|---|
| Offline suite, TypeScript, lint, production build | see section 5 (final run) |
| Financial controls added or closed in D35 and D36 | status-away-from-verified refusal; lost-update protection; designation serialisation; all status changes under the lease (two administrators: 12 of 12 exactly one winner); compensating reversal retried, explicit and detected; first-run designation write proven by 9 case tests; duplicate audit write removed |
| Request cost | -35% since D35; LIVE: 7 + 4 (returning) / 9 + 5 (new donor, partly cold) |
| Data integrity under real Google bursts | LIVE N=6 and N=12: no duplicate id, no PENDING row, no missing designation |
| Production safeguards | `FINANCIAL_ACTIVATION_APPROVED` and `ALLOCATION_SERIALIZATION_VERIFIED` unset; production refuses to run without a coordinator; write guard restricts writes to approved targets |

## 3. Blockers, owners and dependencies

| # | Requirement | Owner | State / dependency |
|---|---|---|---|
| B1 | Host the coordinator within the "no paid infrastructure" constraint, or approve an alternative for leases | owner + engineering | **open**. The only coordinator that exists is the repository's program; every host considered is excluded by the constraints. Proposed (not built): lease claims stored as rows in the sheet itself, using the same append-order protocol as the donation claim, which needs no host but needs its own design and test campaign |
| B2 | Quota: read the real values, request an increase, decide on billing for exceeding quota | owner | **external**; proposal in `d36-google-sheets-capacity-plan.md` section 5 |
| B3 | Decide queued intake with explicit donor-facing states (RECEIVED -> ID_ASSIGNED -> COMPLETE) if the quota is not enough | owner | needs a decision on what the donor sees and when |
| B4 | Vercel access, Preview deployment, cross-instance acceptance, real P50/P95/P99 | owner (access) + engineering | blocked: no Vercel access here |
| B5 | Alert delivery: a recipient and one proven delivered alert | owner | endpoints exist, delivery not configured |
| B6 | Stale-writer limitation accepted in writing, or a design that removes the need (queued single-writer finaliser) | owner | F-1 in `d36-financial-consistency-review.md` |
| B7 | Domain, DNS, TLS, OAuth consent publishing, authorised domains, privacy page | owner | no DNS records (HISTORICAL) |
| B8 | Production worksheets, backup copy and restore rehearsal; onboarding validator is ready | owner | not done |
| B9 | Owner financial policies (rounding, refunds, reversal authority) | owner | not recorded |
| B10 | Spreadsheet permissions: restrict editors, protect financial ranges | owner | not done; humans can bypass every control |
| B11 | Fix F9 (formula injection through `USER_ENTERED` in the Donations and Donors tabs) and F4 (shared rate limiter on the donate route) | engineering | proposed, not done; F9 needs its own test campaign |
| B12 | Commit the work; the revision must equal the revision tested on Preview | owner authorises | 100+ changed paths uncommitted |
| B13 | Decision on "Khidr": the instructions say preserve, the repository records its removal | owner | nothing reintroduced |

## 4. Security and operations review

| Area | Finding | State |
|---|---|---|
| Authentication and authorisation | admin routes use `requireAdmin`; donor routes verify a session; the unauthenticated routes were each read in D35 (public by design, token or signed-cookie protected, or 410) | OK |
| Google API scopes | the service account requests full `spreadsheets` and full `drive`. Drive access is limited by what is shared with it, but the scope is broader than needed; an OAuth-approved folder mode exists (`driveOAuth.ts`) | **gap**: narrow to `drive.file` or the OAuth mode before production |
| Credentials | key file (gitignored) or environment variables; no secret printed or committed this session (a masked email and a project id were printed) | OK |
| Principal and quota | one service account serves every operation, so a single runaway job can exhaust the identity's quota for everything | **risk**; the shared limiter and priorities exist but have no hosted coordinator |
| Input validation | donate route validates amount, contact, cause selection; text written with `USER_ENTERED` can become a formula (F9) | gap |
| Rate limits | per-instance in-memory limiter on the donate route (F4) | gap |
| Replay protection | donation submission keys; no replay protection on admin PATCH beyond `expectedStatus` | partial |
| Audit logging | one atomic, awaited audit record per donation; status changes audited after the change; audit write failures are non-fatal for status changes | partial |
| Monitoring and alerts | `/api/ops/quota-status`, quota-health, coordinator `/metrics`; delivery not configured | gap |
| Health and readiness | exist; a healthy endpoint is not proof that financial operations are safe (documented) | OK |
| Backup and restore | version history and coordinator state backup script exist; no rehearsed restore | gap |
| Pricing exposure | exceeding the Sheets quota is planned to become billable; the application deliberately stays under its own budget (45 of 60) | owner to check billing |

## 5. Gates of the final run

| Gate | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0, 0 errors |
| `npx vitest run` | 65 files, 646 tests, all passed (D35 follow-up: 63 files, 629) |
| `npx eslint .` | 0 errors, 215 warnings (214 before; the extra one is an unused variable in the new live test file) |
| `npx next build` | exit 0 on the first attempt |
| Live suites on the approved test spreadsheet | R1 cell typing PASS; per-operation counts PASS; burst N=6 and N=12 integrity PASS, 60 s window FAIL |
| Preserved D35 baseline `request-baseline.json` | byte-identical to `request-baseline.D35-final.json` |

## 6. Next actions in order

1. Owner: read the real quota values, check billing, submit the quota request (B2).
2. Owner decision on B1 and B3 (coordinator host without paid infrastructure; queued intake or not).
3. Engineering, if B3 is "yes": design the queued intake with the same uniqueness verification once per batch; test campaign; no change to the current path until then.
4. Owner: Vercel access (B4); then the Preview runs listed in `d36-live-acceptance-results.md`.
5. Engineering: F9 and F4 with tests (B11).
6. Owner: B5, B7 to B10, B12, B13; only then production deployment, data onboarding (separate stage) and financial activation.
