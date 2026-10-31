# D29 Monitoring and alerting runbook

HONEST STATUS: the alert RULES are implemented as code (`lib/google/quotaAlerts.ts`, evaluated by `GET /api/admin/diagnostics/quota-health` and unit-tested). NO external alert (Google Cloud Monitoring, Vercel Observability, e-mail or chat) is configured; none can be configured from this machine. An alert below is ACTIVE only when its configuration is listed as verified in section 4 (currently: none).

## 1. Where the numbers come from
| Source | What | Scope |
|---|---|---|
| Coordinator `GET /metrics` (token required) | rolling 60 s granted reservations per kind, queue depth per kind (ms), refused counts, penalties, storage failures, quarantine | GLOBAL (all instances) |
| `GET /api/admin/diagnostics/quota-health` (admin) | the coordinator metrics above evaluated against thresholds, plus this instance's counters | global + one instance |
| `GET /api/admin/diagnostics/google-usage` (admin) | per-operation counts, rolling 60 s peak, shed counts by priority, retries, waits | ONE instance only |
| Reconciliation page / `/api/admin/reconciliation` | interrupted donations, placeholders, integrity exceptions | persisted state |
| Google Cloud Console > APIs & Services > Sheets API > Metrics/Quotas | Google's own request and 429 counts | provider truth |
| Vercel logs/Observability | function errors, timeouts, durations | platform |

## 2. Thresholds (starting points, calibrate from measured traffic)
| Alert | Condition | Severity | Destination (to configure) | First response |
|---|---|---|---|---|
| Read or write utilisation | rolling 60 s granted / configured budget: >=70 % | warning | email to the operator | review the trend this week |
| | >=80 % | high | operator email + chat | defer non-essential work (P2/P3) |
| | >=90 % | critical | page the operator | protect financial traffic, shed P2/P3, find the growth |
| Project-level utilisation | same bands against the project budget (200) | as above | as above | check all consumers of the Google project |
| Any HTTP 429 | one is enough | incident (high) | page | incident runbook scenario 6 |
| Retry amplification | retries > 10 % of attempts | warning | email | find the failing call |
| Coordinator unavailable | `/health` fails for 2 minutes or quota-health `COORDINATOR_UNREACHABLE` | critical | page | scenario 1 / 4 |
| Coordinator latency | reservation call > 500 ms median over 5 minutes | warning | email | check VM CPU credits and network |
| Coordinator state uncertain | `storageOk=false`, quarantine active | critical / high | page | scenario 2 / 3 |
| Queue depth | >= 50 % / >= 80 % of the 25 s wait limit | warning / high | email / page | reduce load, schedule heavy work later |
| P0/P1 waiting time | any P0 or P1 refusal (`shed.P0`, `shed.P1` > 0) | critical | page | capacity is exhausted for critical work |
| Uncertain financial operations | any interrupted donation or placeholder older than 10 minutes | high | page | reconcile (never auto-resume) |
| Duplicate-operation detection | any reconciliation exception about duplicate keys | high | email | scenario 10 |
| Vercel error rate / timeouts | 5xx rate > 2 % over 10 minutes, any function timeout on `/api/donate` | high | Vercel alert | check Google and coordinator state |
| Disk usage on the VM | > 80 % | warning | Cloud Monitoring | grow disk |
| VM restart | any | warning | Cloud Monitoring | confirm `/ready` |

The application never raises a quota automatically in response to traffic.

## 3. Suggested configuration (owner)
- Cloud Monitoring uptime checks: `https://<limiter>/health` (alert after 2 failed minutes) and `/ready` (warning). Agent-based disk and CPU alerts on the VM.
- A scheduled job (Cloud Scheduler or an external monitor) calling an authenticated endpoint is NOT implemented; until then an operator checks `quota-health` daily (see the capacity planning runbook). If a push-based alert is wanted, add a protected route that returns the worst severity as a status code and point the uptime monitor at it (not done).
- Vercel: enable Observability alerts for function errors and duration on `/api/donate` and `/api/admin/allocations`.

## 4. Verification register (fill in only after testing a real alert)
| Alert | Configured | Test fired | Date | By |
|---|---|---|---|---|
| (all) | NO | NO | | |
