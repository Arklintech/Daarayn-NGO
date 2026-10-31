# D29 Permanent reliability plan

Aim: the known failure class (silent Google Sheets quota exhaustion and uncoordinated traffic) is prevented, detected, contained and recoverable as the platform grows. This plan does NOT claim immunity from provider outages, quota changes or a coordinator failure; it states what happens in each case.

## 1. Coordination architecture options (evaluated against the actual code)
The application is on Vercel (many independent function instances). The adapter speaks one protocol: an atomic reserve command (`EVAL` of the `GCRA-reserve-v3` script) over HTTPS REST or a raw `redis://` TCP connection, with a metrics read at `/metrics` for the REST coordinator. Facts that matter: Vercel functions reach only public network addresses (no VPC peering on normal plans), reservation latency adds to every Sheets request, and a coordinator failure makes the application fail closed.

| Criterion | Option 1: one Compute Engine VM, persistent disk, existing coordinator | Option 2: redundant instances over a shared atomic backend (Memorystore for Redis, Standard Tier) | Option 3: Redis server hosted elsewhere or a managed Redis with a public TLS endpoint (not Upstash) |
|---|---|---|---|
| Availability | single point of failure; a reboot or VM failure means donors see a retryable "busy" message until it returns; GCE can auto-restart the VM and Docker restarts the process (minutes) | higher: primary and replica in two zones, automatic failover; the coordinator front end could run redundantly | depends on the provider tier; a replicated tier gives failover |
| Atomicity | yes (single process, synchronous) | yes (the Lua script is atomic on the primary) | yes |
| State recovery | durable on a persistent disk, fsync before each answer; lost state is quarantined for 75 s | replication is ASYNCHRONOUS: an acknowledged reservation can be lost during failover, so a failover must be treated like a state loss (quarantine) and this logic is NOT implemented for Redis (the adapter has no failover detection) | same as option 2 |
| Failover / split brain | none (no failover); a second VM would be a second budget (no split-brain protection across disks) | the platform fences the old primary; a client may still talk to a stale primary briefly | provider specific |
| Network from Vercel | public HTTPS endpoint on the VM | Memorystore has only private IPs: Vercel cannot connect directly. It needs a public front end (a Cloud Run or VM service with a VPC connector) that becomes a second component to run and secure; NOT implemented | public TLS endpoint possible (adapter supports `rediss://`) |
| Operational complexity | low | high (VPC, connector, front end, failover handling) | medium |
| Monthly cost (estimates only, to be confirmed) | free tier may apply to one e2-micro; otherwise a few dollars | Standard Tier 1 GB roughly 35 USD (secondary source, not an official price) plus connector and front end, so several tens of dollars | provider dependent |
| Backup / restore | disk snapshots; restore is safe because stale times are in the past | managed snapshots / RDB export | provider |
| Failure behaviour | fail closed | fail closed, plus quarantine after failover | fail closed |

Recommendation (to be confirmed by the owner): start with Option 1 (preserved D26 design, already implemented and tested, fits the locked architecture and budget), run it with snapshots, uptime alerts and the incident runbook, and accept that a coordinator outage means a temporary, truthful, retryable refusal of Google-backed requests, not data loss. Revisit Option 2 or 3 when (a) sustained donation traffic makes a multi-minute outage unacceptable or (b) a campaign requires an availability target above what one VM provides. Before adopting any Redis-based option, implement failover/state-loss detection (a monotonic epoch key and quarantine when it changes) and a public front end for Memorystore; neither exists today. Upstash is excluded. Redis or any coordination store may hold only quota and lease data, never donor or financial data, and financial correctness never depends on its volatile state.

## 2. Request governance (implemented)
Every Sheets request passes the limiter (guard test), carries a priority (P0 to P3) and a kind, and is admitted or refused atomically. Direct paths removed or paced: legacy sync client, readiness checks, maintenance script. A CI test fails when a new direct Sheets call appears. Request correlation identifiers and operation identifiers on every call are NOT yet attached to the metrics (financial operations carry stable submission and request keys; a per-request correlation id in the logs is a recommended follow-up, not implemented).

