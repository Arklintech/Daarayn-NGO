# R1 to R3 request reduction report (D35 follow-up)

Date 2026-10-31. Scope: exactly R1, R2 and R3 as specified in `docs/architecture/google-sheets-request-inventory.md` section 5. No other optimisation was added. Preserved baseline: `docs/testing/evidence-d35/request-baseline.json` (identical copy `request-baseline.D35-final.json`, never overwritten; stage files are separate). Environment of every measurement: in-memory fake Sheets, 0 to 4 ms random delay per call, request limiter off, one Node process. **Latencies are relative only and say nothing about Google.** Nothing was deployed, committed or pushed; no production data was touched; no new service account or infrastructure; Apps Script and the coordinator are untouched.

Outcome in one line: **R1 implemented. R2 and R3 stopped, not implemented, because each can only be done by weakening a financial-correctness guarantee.** The binding quota is reads, and R1 does not reduce reads.

## 1. Preserved D35 fixes (re-verified after every stage)

| Fix | Test | Result |
|---|---|---|
| A donation with active allocations cannot be rejected (HTTP 409 under the allocation lease) | `tests/financial-bypass-probe.test.ts` (B, B2) | pass |
| `saveAtRow` writes only operational fields (no lost update of an admin verification) | same file, lost-update probe | pass |
| Designation reduction serialised under the allocation lease | `recordDesignation` runs in `withDonationBalanceLock`; contention tests | pass |
Request prioritisation (P0/P1/P3 wrappers), retry policy, idempotency keys, permanent donor and donation id algorithm, allocation correctness checks and the audit records are unchanged; `tests/request-governance.test.ts` and `tests/quota-governance.test.ts` pass.

## 2. R1: batch the independent follow-up appends

Specification: combine the independent follow-up appends into one `spreadsheets.batchUpdate` with `appendCells`; prove header mapping, row order and cell typing on a test spreadsheet; keep per-step failure reporting.

**Deviation from the specification, stated plainly:** the donor append is not independent (the donation id and `donorId` depend on it and it is followed by its own uniqueness read), so it stays a separate request. The batch covers the three truly independent appends: cause relationships (Donation_Causes), admin notification, audit record. The realtime event append goes through the broadcaster (a separate path) and was not touched (outside the stated scope).

Implementation: `SheetsService.appendRowsToTabs` (one request, atomic, quota-only retry like every append, same sheet and header handling as `appendRows`); `prepareAppend`/`noteAppended` on `BaseRepository`; `missingOf`/`prepareRows`/`settleAfterAppend` on the designation repository; `donationService` step 4 to 6 became one `recordsStep`. The designation duplicate check after the write and the fresh "which designations are missing" read are kept.

Live proof (approved test spreadsheet only, throw-away tab, removed afterwards; about 5 requests): `tests/live/r1-appendcells.live.test.ts`: 23 app-shaped values (ids, ISO timestamps, JSON, numbers, booleans, empty, long text) are stored identically (type and formatted text) by `values.append` USER_ENTERED and by `appendCells`. 8 awkward strings differ **by design**: USER_ENTERED turns dates, fractions, percentages, scientific notation, leading-zero and "+" numbers into numbers and `=...` text into a **formula**; `appendCells` keeps them as literal text. This closes a formula-injection path for these three tabs and is a behavioural change.

Behavioural changes (all intended, all tested):
1. **Atomicity.** Before, notification, audit and designations could fail independently; now they succeed or fail together. A failed request leaves all three pending (`opPending = designations,notification,audit`); `recoverDonation` completes them idempotently (`tests/donation-batched-followups.test.ts`, scenario H in `tests/operations.test.ts` updated to this expectation).
2. If the designation READ fails, notification and audit are still written and only `designations` stays pending (test).
3. Cell typing for ambiguous strings (above).
4. Appends land after the last row with data (appendCells) instead of the end of the contiguous table (values.append); this only differs when a sheet has blank rows in the middle.

