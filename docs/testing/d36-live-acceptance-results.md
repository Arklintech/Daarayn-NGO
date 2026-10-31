# D36 live acceptance results

Date 2026-10-31. **What "live" means here:** real Google Sheets API calls against the **approved test spreadsheet only** (id allowlisted in `lib/google/approvedTargets.ts`, `_IntegrationTest` marker tab required, production sheet id must differ), from one machine and one Node process, with email, Drive uploads, realtime and Firebase stubbed and only synthetic `ZZ_` records. It is **not** Vercel Preview and **not** production. Nothing was sent to a real donor. No production worksheet was read or written.

## 1. Live tests run

| Test | What it proves | Result |
|---|---|---|
| `tests/live/r1-appendcells.live.test.ts` | `appendCells` stores the same cell values as `values.append` USER_ENTERED for the 23 app-shaped values; 8 awkward strings differ by design (literal text instead of dates, fractions, percentages, scientific, leading-zero numbers and formulas) | PASS (about 5 requests, throw-away tab removed afterwards) |
| `tests/live/quota-cost.live.test.ts` (twice, after a per-label breakdown was added) | real request counts per operation and per label | PASS; counts in `d36-performance-benchmark.md` |
| `tests/live/d36-burst.live.test.ts` N=6 and N=12 (new) | simultaneous donations from independent module graphs sharing one coordinator at 45/45 per minute | PASS on integrity; **FAILS the 60 s window** (68 s and 142 s, 0 of 18 finished within 60 s) |

Details of the bursts: N=6, 6 of 6 accepted, 0 retries, 0 quota rejections, 52 reads and 35 writes, 6 distinct donation ids, 0 PENDING rows, 6 designation rows; N=12, 12 of 12 accepted, 0 retries, 0 quota rejections, 108 reads and 71 writes, 12 distinct ids, 0 PENDING, 12 designation rows, limiter waited 1,398 s in total (longest single wait 16 s).

The coordinator was the repository's own program (`tools/limiter-server/server.cjs`) started on localhost for the test with a generated token and a scratch state file, then stopped and its token removed. This is **not** a hosted coordinator.

## 2. Not run, and why

| Item | Reason |
|---|---|
| Vercel Preview (independent invocations, shared governance across instances, real P50/P95/P99, health and readiness, coordinator recovery, alert delivery) | no Vercel access: no `vercel` CLI, no login, no `.vercel` directory on this machine; a hosted coordinator does not exist. Exact steps: `docs/ops/D31_VERCEL_CONFIGURATION_RUNBOOK.md`, `docs/ops/D31_COORDINATOR_HOSTING_RUNBOOK.md`, section 3 below |
| N=20 and N=30 live | N=6 already misses the window; the arithmetic matches the live result (model 144 s for N=12, measured 142 s) |
| Over-quota behaviour (429 storm) on purpose | exceeding the Sheets quota is "planned to incur charges ... later in 2026"; whether that is already in force is unknown, and billing is the owner's decision |
| Quota values of the project | the service account may not read them (`PERMISSION_DENIED`) |
| Higher-than-planned bursts, sustained traffic, admin plus donations, worker kill on Vercel, uncertain write against real Google | Preview is required for a faithful run; offline equivalents pass |
| Live competing allocations | the allocation path is paused in production and was last run live in D30; D36 changed only its compensating-reversal logic, tested offline |

## 3. Exact steps for the owner to unlock Preview acceptance (EXTERNAL)

1. Provide Vercel access (CLI login or a token for a Preview-only project) and confirm which Vercel project is the Preview target.
2. Host the coordinator without paid infrastructure (decision needed: see `d36-production-readiness.md` blocker B1), or accept a single-instance process for Preview only.
3. Set in the Preview environment only: `GOOGLE_TARGET_ENV=test`, the approved test spreadsheet id, `GOOGLE_LIMITER_URL`/`GOOGLE_LIMITER_TOKEN`, the same `GOOGLE_LIMITER_KEY_PREFIX` as production, `OPS_MONITOR_TOKEN`; never `FINANCIAL_ACTIVATION_APPROVED`, never `ALLOCATION_SERIALIZATION_VERIFIED`.
4. Run `scripts/preview-acceptance.mjs` and the workloads W1 to W12 of `docs/testing/performance-acceptance-plan.md`.
5. Record the results here with category PREVIEW.
