# Financial consistency review (D35)

Date 2026-10-31. Google Sheets is not a transactional database: an atomic batch update does not make a read-check-write workflow transactional. This review states what the code does, what the tests show, and what is not guaranteed. Labels: VERIFIED (code or test run this session), HISTORICAL, ASSUMPTION, PROPOSED, RISK.

## 1. Trace of a donation (VERIFIED, `lib/services/donationService.ts`, `lib/repositories/donationRepository.ts`)

1. `POST /api/donate`: financial pause check, per-instance rate limit, form parse, `runWithPriority("P0")`.
2. Validate amount and contact; `submissionKey` = client value or a fresh server key.
3. Read eligibility FRESH from Sheets (one batched read for a specific cause, otherwise causes only); never from cache.
4. Upload the payment proof to Drive first. On failure nothing is written, unless the same key already has a finished donation (a retry gets the original answer).
5. Find or create the donor (`findOrCreateByContact`, one permanent donor token per person).
6. `createWithUniqueId`: scan for the key; append a placeholder row (`PENDING`, claim marker); re-read; locate own row by the marker (the row number Google reports for an append is not reliable under overlap, observed live and reproduced by the fake); compute `DA` + highest finished number + 1 + in-flight placeholders above; write the final row; re-read and require exactly one row with that id; retry with jitter on collision (bounded attempts); a row for the same key above means a duplicate: clear own row and return the winner.
7. In parallel: designations (idempotent `createMissing`), admin notification, audit record, realtime event, donor email. Each records its own failure.
8. Final write (`saveAtRow`) of the follow-up state: `complete` only if every step succeeded, otherwise `partial` with the pending list; recovery (`donationRecovery`) finishes the pending steps idempotently.
9. Response states `complete` or `partial`; it never reports a confirmed donation before the canonical row is confirmed.

Properties relied on: the id is unique by after-the-fact verification (no atomic increment exists); duplicate suppression depends on the submission key; follow-up writes are not atomic with the donation row, hence the explicit `opStatus`/`opPending` fields.

## 2. Trace of an allocation (VERIFIED, `lib/services/allocationService.ts`)

1. `POST /api/admin/allocations` (P0). Refused 503 in production unless `ALLOCATION_SERIALIZATION_VERIFIED=true`.
2. `withLease("alloc:<donationId>")`: acquire from the coordinator (token strictly increasing, TTL 75 s, wait up to 25 s, otherwise 503 "busy").
3. Read donations, designations, allocations, causes FRESH in ONE batched request; reject unless the donation exists once, is verified, the cause is open, a recorded designation exists; pre-check `already + amount <= designated` in integer paise.
4. Upload evidence to Drive first; failure creates no allocation.
5. Self-fencing: `lease.stillValid(20 s)` immediately before the write; a coordinator that cannot answer counts as "not valid" and the worker does not write.
6. Append the allocation row (own id `ALLOC-...`, `requestKey`).
7. Post-write verification: re-read; the id must appear exactly once; the earliest row of a key wins and later same-key rows are reversed by the system; the prefix total up to this row must not exceed the designation, otherwise this row is reversed and the caller gets 409. A read failure after the write reverses the row as a system action and tells the caller plainly if even that fails.
8. Audit record (failure logged, not fatal), realtime event.

Recovery: an expired lease is taken over with a higher token; after coordinator state loss no lease is granted for 75 s (`LIMITER_MAX_LEASE_MS`), so a holder from before the loss cannot overlap with a new holder (TESTED in `tests/limiter-server.test.ts`, passed this session).

## 3. Required properties

