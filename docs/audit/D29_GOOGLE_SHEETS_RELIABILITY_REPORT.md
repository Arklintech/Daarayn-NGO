# D29 Google Sheets reliability report

Branch `feat/daarayn-pre-release-hardening`, start HEAD `7e1068e` (D29 work is uncommitted). D12 to D28 history is untouched. No commit, push, deployment, production write, DNS/OAuth change, donor notification or e-mail was made in D29. All live runs used the approved TEST spreadsheet through the write guard, one suite at a time, with the coordinator running as a local process (not hosted).

Evidence labels used throughout: IMPLEMENTED (code exists) / TESTED LOCALLY (one process, in-memory fakes) / TESTED ACROSS INDEPENDENT PROCESSES (separate OS processes against a local coordinator) / TESTED ACROSS INDEPENDENT VERCEL INSTANCES / INFRASTRUCTURE CONFIGURED / PRODUCTION VERIFIED / NOT VERIFIED.

## 1. Answers to the closing questions
| Question | Answer |
|---|---|
| Already correct | Separate read/write budgets, bounded retries with jitter and Retry-After, batched fresh reads for donation eligibility and allocation inputs, stable submission keys, claim-marker based row location, read-back of appends, allocation verify-and-reverse protocol, coordinator persistence/quarantine/single-instance lock (D26), fail-closed production behaviour |
| Wrong or missing | (1) no CI guard against new direct Sheets calls; (2) `scripts/inspect_google.ts` bypassed the limiter and hard-coded the production spreadsheet id; (3) coordinator accepted unvalidated numeric arguments (a bad value could poison the persisted state), compared the token without constant-time comparison and had no bound on the number of budget keys; (4) no priority: a public catalogue refresh could consume the same queue as a donation; (5) an over-wait request reserved a slot before being refused (wasted budget); (6) metrics were per instance and per calendar minute, so the rolling-60 s peak and global consumption were unmeasured; (7) no alert evaluation; (8) communications labels (D27) |
| Changed | see section 3 |
| Tests | 55 files / 573 offline tests pass; tsc 0 errors; eslint 0 errors; build exit 0; bundle scan only the public Firebase web key. Live (approved test sheet, local coordinator): allocation contention, 12-donation burst and the D26 suites (section 5) |
| Coordinator actually hosted | NO |
| Vercel actually connected to it | NO |
| Independent Vercel instances tested | NO (NOT VERIFIED) |
| Concurrent allocation safety proven | NOT PROVEN as a guarantee: 20 randomised-latency trials offline (10 per scenario) and one live run show no over-allocation, but the protocol is optimistic write-then-verify, not an exclusive lock (section 4) |
| External setup remaining | host ONE coordinator with a durable disk and HTTPS, set two Vercel variables per environment, then repeat the distributed tests; read the real Sheets quotas; configure alerts; Section 8 |
| Final status | **READY AFTER SPECIFIED EXTERNAL SETUP** (not certified as permanently hardened; see the permanent plan for the gates that remain NOT VERIFIED) |

## 2. Verified facts about the coordinator (read from the code and exercised by tests)
| Property | Result | Evidence |
|---|---|---|
| Atomic reservation | one synchronous evaluation per request in a single-threaded process; the Redis path is a single Lua script | `tools/limiter-server/gcra.cjs`, `RESERVE_LUA`; duplicate-reservation and 3-process tests |
| User/identity and project budgets | reserved together in one step; defaults read from source: 45 reads, 45 writes, burst 5, wait limit 25 s, project 200/200 | `limiterConfig()`; project test with two identities |
| State persisted before the answer | `persistSync` (temp file, fsync, rename) before the reply; a failed write refuses the request and rolls the slot back | storage-failure test |
| Corrupt or missing state | quarantine 75 s (60 s window + 15 s margin), persisted, evidence file kept | missing/corrupt/crash-loop tests |
| Single instance | lock file with heartbeat and dead-owner detection; instances on different disks CANNOT be detected | second-instance test; limitation documented |
| Restart | budget continues from the persisted state; hard kill loses no granted slot | restart and SIGKILL tests |
| Authentication | Bearer token, now compared in constant time; token of 24+ characters required to start; `/health` and `/ready` expose nothing secret | auth tests |
| HTTPS | enforced for quota and metrics requests when `LIMITER_REQUIRE_HTTPS=true` (platform proxy header) | 421 test |
| Request validation | NEW in D29: every numeric argument must be finite and inside bounds, keys limited to `[A-Za-z0-9:_.-]{1,200}`, at most 500 keys; invalid requests answer 400 and never touch the state | 4 new tests |
| Disk full / persistence failure | an unwritable temp file refuses reservations (503) and the service resumes when the disk works; a true ENOSPC was not simulated (same code path: the write throws) | storage-failure test |
| Concurrent requests | serialised by the single thread; the persist is synchronous | 24-request and 3-process tests |
| Reservation expiry | a granted slot is simply a future time; unused slots lapse; idle budgets are pruned from the state after a minute | code |
| Sensitive data | none stored: numbers per budget only; `/metrics` shows aggregate counters with no keys or identities | metrics test |

