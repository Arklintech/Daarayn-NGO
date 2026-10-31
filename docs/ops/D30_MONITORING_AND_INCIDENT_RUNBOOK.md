# D30 Monitoring and incident runbook

HONEST STATUS: the application side is built and tested; the destination side is NOT configured. No alert policy exists in Google Cloud Monitoring or Vercel, no notification channel was created, and NO test notification has been received by anyone. Per the release gates an alert counts as configured only after a deliberate test notification has been received by an authorised recipient and recorded in section 5.

## 1. What the application now offers to a monitor
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/ops/quota-status?min=warning|high|critical` (D30) | `Authorization: Bearer <OPS_MONITOR_TOKEN>` (server-side env var of at least 24 characters; the route answers 404 until it is set) | returns HTTP 200 while the quota status is below the chosen level and HTTP 503 at or above it. Costs one request to the coordinator and no Google Sheets request. Body: status, threshold, alert codes and severities only |
| `GET /api/admin/diagnostics/quota-health` | administrator session | full detail for a person (global coordinator metrics, instance counters, budgets, alerts) |
| Coordinator `GET /health`, `GET /ready` | none, no secret | liveness and readiness of the coordinator |
| Coordinator `GET /metrics` | the coordinator token | global rolling-60-second grants, queue depth, refusals, penalties, storage failures, active leases |

## 2. Alert policies to create (Cloud Monitoring uptime checks plus alert policies; destinations are the owner's)
| Alert | How | Fires when | Severity |
|---|---|---|---|
| 70 % capacity warning | uptime check on `https://<vercel-host>/api/ops/quota-status?min=warning`, custom header with the monitor token, response must be 200 | read or write budget >= 70 % over 60 s, or any warning-level alert | warning |
| 80 % capacity protection | same with `min=high` | >= 80 %, queue >= 80 % of the wait limit, any HTTP 429, uncertain state, quarantine | high |
| 90 % critical | same with `min=critical` | >= 90 %, coordinator unreachable or not configured, storage failure | critical |
| Any HTTP 429 | included in `min=high` (code `GOOGLE_HTTP_429`; counted per instance, so also check Google's own metrics for the project) | | high |
| Coordinator outage | uptime check on `https://<coordinator>/health` (2 failed minutes) and `/ready` | process down, TLS broken, VM down | critical |
| Backend failover or state uncertainty | `min=critical` or `min=high` (`COORDINATOR_STATE_UNCERTAIN`, `COORDINATOR_QUARANTINE`) | state lost, disk failing | critical / high |
| P0/P1 queue delay or refusal | `quota-status` reports `REQUESTS_SHED` as a warning; a P0/P1 refusal additionally shows as `shed.P0` or `shed.P1` in `quota-health` | refusals of critical work | critical (manual review of the shed counters; an automatic P0/P1-specific code is NOT implemented) |
| Uncertain financial operation | NOT covered by the cheap monitor: needs a Sheets read; use the daily reconciliation check, or add a low-frequency (every 15 minutes) authorised check later | interrupted donations or placeholders older than 10 minutes | high |
| Allocation recovery failure | NOT AUTOMATED: an allocation error answers 503 with a message; unresolved over-allocation shows in reconciliation | | high |
| Excessive retries | `RETRY_AMPLIFICATION` warning in `quota-status` | retries above 10 % of attempts | warning |
| Vercel errors and timeouts | Vercel Observability alerts on `/api/donate`, `/api/admin/allocations` | 5xx rate above 2 % or any timeout | high |

Notification channel: an authorised operator e-mail address or chat webhook chosen by the owner. No donor is ever contacted by monitoring.

## 3. Procedure to configure and TEST each alert (owner or operator with access)
1. Set `OPS_MONITOR_TOKEN` (random, 32+ characters) as a server-side environment variable in the target Vercel environment; redeploy.
2. Create the notification channel in Cloud Monitoring and send its built-in test notification; confirm it arrived.
3. Create the uptime checks and alert policies above (header `Authorization: Bearer <token>`; for `min=` checks set the response assertion to status code 200 so a 503 fails the check).
4. Fire each alert deliberately on the PREVIEW environment against the TEST sheet:
   - capacity: lower `GOOGLE_SHEETS_READS_PER_MINUTE` to 10 in Preview and run a short burst, or run the 20-donation test;
   - 429: not provoked on purpose; check the policy by temporarily lowering the threshold or inspecting the incident evaluation in a unit-test environment;
   - coordinator outage: stop the container for 3 minutes;
   - quarantine: delete the state file and restart (Preview coordinator only);
   - uncertain financial operation: leave a PENDING placeholder in the TEST sheet and run the reconciliation check.
5. Record in section 5: alert name, time fired, channel, who received it, time received.

## 4. Incident handling
Use `D29_INCIDENT_AND_RECOVERY_RUNBOOK.md` (scenarios, safe state, recovery, verification). Additional D30 scenarios:
| Scenario | Behaviour | Action |
|---|---|---|
| Allocation answers "busy" (503) | another allocation for the same donation holds the lease; nothing was written | retry after a few seconds |
| Allocation answers "exclusive processing window ended" (503) | the worker stalled past its safety margin and refused to write | retry; nothing was allocated |
| Allocations paused in production | `ALLOCATION_SERIALIZATION_VERIFIED` is not `true` | expected until verification; see the deployment runbook |
| Lease holder died | the lease expires after its time limit (75 s default, below which the coordinator will not re-grant it) | wait; the next command proceeds and counts any row the dead worker wrote |
| Coordinator state lost | no budget and no lease for 75 s | wait; investigate |

## 5. Verification register (fill in only after a notification was RECEIVED)
| Alert | Policy created | Test fired | Received by | Time | Evidence |
|---|---|---|---|---|---|
| (all) | NO | NO | nobody | | |
