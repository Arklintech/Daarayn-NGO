# D30 Cross-instance acceptance report

## 1. Status in one table
| Requirement | Level reached | Notes |
|---|---|---|
| Shared budget across independent client processes | TESTED ACROSS PROCESSES | three separate Node processes against the real coordinator program on one machine (D26, D29, D30: 24 grants within the configured rate; shared 429 penalty; restart continuity; outage; auth) |
| Shared lease across independent client processes | TESTED ACROSS PROCESSES | three processes, 12 exclusive intervals, no overlap, strictly increasing fencing tokens |
| Independent REAL Vercel function invocations sharing the coordinator | NOT VERIFIED | no Vercel access, no hosted coordinator |
| Preview deployment configured with the coordinator | NOT VERIFIED | the existing Preview (D27) predates D29/D30 code and its Sheets-backed routes answered 500 for reasons that could not be diagnosed without Vercel logs |
| Production fallback | TESTED LOCALLY | production without a coordinator refuses requests and leases; readiness 503 |
| Readiness shows the shared mode on a deployment | NOT VERIFIED | needs an administrator session on the deployment |
| Controlled timeout behaviour | TESTED LOCALLY and across processes | refused unsent, retryable 503 |
| Server-side secrets only | TESTED (bundle scan finds no coordinator token pattern; variable names carry no `NEXT_PUBLIC_`) | Vercel settings NOT INSPECTED |

Local processes are NOT presented as evidence of real Vercel coordination: Vercel adds platform concerns that no local test covers (instance reuse and freezing, cold starts, regional placement, function timeouts and the kill of a function at its maximum duration, outbound IP behaviour, TLS to the coordinator).

## 2. Protocol the owner (or an operator with access) must run on Vercel Preview
Preconditions: the coordinator is hosted over HTTPS (D29 runbook), its token is set in the Preview environment variables as `GOOGLE_LIMITER_URL`, `GOOGLE_LIMITER_TOKEN`, with the SAME `GOOGLE_LIMITER_KEY_PREFIX` Production will use; Preview points at the TEST spreadsheet and TEST Drive folder with the write guard (`GOOGLE_TARGET_ENV=test`); this branch (including D29 and D30) is deployed as a Preview; Production is not touched.
1. As administrator open `GET /api/admin/diagnostics/google-readiness`: expect `limiter.mode: "shared"`, `ready: true`, no URL or token in the body.
2. `GET /api/admin/diagnostics/quota-health` twice, from two browsers: `coordinator` metrics present both times (shows the instance reaches the coordinator); note `rollingGranted60s`.
3. From a script, issue 30 parallel public catalogue requests (`/api/programs`, P3) plus 12 parallel test donations (P0) against the Preview URL. While they run, poll the coordinator `/metrics`: `rollingGranted60s.read` must stay at or below the configured read budget (45 plus the burst allowance) although requests were served by many function instances; compare with `instance.rolling` of each instance (each sees only part).
4. Read the Vercel runtime logs to count distinct instance ids (or add the deployment's per-invocation id to a temporary log line) and record the number of independent instances that served the burst.
5. Stop the coordinator for 60 seconds: every Google-backed route must answer a controlled 503; start it: routes recover without a redeploy.
6. Remove the two variables from the Preview environment and redeploy: the Preview must answer readiness 503 `limiter_not_configured` (no process-local fallback).
7. Record all numbers in `docs/audit/` and only then consider setting `ALLOCATION_SERIALIZATION_VERIFIED=true` for that environment after the allocation test in the allocation report.

## 3. Evidence to be produced and where it goes
`docs/audit/evidence-d30/` (empty of Vercel evidence today). Until step 3 and 4 are recorded this report must say NOT VERIFIED for independent Vercel invocations.