## 3. Changes implemented in D29
| Area | Change | Files |
|---|---|---|
| Admission with priority | `P0` donation validation and critical checks, `P1` donation persistence, audit, recovery and verification, `P2` admin (default), `P3` public catalogue and statistics. Each priority may only be queued up to a share of the wait limit (P0 and P1 100 %, P2 50 %, P3 20 %), so under load P3 is refused first and critical work is admitted longest. Priority travels with the request (`AsyncLocalStorage`) | `lib/google/requestControl.ts`; routes `app/api/donate`, `app/api/admin/allocations`, `app/api/admin/donations` (PATCH), `app/api/public/stats`, `app/api/programs`, `app/api/causes` |
| Atomic admit-or-refuse | the reservation script takes the caller's maximum acceptable wait and returns -1 WITHOUT reserving when it would exceed it; shedding therefore wastes no budget (script marker bumped to `GCRA-reserve-v3`, coordinator, emulators and clients updated) | `requestControl.ts`, `gcra.cjs`, `server.cjs` |
| Rolling-window measurement | rolling 60 s attempt count and peak per kind, shed counts per priority, refusals counted | `lib/google/usage.ts` |
| Global metrics | coordinator `GET /metrics` (authenticated): rolling 60 s grants, queue depth, refusals, penalties, storage failures | `server.cjs` |
| Alert rules | pure evaluator for 70/80/90 % utilisation (identity and project), queue depth, 429, retry amplification, coordinator loss/uncertainty, shed requests, uncertain financial operations; admin route `GET /api/admin/diagnostics/quota-health` | `lib/google/quotaAlerts.ts`, `app/api/admin/diagnostics/quota-health/route.ts` |
| Governance guard | CI test: no direct Sheets API call outside approved adapters, every call inside the limiter wrapper, scripts must charge the budget | `tests/request-governance.test.ts` |
| Maintenance script | `scripts/inspect_google.ts` no longer hard-codes the production id and is paced | `scripts/inspect_google.ts` |
| Coordinator hardening | validation, bounds, constant-time auth | `server.cjs` |
| Runbooks and plan | deployment, Vercel configuration, incident and recovery, monitoring, capacity planning, permanent plan, capacity report, failure matrix | `docs/ops/D29_*`, `docs/audit/D29_*` |

Behaviour preserved: validation, authorisation, idempotency keys, designation and allocation rules, audit trail, Masjid seven-day hold, three categories, Google Sheets as the only operational source of truth. No database was added and no Upstash or extra service account was introduced.

## 4. Financial integrity and concurrency
- Rate control is not a financial lock. The shared quota counter does nothing to prevent two allocations from reading the same balance.
- What protects allocations today: `createAllocation` reads Donations, Donation_Causes, Allocations and Causes fresh in one batched request, validates the amount against the designated balance, appends the allocation, re-reads and verifies the total, and reverses ITS OWN surplus rows when the verification fails; identical request keys produce one allocation.
- Offline evidence (`tests/allocation-contention.test.ts`): 6 competitors of 30 against 100 and 2 competitors of 60 against 100, 10 trials each, random 0 to 15 ms latency before and after every sheet request: no violation (active total never above the designated amount, every reported success is an active row, every refusal is an `AllocationError`).
- Live evidence (approved test sheet, real Sheets latency): 6 simultaneous allocations of 30 against a verified, designated 100: 3 succeeded, 3 were refused, 3 active rows, active total 90 of 100, 10 reads, 6 writes, 0 retries, 0 HTTP 429, 14 s.
- Why this is NOT a proof: the protocol is optimistic (write, verify, compensate). Between the write and the compensation a surplus row can exist briefly; if the compensating write itself is refused (quota, outage) the surplus would remain until reconciliation. A real exclusive per-aggregate lock needs durable ownership, lease expiry, fencing against stale workers and recovery of ambiguous writes; none of this can be provided by the quota coordinator as it stands and it was NOT built. The smallest safe design compatible with the locked architecture is a single-writer queue for allocation and verification writes (one serialised executor per donation id, durable operation rows in the Allocations sheet, completion only after read-back), to be designed and proven under injected compensation failures. Until then the release gate "concurrent allocation correctness independently proven" is NOT VERIFIED and is listed as a release blocker for any claim of transactional safety. Operationally: allocations are admin-only, low volume and run at P0; keep one administrator allocating from a given donation at a time.
- Donations: stable submission key, claim marker, read-after-write verification, placeholders adopted after 20 s, retries answer the same id; interrupted operations appear in Admin > Reconciliation; a request refused before it was sent is never reported as a donation (tests and live runs below).