## 3. Adaptive capacity (what exists and what does not)
Implemented: separate read and write accounting, identity and project budgets, atomic reservations, priority-aware shedding with a protected share for P0/P1, bounded waits and queues, expiry of unused slots, quota recovery after a coordinator restart, shared 429 cooldown. Not implemented: concurrency limits per priority beyond the wait ceilings, fair scheduling beyond arrival order plus shedding, a reserve that is held back for P0/P1 even when P2/P3 arrive first on an idle system (shedding only starts once a queue exists). Thresholds 70/80/90 % are evaluated by `quotaAlerts.ts`; automatic deferral of P2 work at 80 % is NOT implemented (it happens implicitly through the lower wait ceilings). Quotas are never raised automatically.

## 4. Financial reliability (summary)
Stable operation identity (submission key, request key, claim marker), duplicate detection, explicit states (PENDING placeholder, pending, completed), read-after-write verification, interrupted-operation recovery in Admin > Reconciliation, audit relationships. No operation is completed because a request was submitted. Allocation uses an optimistic verify-and-reverse protocol that was exercised under contention but is not a lock (see the reliability report). Google Sheets provides no multi-worksheet transaction; nothing here claims exactly-once delivery.

## 5. Certification gates (all 16) with honest status
| # | Gate | Status | Owner / action |
|---|---|---|---|
| 1 | 100 % of Sheets API calls coordinated | IMPLEMENTED and guarded in CI; standalone scripts are coordinated only if the coordinator variables are exported | maintain the guard |
| 2 | No production process-local fallback | IMPLEMENTED, TESTED LOCALLY (production refuses requests and readiness is 503 without a coordinator) | verify on Vercel after configuration |
| 3 | Real provider quotas documented | NOT VERIFIED | owner reads the Cloud Console |
| 4 | Safe budgets and reserves tested | TESTED LOCALLY and across processes (45 / 45 identity, 200 / 200 project, priorities) against the TEST sheet; no 429 observed | repeat on hosted coordinator |
| 5 | P0/P1 priority protection proven | TESTED LOCALLY (unit); not proven under real mixed load | run mixed-load test |
| 6 | 429 handling and retry amplification | TESTED LOCALLY (injected 429, bounded retries, shared cooldown across processes); real Google 429 not provoked | controlled test with lowered budget not run |
| 7 | Independent Vercel traffic shares one quota system | NOT VERIFIED | hosted coordinator and real invocations |
| 8 | Coordinator failure gives controlled behaviour | TESTED ACROSS INDEPENDENT PROCESSES (fail closed) | repeat hosted |
| 9 | Coordinator recovery and state continuity | TESTED ACROSS INDEPENDENT PROCESSES | repeat hosted incl. VM reboot |
| 10 | Concurrent donation correctness | TESTED: 6 and 12 simultaneous donations (live, test sheet), replays, exhaustion and recovery | repeat on Vercel |
| 11 | Concurrent allocation correctness independently proven | NOT PROVEN (see section 4); evidence: 20 offline trials and one live run without violation | design single-writer if guarantee required |
| 12 | Ambiguous writes reconciled safely | TESTED LOCALLY and live (exhaustion mid-flow then replay yields one donation) | |
| 13 | Alert rules configured and verified | NOT VERIFIED (rules coded, nothing configured) | owner configures Cloud Monitoring/Vercel |
| 14 | Load testing establishes supportable capacity | PARTIAL: measured up to 12 simultaneous donations; 2x and 5x forecast cannot be defined without real traffic data; 5x burst NOT RUN | capacity report |
| 15 | Recovery runbooks exercised | PARTIAL: coordinator drills exercised by tests; no operator drill on hosted infrastructure; allocation/donation interruption drills not run on a hosted system | schedule the monthly drill |
| 16 | Infrastructure failure never causes false financial success | TESTED LOCALLY and live (503 without a donation id, no completed row) | |

D29 therefore does NOT certify the system as permanently hardened.

## 6. Ongoing programme
See `docs/ops/D29_CAPACITY_PLANNING_RUNBOOK.md` (daily, weekly, monthly, pre-release, pre-campaign), `D29_MONITORING_AND_ALERTING_RUNBOOK.md` and `D29_INCIDENT_AND_RECOVERY_RUNBOOK.md`.
