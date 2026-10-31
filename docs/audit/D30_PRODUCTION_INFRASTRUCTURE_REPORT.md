# D30 Production infrastructure report

Branch `feat/daarayn-pre-release-hardening`, start HEAD `7e1068e`, D29 and D30 work uncommitted. Nothing was provisioned, configured, committed, pushed or deployed in D30. Evidence labels: IMPLEMENTED / TESTED LOCALLY / TESTED ACROSS PROCESSES / TESTED ON INDEPENDENT VERCEL INVOCATIONS / INFRASTRUCTURE PROVISIONED / PREVIEW VERIFIED / PRODUCTION VERIFIED / NOT VERIFIED.

## 1. The discrepancy, resolved by reading the code
D29 spoke of "an HTTP coordinator on a VM" and of a "Redis REST adapter" with `GOOGLE_LIMITER_REDIS_REST_URL`. They are the SAME thing under a misleading name.

| Question | Answer (from `lib/google/requestControl.ts`, `tools/limiter-server/server.cjs`) |
|---|---|
| Does Vercel access Redis REST directly? | NO. The class `RedisRestLimiterBackend` (also a misleading name) sends one JSON command array per reservation by HTTPS POST to a URL with a bearer token. Nothing in the path is Redis unless you point that URL at a Redis REST gateway, which is not the plan |
| Does Vercel access the HTTP coordinator? | YES: `GOOGLE_LIMITER_URL` (alias `GOOGLE_LIMITER_REDIS_REST_URL`) is the HTTPS address of `tools/limiter-server/server.cjs` |
| Does the HTTP coordinator itself access Redis REST? | NO. It implements the three commands it needs (`EVAL` of the `GCRA-reserve-v3` script, `LEASE`, `PING`, plus `GET /health`, `/ready`, `/metrics`) in plain Node and keeps its state in a JSON file on its own persistent disk. There is no Redis anywhere in the selected design |
| Other backend present in the code | `GOOGLE_LIMITER_REDIS_URL` (`redis://`/`rediss://`): the same limiter class over a raw TCP connection to a real Redis server. Not selected: a Redis server needs its own hosting, has asynchronous replication (data loss on failover, no failover detection implemented) and Memorystore has only private addresses that Vercel cannot reach. No lease support exists on that path (leases need the Daarayn coordinator) |
| Which is chosen per environment | `createBackendFromEnv`: (1) `GOOGLE_LIMITER_REDIS_URL` set -> TCP Redis; (2) else `GOOGLE_LIMITER_URL`+`GOOGLE_LIMITER_TOKEN` (or the aliases) -> HTTP coordinator; (3) else process-local, allowed only outside production |

Fix made in D30: the preferred names are now `GOOGLE_LIMITER_URL` and `GOOGLE_LIMITER_TOKEN`; the `REDIS_REST` names remain accepted as aliases (tested). The `.env.example` and the Vercel configuration document use the new names.

