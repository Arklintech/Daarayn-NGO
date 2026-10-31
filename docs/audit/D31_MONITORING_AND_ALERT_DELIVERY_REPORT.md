# D31.6 Monitoring and alert delivery report

## 1. Verdict
Alerts configured: NO. Alert delivery verified: NO. No notification channel exists, no authorised alert recipient was provided, and there is no Google Cloud or Vercel access from which to create alert policies. Per the release rules, a rule that exists in code or a local simulation does not count: every alert below is NOT CONFIGURED.

## 2. What exists in the code (IMPLEMENTED and TESTED LOCALLY)
| Capability | Where | Semantics (verified from the code) |
|---|---|---|
| Rolling 60 s consumption per kind, peak, shed counts per priority | `lib/google/usage.ts` | per server instance only |
| Global rolling 60 s grants, queue depth per kind, refusals, penalties, storage failures, active leases | coordinator `GET /metrics` (token) | global |
| Alert evaluation | `lib/google/quotaAlerts.ts` | utilisation bands 70 % warning, 80 % high, 90 % critical (identity and project budgets), queue depth at 50 % and 80 % of the wait limit, coordinator unreachable or not configured (critical), storage failure (critical), quarantine (high), HTTP 429 seen by this instance (high), retries above 10 % of attempts (warning), shed requests (warning), uncertain financial operations (high, only when a count is supplied) |
| Detail page for people | `GET /api/admin/diagnostics/quota-health` (admin session) | full detail |
| Machine endpoint for monitors | `GET /api/ops/quota-status?min=warning|high|critical` with `Authorization: Bearer <OPS_MONITOR_TOKEN>` | 200 while the worst alert is below `min`, 503 at or above it; default `min=high`; 404 until the token is set; costs one coordinator call and no Sheets request; body lists codes and severities only |
Important semantics for policy design: the endpoint answers ONE overall severity. Three uptime checks (`min=warning`, `min=high`, `min=critical`) therefore produce the three levels; a 503 does not say which threshold was crossed except through the returned `alerts` codes. HTTP 429 and retry counts are per instance; the global evidence for 429s is Google's own metrics. P0/P1 refusals appear as the `REQUESTS_SHED` warning plus the `shed` counters in `quota-health`; there is no dedicated automatic P0 alert code (listed as a gap). Uncertain financial operations and allocation lease failures are NOT visible to the cheap endpoint (it makes no Sheets read): they need the reconciliation page, a low-frequency authorised check, or application logs (gap).

## 3. Monitoring items requested and their status
| # | Item | Source | Status |
|---|---|---|---|
| 1, 2 | Sheets read / write utilisation | coordinator `/metrics`, `quota-status` | metric IMPLEMENTED; alert NOT CONFIGURED |
| 3, 4 | Project / identity quota utilisation | same | as above |
| 5 | HTTP 429 | per-instance counter, coordinator penalty counter (`GOOGLE_429_GLOBAL`), Google Cloud metrics | alert logic IMPLEMENTED; alert NOT CONFIGURED |
| 6 | Retries | `RETRY_AMPLIFICATION` | NOT CONFIGURED |
| 7, 8 | Queue wait, priority refusals | `/metrics` queue depth, `shed` counters | NOT CONFIGURED |
| 9, 10 | Coordinator uptime and latency | uptime check on `/health` (latency from the check itself) | NOT CONFIGURED |
| 11 | Coordinator state failures | `storageOk`, `storageFailuresSinceStart`, `/ready` | NOT CONFIGURED |
| 12 | Disk capacity | Cloud Monitoring agent on the VM | NOT CONFIGURED (no VM) |
| 13 | Donation operation failures | Vercel Observability on `/api/donate` | NOT CONFIGURED |
| 14 | Allocation lease failures | application errors 503 on `/api/admin/allocations`; coordinator `activeLeases`, `leaseGrantsSinceStart` | NOT CONFIGURED; no dedicated code |
| 15, 16 | Uncertain financial operations, recovery backlog | reconciliation page; `quota-health` accepts a count but nothing supplies it automatically | GAP: no automated source |

## 4. What is required to finish (exact)
1. An authorised operational recipient (an e-mail address or chat webhook owned by the trust's operator; no donor address is ever used) and the owner's consent to create a notification channel.
2. Google Cloud access to create the uptime checks and alert policies, and Vercel access to enable Observability alerts and set `OPS_MONITOR_TOKEN`.
3. A deliberate test of each path on Preview against the TEST sheet and a record of who received which message and when (template in `docs/ops/D31_MONITORING_AND_INCIDENT_RUNBOOK.md`). Until then: NOT CONFIGURED.

## 5. Gaps that remain in the code (to schedule)
Dedicated alert codes for P0/P1 refusals and for allocation lease failures; an authorised low-frequency check that counts interrupted donations and old placeholders and feeds `uncertainFinancialOperations`; (DONE in D31) global 429 evidence: the coordinator's `penaltiesSinceStart` now raises the `GOOGLE_429_GLOBAL` alert (high) in `quota-health` and `quota-status`.
