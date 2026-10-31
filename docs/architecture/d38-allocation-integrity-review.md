# D38 allocation integrity review

Date 2026-11-01. The donation queue does not make allocations safe. This review re-reads the allocation code and tests (SOURCE, OFFLINE) and states what is guaranteed, what is not and what would be required. Labels as in the other D38 reports. Nothing in this review is proven on Vercel.

## 1. Mutations that affect an allocation balance, and their controls today

| Mutation | Control (SOURCE) | Failure model | Remaining limitation |
|---|---|---|---|
| Create allocation | lease `alloc:<donation>` + fresh batched read + cap pre-check + self-fence + append + post-write verification (earliest row wins, over-cap row reversed) | stale or killed worker: the lease outlives the function; a row over the cap is reversed after the fact; reversal is retried 3 times and, if it keeps failing, the caller gets an explicit 503 and the integrity report flags the row | storage cannot reject a stale writer; a write already handed to Google may land after the lease expired; allocations are paused in production until the owner verifies them |
| Reverse allocation | read, then idempotent write | repeat is safe | not serialised; it only lowers the allocated total; its audit record is written AFTER the change and a failed audit is only logged (a reversal without a trace is possible) |
| Lower a designation | `recordDesignation` runs under the same lease and **refuses (409) while active allocations exceed the new amount**; it never reverses anything by itself | lease busy: 503 retryable | the whole-row rewrite can still be overwritten by a human editor |
| Change a donation's status | every change under the same lease; leaving "verified" refused while active allocations exist; expected status compared on a fresh read inside the lease | two administrators: exactly one wins (12 of 12 trials); lease busy: 503 `BUSY` | needs a coordinator or a single process for the lease to exclude across instances |
| System reversal (cap exceeded, duplicate key, unverifiable) | bounded retries, explicit error naming the row | if every attempt fails the row stays ACTIVE and over the cap until a person or the next success | the honest floor: a compensating write needs the storage to accept writes |

## 2. The rule the directive asks for

"A designation cap must not be lowered below existing active allocations unless the required reversals have been durably confirmed. If a reversal fails, preserve the old cap, block conflicting allocations and escalate." **Holds today:** `recordDesignation` does not lower the cap at all while active allocations exceed it (it answers 409 "Reverse them first"), so the old cap is preserved by construction and no reversal can fail halfway through a cap change, because the cap change never starts one. The escalation path is the reconciliation page (`ALLOCATION_EXCEEDS_DESIGNATION`).

## 3. Over-cap active rows and partially completed reversals

Detected by the integrity report; retried by the system reversal; explicit when impossible. **Gap found:** a manual reversal's audit record is written after the change, so a failed audit leaves a reversal without a trace. Recommended (not implemented here): the same audit-first rule that the admin queue actions follow (refuse the reversal if the audit record cannot be written), which is a small change with its own tests and should be reviewed with the owner's audit policy.

## 4. Should allocations use a single-consumer command queue?

**Not implemented, and not recommended yet.** Reasons: (1) a queue consumer's concurrency is not a fencing token and Vercel orders messages only approximately (DOC); (2) the one documented knob that would serialise consumption (max concurrency) has no documented configuration key; (3) an allocation needs an immediate answer for the administrator (a 409 when the cap would be exceeded), which an asynchronous command path would turn into a later status; (4) the finaliser is safe asynchronously only because its effects are deterministic and convergent, while an allocation depends on a balance that moves. A queued allocation path would need its own deterministic design (allocation ids and cap checks as pure functions of an ordered command log in the sheet) and its own proof campaign. **Independent acceptance gate:** allocations stay paused in production (`ALLOCATION_SERIALIZATION_VERIFIED` unset) until the lease is proven on a deployed system with a hosted coordinator or an equivalent single-writer guarantee.

## 5. Stale-writer guarantees, stated plainly

For donation intake and finalisation: convergence, not fencing (D37). For allocations: bounded-delay mutual exclusion with post-write verification; **no storage-level fencing**. Neither is claimed to be a transaction.
