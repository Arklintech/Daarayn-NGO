# D29 Incident and recovery runbook (Google Sheets request control and financial operations)

Principles: (1) the application fails closed rather than guess; (2) an ambiguous financial write is RECONCILED, never blindly retried and never resumed automatically; (3) nothing is "completed" until its rows are persisted and read back; (4) request-rate control is not a financial lock. Status of the drills below: the scenarios marked TESTED were exercised in D26 to D29 against a coordinator running on one machine; none has been exercised against a hosted coordinator or independent Vercel instances (NOT VERIFIED).

Severity: SEV1 = donations cannot be recorded or financial state may be wrong; SEV2 = degraded (slow, shedding public data); SEV3 = warning only.

| # | Scenario | Detect | Safe operating state | Recover | Verify | Escalate |
|---|---|---|---|---|---|---|
| 1 | Coordinator process stopped / VM down (TESTED locally) | quota-health `COORDINATOR_UNREACHABLE`; donors see "records service busy" 503 | the app refuses Google requests unsent (no donation is recorded, none is reported successful) | restart the container/VM; the same budget continues from the persisted state | `/ready` 200; one test donation in the TEST sheet environment only; quota-health `ok` | SEV1 if > 5 min |
| 2 | Coordinator state missing or corrupt (TESTED) | `/ready` 503 `quarantined: true`; alert `COORDINATOR_QUARANTINE` | all budgets held 75 s; requests that would wait longer than the wait limit are refused (retryable) | none needed; the corrupt file is kept as `.corrupt-<time>`; find out why (disk, restore) | `/ready` 200 after the quarantine, rolling counters resume | SEV2 |
| 3 | Disk full / unwritable (TESTED by making the temp file unwritable) | `COORDINATOR_STATE_UNCERTAIN`; reservations return 503 | no reservation is granted (fail closed) | free space / fix the disk; the service resumes by itself within seconds | `/metrics` `storageOk: true` | SEV1 |
| 4 | Network interruption Vercel <-> coordinator (TESTED as an outage) | `COORDINATOR_UNREACHABLE` | fail closed, 5 s cool-down between retries by each instance | restore connectivity | quota-health `ok` | SEV1 if > 5 min |
| 5 | Authentication failure (wrong/rotated token) (TESTED) | same as an outage; coordinator returns 401 | fail closed | set the same token on both sides, redeploy Vercel | quota-health | SEV2 |
| 6 | Google quota exhausted (HTTP 429) (TESTED with injected 429 and exhausted budgets) | `GOOGLE_HTTP_429` incident; shared cooldown starts | the budget is penalised for every instance; P2/P3 shed first | wait for the cooldown; find the cause (request growth, another consumer); do NOT raise budgets blindly | no 429 for 15 minutes; queue depth near 0 | SEV2; SEV1 if donations are refused |
| 7 | Google Sheets API outage / 5xx | repeated retries, errors | reads/writes fail with retryable errors; appends are not replayed after ambiguous errors | wait; then reconcile interrupted operations (below) | reconciliation page clean | SEV1 for donations |
| 8 | Vercel function timeout during a donation | interrupted placeholder row `PENDING` or partial donation in Admin > Reconciliation | the donor is told to retry; the same submission key makes the retry idempotent | the retry adopts a placeholder older than 20 s and completes it; otherwise use Reconciliation > Recover for bookkeeping steps | donation has an id, designation and audit row; no duplicate | SEV2 |
| 9 | Interrupted allocation | allocation row without its verification, or an over-allocation warning | the allocation service verifies after writing and reverses its own surplus rows; an unresolved case shows in Reconciliation | review the Allocations rows for the donation; reverse manually through the admin tool if needed | active allocations <= designated amount | SEV1 if any over-allocation remains |
| 10 | Duplicate donation suspected | reconciliation warning or two rows with one submission key | no automatic deletion | compare `submissionKey`; keep the original, reverse the duplicate through the approved admin action with an audit entry | one row per key | SEV2 |

## Reconciliation rule for uncertain financial operations
Never mark an operation completed because a request was sent. Procedure: read the persisted rows by the stable identity (submission key, claim marker, request key); if the row exists and is verified, the outcome is COMPLETED and the retry returns the same id; if it does not exist after a read-back at least 60 s later, the operation did not happen and the donor may retry; if a placeholder exists, wait 20 s and retry (it is adopted) or recover through Reconciliation. Do not delete rows to "clean up" without an audit entry.

## After any SEV1
Record: time, scenario number, what the donors saw, rows affected, actions, who verified. Add the evidence to `docs/audit/`. Review whether thresholds in the monitoring runbook need calibration.

## Communication responsibilities
Owner decides whether to tell donors; donors are only told the truth the application tells them (a retryable "busy" message, never a false confirmation). No automated e-mail is sent about incidents.
