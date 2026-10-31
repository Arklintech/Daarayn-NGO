# D36 financial consistency review

Date 2026-10-31. Extends `financial-consistency-review.md` (D35), which is preserved. Labels: VERIFIED (code or test this session), TESTED (offline fake), LIVE (real Google, approved test sheet), EXTERNAL.

## 1. Atomicity that Google Sheets does provide, and what it does not

| Mechanism | Atomic? | Used for |
|---|---|---|
| One `values.append` / `values.update` / `clear` | yes, one range | single rows |
| `spreadsheets.batchUpdate` (appendCells, several tabs) | yes, all requests or none | the three follow-up appends (D36 R1) |
| A read followed by a write | **no** | every check-then-write in the app |
| Two requests from different callers | **no ordering guarantee beyond arrival order of appends** | all concurrency control |
| A conditional write ("only if the row still equals X") | **not available** | so a stale writer cannot be rejected by storage |
| Cross-request transactions | **impossible** | donation (several requests), allocation (check, write, verify) |

Everything below is therefore built from: append order as a total order (claim rows), write-then-verify, a lease for mutual exclusion under bounded delay, idempotency keys, explicit partial states and recovery. Where none of these can give a guarantee, it is stated.

## 2. Failure model per mutation

| Mutation | Controlled path | Failure model and recovery | Residual limitation |
|---|---|---|---|
| New donation | `createWithUniqueId` (claim, locate, write, verify), submission key | killed after the claim: stale `PENDING` adopted after 20 s; killed after the final row: replay returns it, `opStatus` shows pending steps, recovery repeats them idempotently; uncertain append: not retried blindly (quota errors only) | the donor must resend with the same key; a client that sends none gets none of the duplicate protection |
| Follow-ups (designations, notification, audit) | one atomic request, then a duplicate check | batch fails: all three pending, recovery completes; check fails: designations pending | conflicting rows are never auto-resolved |
| Permanent donor id | find, append, verify, earliest row wins | two instances: the later row is cleared, both get the earlier donor | none known |
| Allocation | lease `alloc:<donation>` + fresh batched read + pre-check + self-fencing + append + post-write verification | stale or killed worker: lease outlives the function (75 s vs 60 s); over-cap detected after the write and reversed; reversal is **retried 3 times** and, if it still fails, the error names the row and says it is ACTIVE; reconciliation reports `ALLOCATION_EXCEEDS_DESIGNATION` | see section 4 |
| Allocation reversal | read, write, idempotent | repeat is safe | not serialised; it only lowers the allocated total |
| Designation change | now under the same lease; refuses below active allocations | lease busy: 503 retryable | the whole-row rewrite can still be overwritten by a human editor |
| Donation status change | **every** change under the lease; expected status compared on a fresh read inside it; leaving "verified" refused while allocations are active | lease busy: 503 `BUSY` with `Retry-After`; stale expectation: 409 `STATUS_CHANGED` | whole-row write (below) |
| Completion write after follow-ups | re-read, write only operational fields | row moved or missing: explicit error, donation stays recoverable | +1 read |

## 3. The three D35 findings

### F-1 Storage-level stale-writer prevention: **UNPROVEN and cannot be proven under the locked architecture**
Google Sheets cannot reject a write that carries an old token. What exists instead, and its assumptions: (1) lease TTL 75 s exceeds the function limit 60 s, so a worker is terminated before its lease expires; (2) the worker refuses to write when under 20 s of the lease remain or the coordinator cannot confirm it; (3) the allocation's own post-write verification and the cap check detect and reverse a violation after the fact; (4) reconciliation reports any cap violation. These hold if the platform really stops a function at its limit and clock skew is small against the margins. Neither has been verified on a deployed platform. **A write already handed to Google when the worker is killed can still land after the lease expired only if Google delays it by more than the remaining lease (at least 15 s when the lease was taken at invocation start).** This remains a stated limitation and a production blocker for allocations until verified on Vercel with the real coordinator.

### F-2 Two administrators changing one donation at the same moment: **CLOSED for the controlled path, TESTED**
`tests/financial-d36-findings.test.ts`: 12 trials, two administrators with the same expected status: exactly one 200 and one 409 `STATUS_CHANGED` in every trial, the sheet equals the winner, exactly one audit record per change. The unguarded primitive gave two successes in **19 of 20** trials (temporary demonstration, removed), so the lock is what prevents it. Limits: it relies on the lease backend (the in-process table in tests; the coordinator in production); a human editing the sheet is not covered.

### F-3 A failed compensating reversal can leave an over-cap allocation active: **CLOSED as far as possible, TESTED**
All three system reversals (cap exceeded, duplicate key, unverifiable) now retry up to 3 times. If every attempt fails the caller receives HTTP 503 with a message naming the allocation ("could NOT be reversed automatically ... still ACTIVE ... reverse it now"), the incident is logged, and the integrity report flags it (`ALLOCATION_EXCEEDS_DESIGNATION`, tested). **It is not made impossible:** if Google keeps rejecting writes, the row stays active until an administrator or the next successful reversal. That is the honest floor: a compensating write needs the storage to accept writes.

## 4. Other findings this programme made

| ID | Finding | Status |
|---|---|---|
| F9 | `USER_ENTERED` writes evaluate text beginning with `=` as a formula and convert dates, fractions and percentages (LIVE: `"=1+1"` became 2). Text from donors (names, references) is written through `values.append`/`update` in the Donations and Donors tabs. The three batched follow-up tabs are safe since D36 (literal text). | **OPEN**: the other tabs are unchanged. Proposed fix: neutralise a leading `= + - @` at the write boundary with a leading apostrophe; needs its own test campaign because it changes stored phone values |
| F10 | the donate route wrote a duplicate, un-awaited audit record | **FIXED** |
| F4 | per-instance in-memory rate limiter on `/api/donate` | OPEN (needs shared state) |
| F5 | donations without a client submission key have no duplicate protection | OPEN (the donate form always sends one) |

## 5. Verification summary

| Invariant | Status |
|---|---|
| No duplicate financial operation per idempotency key | TESTED offline (6 simultaneous same-key requests: 1 donation, 1 designation set, 1 notification, 1 audit); LIVE 6 distinct donors: 6 distinct ids, 0 pending, 6 designation rows |
| Permanent donor and donation ids unique | TESTED and LIVE (above); no live test of a duplicate donor across real instances beyond D30 history |
| No allocation beyond the balance | TESTED offline under contention; not proven on deployed infrastructure |
| No false success | TESTED (partial states, atomic batch, explicit reversal failure) |
| Stale writer prevention | **NOT PROVEN** (F-1) |
| Audit consistency | one atomic, awaited record per donation; status changes write their record after the change |

**Any unresolved item above that is marked NOT PROVEN or OPEN is a production blocker for the financial path.**