R1 results (specific-cause donation, 2 causes): see section 6. Tests: 5 new targeted tests, full suite 63 files / 628 tests, tsc 0, at the R1 gate.

## 3. R2: merge the id algorithm's first read into the claim read, drop a verification read: STOPPED

Reads of `Donations` in one donation (measured): 4 = initial key check, locate-and-compute after the claim append, post-write uniqueness verification, plus the `saveAtRow` re-read that the lost-update fix requires.

- The specification itself says the post-write uniqueness check **must stay**, which leaves only "merge the first read into the claim read". That removes the pre-check that decides idempotency **before anything is written**.
- Measured property today: a replayed submission performs **0 writes** (`duplicateRetry`: 3 reads, 0 writes). After the merge a replay would have to append a claim row and clear it again (2 extra writes per replay), and a replay arriving while the first attempt is stale would find its own claim next to a dead `PENDING` row of the same key. The adoption of that stale row (the recovery mechanism for a killed request, `PENDING_ADOPT_AFTER_MS`) lives in the pre-check; it would have to be rewritten inside the verification loop. Until it is, a killed first attempt would make that submission key unrecoverable ("still being processed" forever).
- Benefit: one read of about fourteen (7%), small against a rewrite of the most delicate id logic.

This weakens the idempotency guarantee (replays stop being write-free) and risks the recovery path. Per the instruction (stop and report when a reduction weakens financial correctness) **no code was changed for R2.** A correct implementation would need its own design and a dedicated concurrency test campaign; it is not a safe 6% win.

## 4. R3: read the donor once (find and verify): STOPPED

Measured donor reads per donation: **new donor 2, returning donor 1** (`oneDonationSpecificCause` vs `oneDonationReturningDonor`, evidence in `request-baseline.R3-evidence.json`). For a returning donor the donor is already read once. The second read for a new donor is the verification after the append: it detects the same person created by two instances at once (the earliest row wins and the later row is cleared) and token collisions. Removing it would allow duplicate donor profiles for one person and a non-unique permanent Donor Token. That is a financial-identity guarantee, not a redundant read. **No code was changed for R3.**

## 5. The binding constraint did not move

| Resource | Baseline | After R1 |
|---|---:|---:|
| Reads per specific-cause donation | 9 | 9 |
| Writes per specific-cause donation | 7 | 5 |
| Sustained donations per minute at the configured 45 reads / 45 writes | 5.0 (read-bound) | 5.0 (read-bound) |
| ... at Google's per-user limit 60 / 60 | 6.7 | 6.7 |

R1 cut writes by 29% but writes were not the limiting budget. **Donation throughput is unchanged by R1.** The earlier estimate of "about 30% fewer requests" counted writes and reads together; the quota that binds is reads.

## 6. Measured comparison

Per-operation counts (fake Sheets; one counted call = one Google request; realtime event-log traffic and SMTP are not included):

| Operation | Baseline R / W | After R1 | After R2 | After R3 | Final |
|---|---|---|---|---|---|
| Donation, specific cause | 9 / 7 | 9 / 5 | not implemented (9 / 5) | not implemented (9 / 5) | **9 / 5** |
| Donation, general | 7 / 6 | 7 / 5 | same | same | **7 / 5** |
| Donation, returning donor (new measurement) | n/a | 8 / 4 | same | same | 8 / 4 |
| Replay of a recorded donation | 3 / 0 | 3 / 0 | same | same | 3 / 0 |
| Allocation | 2 / 2 | 2 / 2 | same | same | 2 / 2 |

Concurrent donations (fake Sheets, final run; all succeeded, 0 duplicate ids, 0 leftover placeholders). Relative latency, milliseconds, fake network only:

