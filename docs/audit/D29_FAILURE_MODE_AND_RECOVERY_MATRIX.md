# D29 Failure mode and recovery matrix

Columns: what fails, what the system does, how it is detected, how it recovers, evidence level (IMPL = implemented, LOCAL = tested in one process, PROC = tested across separate OS processes on one machine, VERCEL = tested on independent Vercel instances, PROD = verified in production, NV = not verified).

| # | Failure | System behaviour (safe state) | Detection | Recovery | Evidence |
|---|---|---|---|---|---|
| 1 | Coordinator process stops | Google-backed requests refused unsent (retryable 503, `GOOGLE_LIMITER_UNAVAILABLE`); no donation reported; 5 s cool-down per instance | quota-health `COORDINATOR_UNREACHABLE`, uptime check (to configure) | restart; budget continues from persisted state | PROC; VERCEL NV |
| 2 | Coordinator restart with intact state | same budget continues; no burst | `/ready` | none | PROC |
| 3 | State missing or corrupt | all budgets held 75 s; corrupt file kept; requests needing a longer wait are refused | `/ready` 503, alert `COORDINATOR_QUARANTINE` | wait; investigate | PROC |
| 4 | Crash loop | quarantine persisted: cannot be shortened by restarts | `/ready` | fix cause | PROC |
| 5 | Hard kill during reservations | no granted slot lost (persisted before answer) | restart | none | PROC |
| 6 | Disk unwritable/full | reservations refused (503), none granted; resumes when the disk works | `storageOk=false`, alert | free space | PROC (unwritable temp file; ENOSPC not simulated) |
| 7 | Second coordinator on the same disk | refuses to start (exit 2) | process exit | stop the extra | PROC |
| 8 | Second coordinator on another disk | CANNOT be detected: two independent budgets | none | never create it; hosting rule | NV (by design) |
| 9 | Wrong or rotated token | requests refused (fail closed) | outage-like alert | align the token on both sides | PROC |
| 10 | Plain HTTP to the coordinator when HTTPS is required | 421 | logs | use HTTPS | PROC |
| 11 | Malformed or hostile reservation request | 400, state untouched; more than 500 keys refused | metrics | none | PROC |
| 12 | Network interruption Vercel to coordinator | as 1 | as 1 | restore | PROC (simulated as outage); VERCEL NV |
| 13 | Coordinator slow (> timeout 1.5 s) | refused unsent | latency alert (to configure) | investigate VM | LOCAL (emulator delay) |
| 14 | Production without a coordinator configured | Google requests refused unsent; readiness 503 `limiter_not_configured` | readiness | configure | LOCAL; VERCEL NV |
| 15 | Google HTTP 429 | shared cooldown for every instance; retry with jitter, honouring Retry-After; P2/P3 shed first | `GOOGLE_HTTP_429` alert, Google metrics | wait; find cause | PROC (injected) |
| 16 | Quota exhausted (queue longer than the wait limit) | request refused unsent before any write; if it happens mid-flow the donor sees a retryable 503 and no donation id | shed counts, queue alerts | replay with the same submission key | LIVE (test sheet) |
| 17 | Google outage / 5xx on a write | no blind replay of appends; outcome reconciled by marker | reconciliation | read back, then retry | LOCAL |
| 18 | Vercel function timeout mid-donation | placeholder row; retry adopts it after 20 s (409 retryable before that) | reconciliation page | retry or Recover | LIVE (placeholder adoption observed) |
| 19 | Interrupted donation bookkeeping (designations, notification, audit missing) | donation exists, flagged | reconciliation (4 test examples present in the test sheet) | Recover (bookkeeping steps only) | LIVE (detected); recovery not run |
| 20 | Interrupted allocation | allocation rows verified after writing; own surplus rows reversed; unresolved cases visible | allocation verification, reconciliation | manual reversal with audit | LOCAL (injected verification failure) |
| 21 | Competing allocations on one balance | optimistic write-verify-reverse; no violation in 20 offline trials and one live run | active total vs designated amount | n/a | LOCAL + LIVE (not a proof) |
| 22 | Duplicate donation submission | one row per submission key; same id returned | reconciliation | n/a | LIVE (5-way replay) |
| 23 | Retry storm | bounded attempts, jitter, shared budget for retries | retry amplification alert | n/a | LOCAL |
| 24 | New code bypasses the limiter | CI test fails | CI | route through `SheetsService` | IMPL (guard test) |
| 25 | Stale worker writes after a lease would have expired | not applicable: no leases are used for financial writes | | | NV (a single-writer design is not built) |
