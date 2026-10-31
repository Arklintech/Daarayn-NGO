# D30 Final deployment runbook (ordered, with go / no-go gates)

Nothing in this runbook has been executed: no hosting, Vercel or Google Cloud access exists on the machine used for D29 and D30. Do not skip a gate.

## Phase 0: decisions the owner must make
1. Authorise ONE coordinator host (a Compute Engine VM with a separate Persistent Disk is documented in `D29_COORDINATOR_DEPLOYMENT_RUNBOOK.md`) and accept its cost; confirm the project (`daaraynorg-9165c` appears in the repository's credential file names, confirm in the console).
2. Read the real Google Sheets quotas (per user and per project) and record them; if they differ from 60/60 per user and 300/300 per project, change the budgets before anything else.
3. Decide the alert destination (e-mail address, chat) for the operational alerts.
4. Production worksheet and migration approval, domain/HTTPS, OAuth, financial policy: unchanged owner items.

## Phase 1: coordinator (gate: all checks pass)
Provision and start it exactly as in the D29 runbook (disk, Docker `--restart unless-stopped`, Caddy TLS, token in a secret store, `LIMITER_REQUIRE_HTTPS=true`, first start with `LIMITER_ACCEPT_EMPTY_STATE=true` then remove it). Gate: `/health` 200; `/ready` 200; POST without token 401; plain HTTP 421; `/metrics` with token; reboot of the VM returns the service with the state intact; a snapshot exists.

## Phase 2: Vercel PREVIEW only
Set in the Preview environment (server-side): `GOOGLE_LIMITER_URL`, `GOOGLE_LIMITER_TOKEN`, `GOOGLE_LIMITER_KEY_PREFIX` (the SAME value Production will use while both use the same Google project), `GOOGLE_TARGET_ENV=test`, the test spreadsheet and Drive folder ids. Keep `ALLOCATION_SERIALIZATION_VERIFIED` unset (allocations in production stay paused; in test environments they work). Deploy the branch as a Preview (needs authorisation to commit and push). Gate: run the protocol in `D30_CROSS_INSTANCE_ACCEPTANCE_REPORT.md` section 2 and record the evidence.

## Phase 3: tests on Preview against the TEST sheet
Run the six, twelve, twenty and thirty simultaneous donation tests, the allocation tests (2, 6, 12, 20 competitors) with a Preview URL as the target, idempotent replay, quota exhaustion, coordinator stop and start, and a deliberate Vercel timeout. Gate: the numbers in `D30_CAPACITY_AND_FAILURE_TEST_REPORT.md` are reproduced on Preview, no 429, no duplicate, no false success.

## Phase 4: monitoring (gate: a test notification was RECEIVED)
Follow `D30_MONITORING_AND_INCIDENT_RUNBOOK.md`: configure the uptime checks and alert policies, fire each one deliberately (for example stop the coordinator briefly, lower a budget in Preview to cross 70 percent), and record who received which message and when. Until each alert has been received it is NOT configured.

## Phase 5: production readiness gates (all must be true)
| Gate | Status today |
|---|---|
| Coordinator hosted and verified | NOT DONE |
| Shared coordination verified across independent Vercel invocations (Preview) | NOT DONE |
| Allocation serialisation verified on Preview with the real coordinator lease | NOT DONE on Vercel (verified locally and live on the test sheet with a local coordinator) |
| Alerts configured and received | NOT DONE |
| Donation recovery proven on Preview | NOT DONE on Vercel (proven on the test sheet locally) |
| No bypass path | PASS (CI guard) |
| Production worksheets and migration rehearsal | NOT DONE (no production-equivalent copy) |
| Domain and HTTPS | NOT DONE |
| OAuth production-ready | NOT DONE |
| Financial owner policies (90/10 wording, per-need funding, Students Sponsored) | NOT DECIDED |

## Phase 6: production (needs explicit authorisation at each step)
1. Set the Production variables (same URL, token, prefix; `GOOGLE_TARGET_ENV=production`; production sheet ids). Do NOT set `ALLOCATION_SERIALIZATION_VERIFIED` yet.
2. Deploy; check readiness shows `limiter.mode: "shared"`; smoke test the public pages and admin sign-in (no donation, no e-mail).
3. After the Preview allocation evidence is accepted, set `ALLOCATION_SERIALIZATION_VERIFIED=true` and redeploy to enable live allocations.
4. Run the monthly drill plan from the capacity runbook one week after launch.

## Rollback
Redeploy the previous Vercel deployment. If the coordinator misbehaves, stopping it makes the application refuse Google requests (retryable) rather than race; restoring the previous snapshot is safe. To pause allocations at any time, unset `ALLOCATION_SERIALIZATION_VERIFIED` and redeploy.