| N | Baseline reads / writes | Final reads / writes | Requests per donation (baseline -> final) | P50 / P95 / P99 baseline | P50 / P95 / P99 final |
|---:|---|---|---|---|---|
| 12 | 108 / 84 | 108 / 60 | 16.0 -> 14.0 | 283 / 298 / 298 | 285 / 316 / 316 |
| 20 | 184 / 142 | 192 / 106 | 16.3 -> 14.9 | 252 / 330 / 362 | 298 / 606 / 653 |
| 30 | 270 / 210 | 348 / 189 | 16.0 -> 17.9 | 283 / 284 / 285 | 307 / 1087 / 1101 |

Under concurrency the read count depends on timing (id-collision retries). Three runs of the same harness gave 9.0 (R1 stage, idle CPU), 11.4 (run during the production build) and 11.6 (final run) reads per donation at N=30; writes were always lower than the baseline. The relative P95/P99 at N=20 and 30 rose in the runs that had more collision retries; this is a fake-network artefact of retry timing, **not a measured Google latency**, and it must be re-measured live before any latency claim. Stage files: `request-baseline.R1.json`, `request-baseline.R3-evidence.json`, `request-baseline.final.json`.

Coordinator calls: one limiter reservation per Google request (donation: equals the request count above; allocation: 4 plus 3 lease calls). No coordinator exists, so none were measured; the number follows the code.

## 7. Can 12, 20 and 30 concurrent donations finish within 60 seconds?

**No. The in-memory runs prove integrity, not quota capacity.** Arithmetic from the measured counts and the verified budget (identity 45/45 per minute, burst 5; Google 60/60 per user, 300/300 per project; function limit 60 s):

| Concurrent donations | Reads needed | Read quota per minute needed to finish in 60 s | Minutes at 45 / 60 reads per minute | Writes needed (after R1) |
|---:|---:|---:|---|---:|
| 12 | 108 | 103 | 2.4 / 1.8 | 60 |
| 20 | 180 | 175 | 4.0 / 3.0 | 100 |
| 30 | 270 | 265 | 6.0 / 4.5 | 150 |

At most **5** concurrent specific-cause donations can finish inside 60 s at the configured budget (7 at Google's 60 per minute per user). The workloads 12/20/30 need 1.7x, 2.9x and 4.4x Google's per-user read limit. The only levers that reach them are capacity levers (a quota increase, more identities, a project limit that applies across identities), which are outside this task (no new service accounts). Requests are queued, not refused, so an over-capacity burst ends with function timeouts and placeholder rows that the existing recovery repairs; that behaviour has not been exercised at scale on real infrastructure.

Variance: request counts under concurrency depend on timing (id-collision retries): see the spread above; treat 9 to 12 reads per donation as the realistic range.

## 8. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0, 0 errors |
| `npx vitest run` (final) | 63 files, 629 tests, all passed |
| `npx eslint .` | 0 errors, 214 warnings (unused variables, none from this work) |
| `npx next build` | exit 0 on the first attempt |
| R1 live cell-typing comparison (approved test spreadsheet, about 5 requests) | pass: 23 app-shaped values identical, 8 awkward strings differ by design |
| Preserved baseline `request-baseline.json` | byte-identical to `request-baseline.D35-final.json` |

## 9. What would actually help (not implemented, listed so nothing is lost; each needs its own review)

1. Read reductions that keep every correctness read: the designation pre-read (`missingOf`) is redundant on the first run of a brand-new donation id because the post-append duplicate check already covers races; skipping it on that path would save one read. Not implemented: outside R1 to R3 and it touches the recovery idempotency contract.
2. Capacity: a Google quota increase and/or additional identities (owner decision).
3. Move the unavoidable work off the donor's request (accept the donation, finish follow-ups asynchronously) once a safe queue exists.

## 10. Release verdict: NOT READY

Unchanged. No deployed Vercel acceptance and no real Google Sheets quota or concurrency test has passed (the only live activity was a 5-request cell-typing comparison on the approved test spreadsheet).
