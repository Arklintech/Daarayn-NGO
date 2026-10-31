# D30 Capacity and failure test report

Environment: approved TEST spreadsheet through the write guard, Drive and e-mail stubbed, the application code in one Node process per run, the coordinator `tools/limiter-server` as a LOCAL separate process (not hosted), default budgets read from the code (45 reads, 45 writes a minute for the identity, 200 and 200 for the project, burst 5, wait limit 25 s). NOT run on Vercel and NOT production: no result below is evidence of Vercel behaviour.

## 1. Live donation bursts (distinct donations, one process per simulated instance, all at the default wait limit)
| Simultaneous donations | Accepted | Refused | Duration | Reads / writes | Retries | HTTP 429 | Longest wait | Rolling 60 s peak (reads / writes) | Duplicates / PENDING |
|---|---|---|---|---|---|---|---|---|---|
| 6 (D26) | 6 | 0 | 70 s | 50 / 41 | 0 | 0 | 10 s | not measured then | 0 / 0 |
| 12 (D29) | 12 | 0 | 134 s | 100 / 82 | 0 | 0 | 15 s | 46 / 49 | 0 / 0 |
| 20 (D30) | 19 | 1 (503 retryable, before any write, priority P0) | 216 s | 162 / 132 | 0 | 0 | 25 s | 46 / 50 | 0 / 0 (19 completed rows = 19 accepted) |
| 30 (D30, the 5x of six) | 19 | 11 (503 retryable, all P0 at the wait limit, before any write) | 216 s | 162 / 132 | 0 | 0 | 25 s | 46 / 50 | 0 / 0 (19 completed rows = 19 accepted) |

Reading of the 30-donation run: the system admitted the same 19 as in the 20-donation run and refused the other 11 with a truthful retryable 503 before any write; the quota consumption was identical (162 reads, 132 writes): admission is bounded by the budget, so a larger burst cannot increase consumption, it only increases refusals. Replaying the refused 11 later with their submission keys is safe (nothing was stored).

Reading: each queued read costs 60/45 = 1.33 s of budget and a donation's reads are sequential, so the queue is about N x 1.33 s deep. The 25 s limit is reached at about 18 simultaneous donations, which the 20-donation run confirmed (one critical request was refused at the limit). Refusals are truthful: a 503 with a retry hint, nothing stored. Rolling-60-second consumption stayed at the configured budget plus the burst allowance (46 reads, 50 writes against 45 plus a burst of 5); Google's documented ceiling of 60 was never reached and there was no HTTP 429. Coordinator metrics after the 20-donation run: rolling 60 s grants 38 reads / 41 writes, queue depth 8.8 s (reads), 1 refusal, 0 penalties, 0 storage failures.

## 2. Tested maximum supported workload (test environment, local coordinator)
- Burst: up to 18 to 19 simultaneous donations are admitted without refusal; at 20 the first critical refusal appears. This is the measured limit of THIS configuration, not a forecast of real traffic.
- Sustained: about 4 donations a minute (240 an hour) from donations alone (read budget 45 / about 11 reads per donation), measured throughput in the bursts 5.4 to 5.6 donations a minute.
- Above that the system degrades by refusing (retryable) rather than failing silently. Capacity is NOT unlimited; raising it requires fewer requests per donation, verified higher Google quotas with higher budgets, or a design change.

## 3. Other scenarios requested
| Scenario | Result | Level |
|---|---|---|
| Concurrent admin and background traffic with donations | priority behaviour proven by tests (admin P2 and public P3 shed before donations P0/P1); not run live | TESTED LOCALLY |
| Priority starvation | a flood of 25 low-priority requests per round cannot starve P0: all 12 critical requests admitted, P0 refusals 0, P3 shed >0 (simulated clock) | TESTED LOCALLY |
| Artificial network latency to the coordinator | 250 ms added latency only slows each reservation; above the timeout the request is refused unsent | TESTED LOCALLY (emulated coordinator) |
| HTTP 429 injection | bounded retries with jitter honouring Retry-After; the penalty is shared by all processes and the project budget (D26, D29) | TESTED LOCALLY and across processes |
| Coordinator restart | budget, leases and fencing tokens continue from the persisted state; SIGKILL loses no granted slot | TESTED ACROSS PROCESSES |
| Shared-state outage | every process refuses (fail closed) and recovers when the coordinator returns; storage failure refuses and resumes | TESTED ACROSS PROCESSES |
| State loss / corruption | quarantine of 75 s; leases withheld; corrupt file kept | TESTED ACROSS PROCESSES |
| Vercel function timeout | not run on Vercel; the allocation lease is longer than the declared 60 s limit and the self-fencing check covers a stalled worker (TESTED LOCALLY) | NOT VERIFIED on Vercel |
| Recovery and idempotency | 5-way replay of one key gives one donation (live); exhaustion mid-flow then replay gives one donation (live); 20 simultaneous allocation submissions of one key give one row (offline) | TESTED |
| Independent Vercel instances | not run | NOT VERIFIED |

## 4. Failure outcomes observed in the live runs
No false financial success: every accepted donation has a completed row (19 of 19 in the 20-donation burst); the one refusal stored nothing. No duplicate rows, no PENDING placeholders left by the bursts, no 429, no retry storm (0 retries).

## 5. Weaknesses and scaling thresholds
Single coordinator VM is a single point of failure (the application fails closed). The capacity is bounded by the read budget; the real Google quotas are unverified. Thresholds: at 60 percent of 4 donations a minute review quotas; at 80 percent do not start a campaign until capacity is raised; any P0/P1 refusal is an incident.
