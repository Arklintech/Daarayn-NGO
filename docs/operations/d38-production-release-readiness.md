# D38 production release readiness

Date 2026-11-01. Labels: SOURCE, OFFLINE, LIVE (real Google, approved test spreadsheet only, one machine, not Vercel), PREVIEW (not run), DOC, ESTIMATE, OWNER. This file extends `d36-production-readiness.md` and `production-readiness-gaps.md`, which are preserved.

## 1. Verdict: **READY FOR CONTROLLED PREVIEW TESTING**, conditional on the owner actions in section 5. Not production ready.

The queued intake, its Vercel Queues trigger, the donor status page, the admin queue screen and the recovery paths are built, isolated (flag off by default; the direct path is untouched) and tested OFFLINE and, for the Sheets side, LIVE. **Nothing has been run on Vercel**, so a Preview acceptance verdict cannot be given. Every item that decides production readiness and has no evidence is listed in section 4.

## 2. What changed in D38

| Track | Result |
|---|---|
| A cold intake | 1 read + 1 write cold and warm (was 3 + 1): eligibility and the intake header contract in one `batchGet`; RAW literal append; schema version contract checked on every request, fail closed |
| B quota | sliding-window limiter (burst when idle, never more than the limit in a window), in the coordinator and client behind `GOOGLE_LIMITER_ALGORITHM=window`; default unchanged. A live run found dispatch jitter that a 60 s window cannot absorb; the default window is now 62 s |
| C Vercel Queues | wake-up only (no donor data), per-bucket and per-source idempotency keys, delayed coalescing, private consumer, handoff, reconciliation, application-level dead letter, retry policy; SDK `@vercel/queue` 0.10.0, documented options only |
| D Vercel facts | checked: no CLI, no login, no `.vercel`, `vercel.json` minimal; plan, Fluid Compute, region and Queues access NOT VERIFIED |
| E financial | canonical-record rule (a stale-worker copy is never counted); cutover and rollback procedure; allocation review (no change, allocations stay paused) |
| F experience | `/donate/status` (reference lookup, no personal data, no polling) and `/admin/queue` (counts, ages, lists, requeue and redispatch, audit-first), `/api/ops/queue-status` for an external monitor |
| G findings | re-verified below |
| H Preview | not run; kit prepared (`deploy/vercel.d38-preview.json`, `scripts/preview-d38-acceptance.mjs`, steps in `d38-vercel-preview-acceptance.md`) |

## 3. Gates

Final run, 2026-11-01, on the uncommitted working tree:

| Gate | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0, no errors (the 3 errors CLAUDE.md records are no longer reported) |
| `npx vitest run` | 74 files, 754 tests, all passed |
| `npx eslint .` | 0 errors, 216 warnings (pre-existing style class, unused variables) |
| `npx next build` | exit 0; new routes `/admin/queue`, `/api/intake/{accept,status}`, `/api/internal/intake/reconcile`, `/api/ops/queue-status`, `/api/queues/intake-finaliser` present |
| LIVE boundary (62 s window, real Google, approved test sheet, local coordinator, not Vercel) | 90 reads, 0 x 429, 0 retries, max 45 dispatched in any 60 s, burst 1 in 1.3 s, burst 2 held 62.2 s |

Load-sensitive tests: `tests/concurrent-entities.test.ts` (D18) and `tests/limiter-server.test.ts` (D26, a 175 ms versus 180 ms tolerance) each failed once in an earlier full run under load and passed repeatedly in isolation (6 of 6, 3 of 3); they passed in the final full run. They are timing tolerances, not regressions, and are named here so a recurrence is recognised.

## 4. Remaining findings, re-verified against the code (not trusted from reports)

| ID | Finding | Status after D38 |
|---|---|---|
| F4 | `/api/donate` and `/api/intake/accept` use the in-memory per-instance rate limiter (`lib/security/rate-limiter.ts`) | **OPEN**: a shared limiter needs shared state (the coordinator), which has no host |
| F9 | formula injection | **CLOSED for the writes the application makes**: `USER_ENTERED` paths neutralise `= + - @ TAB CR`; the new paths are literal (RAW or `appendCells`/`updateCells`); tested (`tests/formula-injection.test.ts`, intake tests). A person typing into the sheet is outside the application |
| Scopes | the service account requests full `spreadsheets` and full `drive` | **OPEN**: narrow to `drive.file` or the OAuth-folder mode before production |
| Spreadsheet permissions, protected ranges, backup and restore rehearsal | not done | **OPEN (OWNER)** |
| Stale writer (allocations) | no storage-level fencing under Sheets | **UNPROVEN and unprovable under the locked architecture**; allocations stay paused |
| Stale writer (intake and finalisation) | convergence, tested | resolved by design; no fencing claimed |
| Queue trigger | none can be demonstrated without Vercel | built, offline-tested, **not run** |
| Alert delivery | `/api/ops/queue-status` and `/api/ops/quota-status` return 200/503 for an external monitor; no recipient configured, no alert delivered | **readiness only; delivery NOT VERIFIED** |
| Domain, DNS, TLS, OAuth consent publishing, authorised domains, privacy page | not verified | **OPEN (OWNER)** |
| Financial owner policies | not recorded | **OPEN (OWNER)** |
| Khidr | the instructions say preserve, the repository records its removal; nothing reintroduced | **OPEN (OWNER decision)** |
| Mutation check of the audit-first guard | the script failed on output decoding on this machine; the file was restored and its test passes | the guard is tested; the planned red-by-mutation proof was NOT completed |

## 5. Owner actions and decisions (exact)

1. **Vercel access** (CLI login or token) and a Preview-only project; confirm the plan, Fluid Compute, function region, that Queues is available, the included Queues operations and that no usage-based billing is enabled without your approval. Then run `d38-vercel-preview-acceptance.md` section 3 and record the results.
2. **A hosted coordinator** (the only way to share the limiter and the finaliser lease across instances) under the "no paid infrastructure" constraint, or accept Preview without a shared limiter and record 429s. Apps Script as the host is still unmeasured (D36: DEFER).
3. **Quota**: read the real values in the Cloud console, check billing and submit the quota request (D36 capacity plan section 5). Acknowledgement is now cheap (1 read each); completion is bound by 45 reads per window: 30 donations need about 49 reads, about 63 s end to end.
4. **Donor wording and timing** for RECEIVED, the donation number and the final confirmation (D37 section 8); whether `/api/intake/accept` replaces the donate form's target (a separate reviewed change not made here).
5. **Cutover and rollback** approval (`d38-donation-finaliser-worker-design.md` section 3): direct path paused and drained before the queued path starts; never both creating ids.
6. Spreadsheet editors and protected ranges, narrower Google scopes, backup and restore rehearsal, alert recipient, domain and OAuth, financial policies, the Khidr decision.
7. Commit authorisation: the working tree holds all D29 to D38 work (about 140 changed paths) and nothing is committed or pushed.

## 6. What must not be claimed

Not production ready; not Preview-accepted; no result from Vercel exists; the real quota is unknown; queue delivery timing and cold starts on Vercel are unmeasured; allocation safety is unproven; no alert has been delivered.