## 5. Test evidence (exact)
| Test | Where | Result |
|---|---|---|
| Full offline suite | `npx vitest run` | 55 files, 573 tests PASS |
| TypeScript | `npx tsc --noEmit` | 0 errors |
| ESLint | `npx eslint lib tests app components tools` | 0 errors |
| Production build | `npx next build` | exit 0 |
| Bundle scan | `.next/static`, 62 files | only the public `NEXT_PUBLIC_FIREBASE_API_KEY` web identifier; no private key, no coordinator token |
| Request governance | `tests/request-governance.test.ts` | 10 PASS |
| Priority, atomic refusal, rolling window, alerts | `tests/quota-governance.test.ts` | 8 PASS |
| Coordinator (separate OS processes, local) | `tests/limiter-server.test.ts` | 21 PASS (3-process shared budget, restart, missing/corrupt state, quarantine persistence, SIGKILL, restart while waiting, storage failure, duplicates, second instance, shared 429, outage and recovery, auth/HTTPS, validation, key bound, metrics) |
| Client side, project budget, TCP path (emulator) | `tests/shared-limiter*.test.ts`, `tests/quota-control.test.ts` | PASS |
| Allocation contention, offline random latency | `tests/allocation-contention.test.ts` | 2 PASS (10 trials of 6 competitors and 10 trials of 2 competitors) |
| LIVE allocation contention | `docs/audit/evidence-d29/live_d29_alloc.summary.txt` | PASS (3 of 6 admitted, total 90 of 100) |
| LIVE 12 simultaneous donations | `live_d29_burst.summary.txt` | PASS: 12 accepted, 12 distinct rows, 0 PENDING, 134 s, 100 reads, 82 writes, 0 retries, 0 HTTP 429, longest wait 15 s, no refusal, rolling 60 s peak 46 reads / 49 writes (counted at completion; the coordinator saw 38 reads / 42 writes in its last window) |
| LIVE D26 suites (single chain 6/6, six donations, five-way replay, quota exhaustion and recovery) | `live_d26_*.summary.txt` | PASS; the first D25 exhaustion attempt failed because the test replayed inside the 20 s placeholder window (test expectation corrected, attempt recorded) |
| Real shared coordinator (hosted), independent Vercel instances, Memorystore | not available | NOT RUN |

Tests listed as "across independent processes" used separate Node processes on one machine and a coordinator on the same machine: they prove the protocol and failure behaviour, not network behaviour, hosting, TLS, or Vercel concurrency.

## 6. Request cost and quota usage
No new request reductions were made in D29: the donation chain remains about 11 reads and 7 writes (9 and 7 for a returning donor, 7 and 6 for a general donation, 1 read for a rejected donation, 3 reads and 2 writes for an allocation) because the remaining reads are fresh eligibility checks and the claim protocol. Measured in the 12-donation burst: 100 reads and 82 writes for 12 donations (8.3 and 6.8 each). Budgets were not increased. The earlier statement "50 reads over 70 s" is NOT evidence of a rolling-window peak; the rolling measurement now exists (46 reads and 49 writes in the busiest 60 s of the burst, counted at completion) and shows the write peak is within the configured 45 plus the burst allowance of 5.

## 7. Security implications
The coordinator token is a bearer secret held server-side on Vercel and on the VM; it is never logged, never in `NEXT_PUBLIC_*`, and not returned by any endpoint; a hostile authenticated caller can now only create bounded, validated budgets. The coordinator contains no donor or financial data. A compromised token lets an attacker add penalties or consume budget (denial of service) but not read or change Google data. Rotate by changing both sides.

## 8. Remaining external actions (owner)
1. Read the real Google Sheets quotas (per user and per project) for the project; record them.
2. Authorise and provision ONE coordinator host (Compute Engine VM with a persistent disk is documented; no `gcloud` was available here), TLS, token, snapshots.
3. Set `GOOGLE_LIMITER_REDIS_REST_URL`, `GOOGLE_LIMITER_REDIS_REST_TOKEN`, `GOOGLE_LIMITER_KEY_PREFIX` per Vercel environment; redeploy (separate authorisation).
4. Run the distributed tests through the hosted coordinator with traffic from real Vercel invocations; run the 5x burst and the load tests in the capacity report.
5. Configure and test the alerts in Cloud Monitoring and Vercel.
6. Decide on the allocation single-writer design if transactional allocation safety is required.
7. Earlier owner items: production worksheets and migration rehearsal, domain/HTTPS, OAuth, financial policy.

## 9. Known limitations
Single coordinator VM is a single point of failure (the application then fails closed); a second VM would be a SECOND budget unless a shared atomic store is introduced (see the permanent plan); the Vercel-side usage counters are per instance; the coordinator's rolling counters reset on restart; the 5x burst and Vercel multi-instance tests were not run; no alert is configured.

## 10. Rollback
D29 is uncommitted: `git diff` shows exactly what changed and individual files can be restored by the owner. After a deployment, roll back by redeploying the previous Vercel deployment (do not weaken the wait limit to hide shedding). The coordinator can be stopped at any time; the application then fails closed.
