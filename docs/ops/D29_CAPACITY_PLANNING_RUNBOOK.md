# D29 Capacity planning runbook

The goal is to notice growth BEFORE donors see a "busy" message, and to keep the same class of failure (Google Sheets quota exhaustion) from returning silently. This runbook does not claim immunity from provider outages or quota changes.

## 1. Facts to keep current (do not treat as permanent)
| Fact | Where to verify | Status |
|---|---|---|
| Google Sheets API quotas for the Daarayn project (reads and writes per minute per user, per project) | Cloud Console > APIs & Services > Google Sheets API > Quotas | NOT VERIFIED (documented defaults of 60 per user per minute and 300 per project per minute are assumed; no console access in D29) |
| Configured working budgets | `GOOGLE_SHEETS_*` variables, defaults 45 / 45 per minute (identity), 200 / 200 per minute (project), burst 5, wait limit 25 s | verified in `lib/google/requestControl.ts` |
| Measured cost per workflow | `docs/audit/D29_CAPACITY_AND_LOAD_TEST_REPORT.md` | measured on the test sheet (see report) |
| Supported workload | same report | derived from the measured costs and budgets |

## 2. The arithmetic (use it when planning)
Supported sustained donations per minute is about `min(read budget / reads per donation, write budget / writes per donation)`. With 45 reads and 45 writes a minute, and 11 reads and 7 writes for a project donation (9 and 7 for a returning donor, 7 and 6 for a general donation), the read budget binds: about 4 donations a minute (about 240 an hour) from donations alone, before admin and catalogue traffic. Short bursts above that queue for up to 25 s and then are refused with a retryable "busy" answer; priorities keep financial work admitted longest.

## 3. Cadence
- Daily (2 minutes): open Admin > Reconciliation (interrupted donations, placeholders) and `/api/admin/diagnostics/quota-health` (status, alerts). Anything other than `ok` is read and noted.
- Weekly (15 minutes): peak rolling-60 s reads and writes, 429 events (should be zero), shed counts per priority, request growth against donations, alert history.
- Monthly (1 hour): re-read the real Google quotas and record changes; run the isolated reliability drill (below); review coordinator backups and the restore evidence; review the traffic trend and forecast the next quarter.
- Before every significant release: run `tests/request-governance.test.ts`, the allocation contention tests and the limiter tests; confirm no new direct Sheets call; verify environment variables and alert configuration.
- Before a campaign or expected traffic spike: estimate peak donations per minute with the arithmetic above; if the estimate exceeds 60 percent of the supported rate, request a Google quota increase early (it is a request to Google, not an automatic action), pre-run a controlled load test against the TEST sheet, confirm coordinator health and the on-call person, and pause heavy admin jobs for the campaign window.

## 4. Scaling thresholds
| Sustained load | Action |
|---|---|
| < 60 % of supported donations a minute | none |
| 60 to 80 % | request quota review from Google, review request reductions (batching, caching of non-financial public data), plan the next step |
| > 80 % | do not run a campaign until capacity is raised; consider a second Google service identity ONLY with the owner's explicit decision (D29's locked rules forbid creating extra service accounts to bypass quotas) |
| any P0/P1 refusal | incident: capacity is exhausted for critical work |

Raising the configured budgets requires evidence that the real provider limit allows it; never raise them to hide inefficient requests.

## 5. Monthly isolated drill (TEST sheet only, no donor notification)
Start a coordinator locally or on a test VM with the TEST key prefix; run the six-donation, replay, exhaustion, and allocation contention live tests (`tests/live/concurrent-donations.live.test.ts` with `LIVE_COORDINATOR_URL` and `LIVE_COORDINATOR_TOKEN`); stop and restart the coordinator, delete its state, corrupt its state, and confirm the behaviours in the incident runbook; record the numbers in `docs/audit/`.
