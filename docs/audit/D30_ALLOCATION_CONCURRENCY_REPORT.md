# D30 Allocation concurrency report

## 1. The problem
Two allocation commands that read the same balance can both pass the "fits within the designated amount" check. A request-rate limiter does not help: the quota counter is not a financial lock. Before D30 the service relied on an OPTIMISTIC protocol: write the allocation row, read back, and reverse its own surplus rows when the total exceeded the designation (the earliest rows win). That protocol is not an exclusive lock and not a transaction: a crash or a refused compensation write between the write and the reversal leaves an over-allocation until a person reconciles it.

## 2. What D30 implements (read from the code)
| Element | Implementation |
|---|---|
| Resource | one lease per donation id: `alloc:<donationId>` (all designations of that donation are inside it) |
| Exclusive ownership | `lib/google/allocationLease.ts` `withLease`: acquire (jittered polling up to `ALLOCATION_LEASE_WAIT_MS`, default 25 s, then a retryable 503 "another allocation is being processed"); release in `finally` |
| Where the lease lives | the shared coordinator (`LEASE acquire/check/release`, persisted before the answer, in the same state file as the quota budgets); a per-process table exists ONLY for tests and non-production environments without a coordinator. In production without a coordinator the lease backend throws (no per-process fallback) |
| Fencing token | strictly increasing per resource, `max(last + 1, now)` so it also increases across restarts and state loss; a lease and its token survive a coordinator restart; `check` is true only for the CURRENT token before expiry |
| Lease duration | 75 s by default, longer than the 60 s `maxDuration` that the allocation route now declares: the platform kills a function at its maximum duration, so a worker cannot keep writing after its lease could have expired (an in-flight network write may still land within seconds: a bounded-delay assumption) |
| Stale-worker protection | SELF-FENCING: immediately before the append the worker calls `check` and refuses to write unless at least `ALLOCATION_LEASE_MIN_REMAINING_MS` (20 s) of its lease remain; an unreachable coordinator counts as "not valid" |
| Quarantine rule | after a coordinator state loss no lease is granted for the quarantine period, which is never shorter than the longest lease (`LIMITER_MAX_LEASE_MS`), so a holder from before the loss cannot work alongside a new holder |
| Idempotency | stable `requestKey`; the idempotency lookup happens INSIDE the lease on fresh data, so duplicates return the original allocation and never write a second row |
| Read-after-write | the existing post-write verification (prefix total, duplicate-key detection) stays as the backstop |
| Audit | `CREATE_ALLOCATION` audit row per allocation, none for refusals |
| Block switch | in production `createAllocation` answers 503 "paused" unless `ALLOCATION_SERIALIZATION_VERIFIED=true`; the owner sets it only after the Preview verification (live allocations stay blocked until then) |

## 3. What is NOT claimed
- Fencing is NOT enforced by the storage: Google Sheets cannot reject a write that carries an old token. The design prevents stale writes by deadline discipline plus the platform's function limit, not by rejection at the storage layer. The word "fencing" here means the monotonic token plus the pre-write validity check.
- This is mutual exclusion under bounded-delay assumptions. A function whose request to Google is delayed for longer than the remaining safety margin could in theory still land a write after its lease passed; the post-write verification would then detect and reverse the surplus, as before.
- It is not a transaction across worksheets and does not make Sheets atomic.
- Reversals (`reverseAllocation`) are not leased: they only change a status to reversed (idempotent) and cannot cause over-allocation.
- The coordinator holds only lease records (resource id, worker id, token, expiry); it is not a ledger.
- One more limit: the lease is per donation. Constraints that span several donations (a cause total, for example) are not serialised; none exists in the current rules.

## 4. Test evidence
| Test | Level | Result |
|---|---|---|
| 2, 6, 12 and 20 simultaneous allocations of 30 against 100, random 0 to 6 ms latency before and after every sheet request (`tests/allocation-serialization.test.ts`) | TESTED LOCALLY | every case: exactly min(n, 3) recorded, the rest refused with 409 before any write, rows == active rows (no surplus row, no system reversal), balances correct, one audit row per allocation and none for refusals |
| 20 simultaneous submissions of ONE request key | TESTED LOCALLY | exactly ONE allocation row (not one plus nineteen reversed duplicates), one audit row |
| Worker died holding the lease | TESTED LOCALLY | the next command waits for expiry, proceeds, the earlier row is counted, 60 + 60 > 100 refused |
| Worker stalled past its lease (timeout) | TESTED LOCALLY | A reads, stalls 700 ms with a 400 ms lease; B acquires with a new token and writes; A's pre-write check fails and A writes NOTHING (503) |
| Caller waits too long for another holder | TESTED LOCALLY | retryable 503, nothing written |
| Different donations independent | TESTED LOCALLY | |
| Production pause | TESTED LOCALLY | paused without `ALLOCATION_SERIALIZATION_VERIFIED`, nothing read or written |
| Coordinator leases: exclusivity, strictly increasing tokens, wrong token cannot release, expiry takeover, persistence across restart, no lease during quarantine, invalid arguments | TESTED ACROSS PROCESSES (real coordinator process) | 6 tests pass |
| Three independent processes repeating the same lease | TESTED ACROSS PROCESSES | 12 exclusive intervals, no overlap, tokens increasing in use order |
| LIVE on the approved TEST spreadsheet, real Sheets latency, coordinator process on this machine | TESTED ACROSS PROCESSES (one machine) | x2: both admitted (60 of 100); x6: 3 admitted, 3 refused (409), total 90, 16 s, 10 reads, 6 writes; x12: 3 admitted, 9 refused, total 90, 29 s, 16 reads, 6 writes; x20: 3 admitted, 17 refused, total 90, 45 s, 24 reads, 6 writes; in every run 0 system-reversed rows, audit rows equal active allocations, 0 retries, 0 HTTP 429 |
| LIVE interrupted worker | TESTED ACROSS PROCESSES | a never-released lease (3 s) was waited out (5 s), then the allocation was recorded |
| Coordinator restart while a lease is held | TESTED ACROSS PROCESSES | lease and token survive; a successor receives a higher token |
| Real Vercel invocations | NOT VERIFIED | |

The older optimistic tests were kept; one expectation was updated (`tests/operations.test.ts` J2): the losing command now writes nothing instead of a row reversed by "system".

## 5. Decision
Allocation concurrency is NOW SERIALISED per donation and exercised under 2, 6, 12 and 20 competitors both offline and live without any violation, with interruption, timeout, restart and duplicate cases covered. It is NOT certified as a transaction. Release rule: live allocations in production stay BLOCKED (`ALLOCATION_SERIALIZATION_VERIFIED` unset) until the same tests are repeated on Vercel Preview against the hosted coordinator and the evidence is accepted. If that verification fails or the coordinator is not hosted, allocations simply stay paused (donations are unaffected).
