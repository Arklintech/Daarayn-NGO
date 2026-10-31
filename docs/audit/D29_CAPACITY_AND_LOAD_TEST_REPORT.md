# D29 Capacity and load test report

Environment of every number: approved TEST spreadsheet, write guard on, drive/e-mail stubbed, application code run in one Node process per test with the coordinator as a LOCAL separate process (`tools/limiter-server`), default budgets (45 reads, 45 writes a minute for the identity, 200/200 for the project, burst 5, wait limit 25 s). Not run on Vercel. Not production. No uncontrolled load was sent to production.

## 1. Configured budgets (read from the code)
`limiterConfig()` defaults: reads 45/min, writes 45/min, burst 5, maximum wait 25 000 ms, project reads 200/min, project writes 200/min. Google's documented per-user limit (60 reads, 60 writes a minute) and per-project limit (300 and 300) are the ceilings these sit under; the real quotas of this project were NOT verified (no console access).

## 2. Measured cost per workflow (D20, re-measured in D26)
| Workflow | Reads | Writes |
|---|---|---|
| Project donation, new donor | 11 | 7 |
| Project donation, returning donor | 9 | 7 |
| General donation | 7 | 6 |
| Rejected ineligible donation | 1 | 0 |
| Verification (status change) | 1 | 2 |
| Allocation | 3 | 2 |
| Rejected allocation | 1 | 0 |
| Dashboard / reconciliation view | 2 / 1 | 0 |

## 3. Live runs (this machine, test sheet)
| Run | Result |
|---|---|
| Single financial chain | 6/6 pass, about 115 s (includes 40 s of setup) |
| 6 simultaneous distinct donations | 6 accepted, distinct ids, 1 donor; 70 s; 50 reads, 41 writes; 0 retries; 0 HTTP 429; longest single wait 10 s; 0 refusals |
| 12 simultaneous distinct donations (2x of six) | 12 accepted, 12 completed rows, 0 PENDING; 134 s; 100 reads, 82 writes; 0 retries; 0 HTTP 429; longest single wait 15 s; 0 refusals; app-side rolling-60 s peak 46 reads and 49 writes; coordinator's own last 60 s window 38 reads and 42 writes; queue depth at the end 4 s (reads) and 8.5 s (writes); throughput about 5.4 donations a minute during the burst |
| 5 identical-key replays | 1 donation, 1 designation |
| Quota exhaustion mid-flow and replay | 503 and no id; replay produced exactly 1 donation and 1 designation |
| 6 simultaneous allocations against 100 | 3 admitted, 3 refused, active total 90; 14 s; 10 reads, 6 writes |

## 4. What limits capacity (derivation, confirmed by the 12-donation run)
Each queued read costs 60/45 = 1.33 s of budget. A donation issues its reads one after another, so with N donations in flight the queue is about N x 1.33 s deep. At 6 in flight the longest wait was 10 s, at 12 it was 15 s (the model predicts 8 s and 16 s). The 25 s limit is therefore reached at roughly 18 simultaneous donations; beyond that the P3 and P2 work is refused first and finally the donations themselves are refused with a retryable "busy" answer (truthful, nothing stored). Sustained throughput is bounded by the write budget (45 / 7 = about 6 a minute) and the read budget (45 / 11 = about 4 a minute): about 4 donations a minute, 240 an hour, before any admin or catalogue traffic.

## 5. Supported workload (documented from the measurements; to be re-measured on hosted infrastructure)
- Burst: up to about 12 simultaneous donations accepted without refusal (measured); about 18 expected before refusals begin (derived, not measured).
- Sustained: about 4 donations a minute (derived from measured request cost and configured budgets).
- Admin and public catalogue traffic share the same budget; the catalogue is P3 and is refused first.
This is a capacity estimate for the TEST environment with a local coordinator, not a production certification.

## 6. Scenarios requested and their status
| Scenario | Status |
|---|---|
| Normal expected peak, 2x, 5x forecast | The platform has no recorded real traffic, so no forecast exists (NOT AVAILABLE). 2x of six donations was run (12). A controlled 30-donation (5x) burst was NOT RUN; the model predicts refusals beyond about 18 |
| Concurrent donations | RUN (6, 12) |
| Concurrent admin operations during donations; catalogue refresh during financial activity; background jobs | NOT RUN live; priority shedding is unit-tested |
| Multiple Vercel invocations and independent instances | NOT RUN (NOT VERIFIED) |
| Coordinator instance failure / restart | RUN across independent processes (local) |
| Shared-state backend failover (Memorystore) | NOT APPLICABLE (not implemented) |
| Network latency and timeout | timeouts and outages RUN; added latency NOT RUN |
| Google HTTP 429 | injected 429s RUN (bounded backoff, shared cooldown); a real Google 429 was not provoked on purpose |
| Allocation contention | RUN offline (20 trials) and live (1) |
| Duplicate replay | RUN |
| Interrupted financial operations | RUN (mid-flow exhaustion, placeholder adoption) |

## 7. Retry amplification and rejection rates
0 retries and 0 refusals in the 6- and 12-donation runs; retries are bounded (5 attempts, 40 s total, full jitter, Retry-After honoured) and every retry takes a slot from the same budget. No retry storm was observed.

## 8. Scaling thresholds
At 60 percent of the supported rate request a quota review from Google; at 80 percent do not start a campaign until capacity is raised. Capacity can be raised only by (a) fewer requests per donation, (b) higher verified Google quotas and correspondingly higher budgets, or (c) a design change; creating additional service accounts to bypass quotas is excluded by the locked rules.