## 2. Final architecture decision (smallest reliable design building on D26 and D29)
```
Browser -> Vercel (public site, admin, API routes, Khidr)
                |  1. POST reserve/lease commands (HTTPS, Bearer token), /metrics for monitoring
                v
        Coordinator (Node, tools/limiter-server) on ONE Compute Engine VM, behind Caddy TLS
                |  state file on a separate Persistent Disk (fsync before every answer)
                |
Vercel --2. Sheets API calls (after the coordinator granted the slot)--> Google Sheets (only source of truth)
Vercel --Drive API--> Google Drive          Vercel --Firebase--> Authentication          Vercel --SMTP--> Gmail
```
| Item | Decision |
|---|---|
| Topology | one VM, one process, one disk; no Redis; no second coordination system |
| Request flow | (1) Vercel asks the coordinator for a slot (atomic user + project budget, priority ceiling); (2) waits locally for its slot; (3) calls Google; (4) on HTTP 429 reports a shared penalty. Allocations additionally take a lease for the donation id (section 4) |
| State-storage flow | coordinator memory + JSON on the persistent disk (budgets, leases, fencing counters); no donor data, no financial data |
| Vercel variables (server-side only) | `GOOGLE_LIMITER_URL`, `GOOGLE_LIMITER_TOKEN`, `GOOGLE_LIMITER_KEY_PREFIX` (same value in every environment that shares the Google project; CORRECTION to D29's advice), optional `GOOGLE_LIMITER_TIMEOUT_MS`; budgets `GOOGLE_SHEETS_*`; allocation switch `ALLOCATION_SERIALIZATION_VERIFIED` (leave unset in production until verified) and optional `ALLOCATION_LEASE_TTL_MS` (75000), `ALLOCATION_LEASE_WAIT_MS` (25000), `ALLOCATION_LEASE_MIN_REMAINING_MS` (20000) |
| Coordinator variables (on the VM only) | `LIMITER_TOKEN` (same secret), `PORT`, `LIMITER_HOST`, `LIMITER_STATE_FILE`, `LIMITER_REQUIRE_HTTPS=true`, `LIMITER_QUARANTINE_MS` (75000; automatically never below `LIMITER_MAX_LEASE_MS`), `LIMITER_MAX_LEASE_MS` (75000), `LIMITER_ACCEPT_EMPTY_STATE` (first start only) |
| Authentication | Bearer token on every command and `/metrics` (constant-time compare, at least 24 characters); `/health`, `/ready` carry no secret |
| Network | Vercel to the VM over public HTTPS (443 only); the process binds 127.0.0.1 behind Caddy; no inbound 8787 |
| Restart and recovery | state continues after restart; lost or corrupt state means a 75 s quarantine of every budget and no leases; hard kill loses no granted slot or lease |
| Failure modes | coordinator down, unreachable, slow, wrong token, disk failing: every Google-backed request and allocation is refused unsent (retryable 503); no process-local fallback in production; single VM is a single point of failure by design |
| Cost assumptions (estimates, not verified quotes) | free tier may cover one e2-micro plus a 30 GB standard disk in us-west1/us-central1/us-east1; otherwise a few US dollars a month; static IP, snapshots, domain extra |
| Rollback | stop the container (application fails closed) or redeploy the previous Vercel deployment; do not set `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL` on Vercel |

Important consequence found while resolving this: because Google's quota is shared by every environment using the same service identity and project, Production and Preview must use the SAME key prefix. The D29 advice to separate them would have created independent budgets that together could exceed the real quota.

## 3. Read-only inspection of access (this machine)
| Check | Result |
|---|---|
| `gcloud` | not installed; no Google Cloud login; the repository's service-account JSON files are Sheets/Drive credentials and were NOT used to touch Google Cloud resources |
| `vercel` CLI / login | not installed / none; the only deployment-related secret is a short-lived `VERCEL_OIDC_TOKEN` in `.env.local`, not used |
| Project, VM, disk, firewall, billing, quotas | NOT INSPECTED (no access) |
| Vercel project configuration, Preview and Production environment variables, domains | NOT INSPECTED |
| GitHub | the branch was pushed earlier (D27) and the Vercel Git integration built a Preview deployment `dpl_AkvWwmyqzyeHPLtgJf1wLNtKmLK3` (success); it does not contain D29 or D30 code and was not touched |
Therefore: no infrastructure provisioned, no Preview configuration applied, no cross-Vercel test possible. Exact instructions: `docs/ops/D29_COORDINATOR_DEPLOYMENT_RUNBOOK.md` (VM) and `docs/ops/D30_FINAL_DEPLOYMENT_RUNBOOK.md` (order of steps).

## 4. Coordinator verification against the requirements
| Requirement | Status |
|---|---|
| HTTPS | enforced by the coordinator when `LIMITER_REQUIRE_HTTPS=true` (platform proxy header); TLS itself must be provided by Caddy/the platform: INFRASTRUCTURE NOT PROVISIONED |
| Authentication | IMPLEMENTED, TESTED ACROSS PROCESSES |
| Shared state access | IMPLEMENTED (single process owns the state), TESTED ACROSS PROCESSES |
| Health and readiness | IMPLEMENTED, TESTED |
| Automatic restart | Docker `--restart unless-stopped` documented; NOT PROVISIONED |
| Durable state | fsync + rename before every answer, TESTED incl. SIGKILL |
| Backup and recovery | snapshot procedure documented; NOT PROVISIONED |
| Monitoring | metrics and alert rules implemented; NO alert configured or delivered (see the monitoring runbook) |
| Fail-closed production behaviour | IMPLEMENTED, TESTED LOCALLY |
| Redis atomic operations / failover / reachability | NOT APPLICABLE to the selected design; for the optional Redis path: atomic by Lua, asynchronous replication means acknowledged writes can be lost, Memorystore is not reachable from Vercel |
