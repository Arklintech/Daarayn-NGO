# D38 Vercel Preview acceptance

Date 2026-11-01. **Status: NOT RUN. No Vercel Preview result exists, and none is claimed.**

## 1. Why it was not run (facts checked on this machine)

| Check | Result |
|---|---|
| Vercel CLI | not installed (`vercel`: absent) |
| Linked project | no `.vercel` directory |
| Credentials | no `VERCEL_*` variable in the environment; the OIDC token seen in D31 had expired in September and is not a deploy credential |
| Repository `vercel.json` | only `{"name": "daarayn-ngo"}`: no functions, no queue trigger, no cron, no region |
| Plan, Fluid Compute, function memory and region of the project | **NOT VERIFIED** (need dashboard or CLI access) |
| Queues enabled for the project | **NOT VERIFIED** |

Nothing was deployed, no deployment was attempted, and nothing was committed or pushed.

## 2. What is ready for the owner

| Item | File |
|---|---|
| Queue trigger (`queue/v2beta`, topic `daarayn-intake`, `retryAfterSeconds 30`, `maxDeliveries 8`) and a once-a-day reconciliation job (valid on the Hobby plan) | `deploy/vercel.d38-preview.json`, applied only to a deliberate Preview with the documented `--local-config` option of `vercel deploy` |
| Acceptance driver (refuses any host that is not `*.vercel.app` unless overridden; dummy donors on `.invalid`; measures acknowledgement latency, replays, drain time, spot-checks final states) | `scripts/preview-d38-acceptance.mjs` |
| Routes | accept `/api/intake/accept`, status `/api/intake/status`, consumer `/api/queues/intake-finaliser`, reconcile `/api/internal/intake/reconcile`, admin `/api/admin/intake-queue`, monitor `/api/ops/queue-status`; screens `/donate/status`, `/admin/queue` |

## 3. Exact steps (OWNER)

1. Provide access: `npm i -g vercel`, `vercel login`, `vercel link` to a **Preview-only** project (or a project whose Production is not live), and confirm in the dashboard the plan, Fluid Compute status, function region and that Queues is available (Beta on all plans, DOC). Confirm the Queues operations included (Hobby: first 1,000,000) and that no usage-based billing is switched on without your approval.
2. In the project settings, set these for the **Preview** environment only (not on the command line, so they do not enter shell history): `DONATION_INTAKE_MODE=queued`, `GOOGLE_TARGET_ENV=test`, the **approved test spreadsheet id** (`GOOGLE_SHEET_ID`, with the approved test Drive folder), the Google credentials of the test identity, `GOOGLE_LIMITER_ALGORITHM=window` only if a coordinator is available, `OPS_MONITOR_TOKEN`, `CRON_SECRET` (24+ random characters each). Never set `FINANCIAL_ACTIVATION_APPROVED` or `ALLOCATION_SERIALIZATION_VERIFIED`. Create a Protection Bypass for Automation secret (project settings) for the driver.
3. Deploy a Preview that applies the queue configuration: `vercel deploy --local-config deploy/vercel.d38-preview.json` (not `--prod`). The command prints the deployment URL.
4. Provision the worksheet once: submit one dummy submission (the first request creates `Donation_Intake` with its header row on the test spreadsheet), then run the driver:
   `node scripts/preview-d38-acceptance.mjs --url https://<preview>.vercel.app --n 1`, then `--n 6`, `--n 12`, `--n 20`, `--n 30` (add `--bypass <secret> --monitor-token <OPS_MONITOR_TOKEN>`).
5. Collect what the driver cannot see: Sheets reads and writes per operation and any Google 429 (an administrator opens `/api/admin/diagnostics/quota-health`), Queues operations and message age (Vercel Observability, Queues), function duration and cold starts (function logs), the `/admin/queue` screen after each run.
6. Failure drills (each followed by the admin screen and the driver's drain check): publish failure (revoke queue access for one run), worker termination (set a very short `maxDuration` on the consumer for one run), duplicate delivery (observe `deliveryCount`), queue loss (delete a deployment while messages are pending, then press "Redispatch").
7. Record every result in this file with the category PREVIEW, with the raw driver JSON.

## 4. Acceptance targets to judge the run against (from the directive; not adjusted)

Acknowledgement P95 <= 5 s and P99 <= 10 s per donation; all 30 cold-instance submissions acknowledged within 60 s; all 30 finalised within 120 s of the first submission; no Google quota rejection in the approved workload; no duplicate completed donation; no incorrect permanent id; no false `COMPLETE`; no indefinite pending record.

## 5. What the local evidence can and cannot stand in for

LIVE results from D37 and D38 (real Google, approved spreadsheet, one machine) show the Sheets side; they say nothing about Vercel cold starts, queue delivery latency, instance reuse or the real consumer. They are not a substitute for this run.
