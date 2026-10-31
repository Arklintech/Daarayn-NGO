# D31 Monitoring and incident runbook

Supersedes nothing: it completes `D30_MONITORING_AND_INCIDENT_RUNBOOK.md` and `D29_INCIDENT_AND_RECOVERY_RUNBOOK.md` with the D31 facts. STATUS: no alert is configured and no notification has been received by anyone.

## 1. Alert policy table (create with an authorised recipient; semantics verified from `app/api/ops/quota-status/route.ts` and `lib/google/quotaAlerts.ts`)
| Check | URL (header `Authorization: Bearer <OPS_MONITOR_TOKEN>`) | Alert condition | Meaning |
|---|---|---|---|
| Capacity warning | `https://<app>/api/ops/quota-status?min=warning` | status not 200 | worst alert is warning or higher: utilisation at or above 70 %, queue at or above half the wait limit, shed requests, retries above 10 % |
| Capacity protection | `...?min=high` | status not 200 | 80 % utilisation, quarantine, any Google 429 (`GOOGLE_HTTP_429`, `GOOGLE_429_GLOBAL`), queue at or above 80 %, uncertain financial count if supplied |
| Critical | `...?min=critical` | status not 200 | 90 % utilisation, coordinator unreachable or not configured, coordinator storage failure |
| Coordinator liveness | `https://<limiter-host>/health` | 2 minutes without 200 | process or VM or TLS down |
| Coordinator readiness | `https://<limiter-host>/ready` | not 200 for 3 minutes | quarantine or storage failing |
Read the JSON body of a failing check to see which codes fired. Vercel Observability: alert on 5xx rate and timeouts for `/api/donate` and `/api/admin/allocations`. VM: disk usage over 80 %, restart events.

## 2. Test and record (the only way an alert counts as configured)
For each row: fire it deliberately on Preview (stop the coordinator; lower `GOOGLE_SHEETS_READS_PER_MINUTE` in Preview to cross 70/80/90 % with a short burst; delete the coordinator state on the Preview coordinator; leave a `PENDING` placeholder in the TEST sheet and use the reconciliation check) and record:
| Alert | Policy created (date, by) | Fired (time) | Received by (authorised recipient) | Received (time) | Evidence file |
|---|---|---|---|---|---|
| (none yet) | NO | NO | nobody | | |

## 3. Daily, weekly, monthly, pre-campaign
Daily: Admin > Reconciliation (interrupted donations, placeholders older than 10 minutes) and `quota-health` status; Weekly: peak rolling reads/writes (`quota-health`, coordinator `/metrics`), 429 events, shed counts per priority, request growth; Monthly: Google quotas re-read, backups and a restore drill, capacity forecast, a coordinator failure drill on Preview; Before every release: `tests/request-governance.test.ts`, coordinator tests, allocation tests, activation tests, `tsc`, eslint, build, bundle scan, environment check (no Redis URL, same prefix, no process-local setting); Before large campaigns: capacity estimate against 4 donations a minute, quota-increase request to Google early if justified, a controlled test on Preview in a quiet window, alert delivery test.

## 4. Incident quick reference (details in the D29 incident runbook)
Coordinator unreachable: donors see a retryable "busy" message, nothing is recorded or lost; restore the coordinator. 429 seen: shared cooldown is active; find the cause; do not raise budgets. P0/P1 refusals: capacity exhausted; stop non-essential work; review the request growth. Uncertain financial operation: reconcile before completion, never resume automatically. Allocation busy / window ended: retry; if allocations misbehave, unset `ALLOCATION_SERIALIZATION_VERIFIED` and redeploy to pause them.