| # | Property | Status | Basis |
|---|---|---|---|
| 1 | No duplicate financial operation for the same idempotency key | **Holds when the key is supplied**; not when omitted | donation: `submissionKey` tests (`donation-duplicate-proof`, concurrent-entities) pass; allocation: `requestKey`. Server fallback key is fresh per request (finding F5). Offline only. |
| 2 | No allocation beyond the authoritative balance | **Holds offline for competing allocations; two bypass paths found and closed** | `allocation-contention` (2/6 competitors, 10 randomised trials each) passed. F2 (status leaves verified with active allocations) reproduced by a failing test, fixed. F1 (designation lowered concurrently) closed by serialising under the same lease; the race was not reproduced pre-fix in 15 trials, so this is closure by construction. Not proven on deployed infrastructure. |
| 3 | No false success before required writes are confirmed | Holds by construction | donation row confirmed before any success; follow-ups reported as `partial`; allocation post-verified. F3: if the compensating reversal itself fails the raw error is returned and the surplus row stays active. |
| 4 | No reuse of an expired or abandoned reservation | Holds under the stated assumptions | TTL (75 s) exceeds the function limit (60 s); quarantine after state loss; tokens monotonic. TESTED with real coordinator processes. Not deployed. |
| 5 | No stale worker may commit after losing authority | **Not guaranteed by storage; mitigated** | see section 4 |
| 6 | No competing financial write path bypasses the control | Holds for code paths after D35 | only `allocationService` writes `Allocations` (search); `Donations` writes are in `donationRepository`. Human editors of the sheet bypass everything (F7). |
| 7 | Every accepted financial operation is traceable | Mostly | audit rows are written after the financial row and are non-fatal; a lost audit write leaves a financial row without an audit record (visible as `pending: audit` for donations through `opPending`; for allocations only in the log). |
| 8 | Failure produces a safe, explainable outcome | Holds for the tested failures | below |

## 4. The fencing limitation (stated plainly)

A lease is not a storage-level fence. Google Sheets cannot reject a write that carries an old token, so a stale writer **cannot be rejected by the storage**. Stale-write prevention in this design is:
1. lease TTL (75 s) longer than the platform's function limit (60 s), so a worker is terminated before its lease can expire;
2. the worker refuses to write when less than 20 s of the lease remain, and when the coordinator cannot confirm the lease;
3. the post-write verification, which detects and reverses a cap violation after the fact.

This is mutual exclusion under a bounded-delay assumption (the platform really stops the function at its limit; clocks differ by far less than the margins). It is **not** a transaction. A write already handed to Google at the moment of termination can still be applied later. If the lease was acquired at the start of the invocation it has 15 s (75 s minus 60 s) left to cover that in-flight write; a lease acquired later has more; a request that Google applies after the lease has expired is not covered by any mechanism in this design. Whether Vercel enforces the 60 s limit as configured has not been verified on a real deployment.

## 5. Failure scenarios (TESTED offline unless marked)

| Scenario | Result |
|---|---|
| Duplicate submissions, same key | one row; later calls return the original (`duplicate: true`) |
| 12/20/30 simultaneous donations | all recorded, 0 duplicate ids, 0 placeholders left (fake Sheets, collisions retried) |
| Competing allocations on one balance | active total never exceeds the designation (10 randomised trials, 2 and 6 competitors) |
| Timeout after an uncertain write | donation: retry with the same key returns the recorded donation; allocation: same key returns the earlier row. Live-API behaviour of an uncertain write is HISTORICAL (D26 to D30) |
| Worker killed mid-donation | placeholder row is adopted after the stale threshold or the recorded partial row is repaired by recovery |
| Coordinator terminated | requests and leases fail closed (real-process tests, HISTORICAL for the hosted case) |
| Admin changes status while a donation request is still finishing | F8: previously reverted to `pending`; fixed and tested |
| Admin changes status away from verified with active allocations | F2: previously allowed; now 409 |
| Concurrent administrators on the same donation status | `expectedStatus` compare-and-set, read-then-write, **not atomic**; two admins can both pass the check in a narrow window. Mitigation PROPOSED: serialise all status changes under the lease (costs 3 coordinator calls per status change). |

## 6. What is NOT proven

- Any of the above on deployed Vercel instances against the real Google API and a real coordinator (none exists).
- Throughput under quota: at the configured budget a 12-burst of donations needs about 2.4 minutes of read budget against a 60 s function limit (see the audit, section 4). Under that load the donation path degrades into queueing and function timeouts, which the placeholder/recovery design is meant to survive but which has not been exercised at that scale.
- Concurrent administrator status changes (above).
- Backup/restore of the spreadsheet as an integrity control.

**Verdict on financial readiness: not declared.** The invariants are enforced as strongly as the locked architecture allows and are tested offline; they are unproven on infrastructure, and the coordinator that allocations depend on has no host.
