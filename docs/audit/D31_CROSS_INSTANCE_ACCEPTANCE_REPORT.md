# D31.5 Cross-instance acceptance report

## 1. Verdict
Independent REAL Vercel function instances sharing the coordinator: NOT VERIFIED. No Preview carrying the current code exists, no coordinator is hosted and no Vercel access was available. What WAS verified this round is the closest local equivalent: three separate OS processes, each running the actual production build of the application (`next start`), all using the real coordinator program through the real application adapter. That is "TESTED ACROSS PROCESSES (real application build)", not "TESTED ACROSS INDEPENDENT VERCEL INVOCATIONS".

## 2. Instrumentation added (Preview and test only)
- `GET /api/ops/probe` (`app/api/ops/probe/route.ts`): takes 1 to 5 coordinator slots without any Google request and returns a random per-instance id (created when the function instance starts), boot time, `VERCEL_REGION`, `VERCEL_DEPLOYMENT_ID`, the limiter mode and readiness, the granted count, wait and refusal code. Protected by `OPS_MONITOR_TOKEN` (constant-time compare), answers 404 in a production environment (`VERCEL_ENV` or `GOOGLE_TARGET_ENV` = production) and when the token is unset. 3 tests. It must be removed or left unset (no token) after acceptance.
- `scripts/preview-acceptance.mjs`: parallel driver for one or many base URLs that counts distinct instance ids, checks the shared-budget spacing, read/write separation and priority behaviour, and reads the coordinator metrics. Output contains no token.
A distinct id only proves a distinct process/instance; the script reports the ids so the claim "N independent instances" rests on the ids, not on the number of requests.

## 3. Local multi-instance run (3 instances of the real build, local coordinator, budget 60 reads a minute = one slot a second, burst 1)
| Check | Result |
|---|---|
| Distinct instances that answered | 3 (ids differ, 8 calls each) |
| All instances use the shared coordinator, no process-local fallback | `limiterMode: shared`, `limiterReady: true` on every answer |
| One budget: 24 critical reads spread over the 3 instances | all 24 admitted; they completed over a span of 23 s (about one per second) with the longest wait 24.9 s, i.e. the instances queued behind each other on ONE budget (three independent budgets would have finished in about 8 s); the coordinator's rolling 60 s counter showed 41 grants |
| Read and write budgets independent | 6 reads and 6 writes both admitted in parallel |
| Priority across instances | a flood of 48 P3 requests: 5 admitted, 43 refused (retryable 503); the 6 P0 requests sent with the flood: 6 admitted, 0 refused |
| Operator token | wrong token 401, no token 401 |
| Coordinator stopped (2 instances) | both answer 503 `GOOGLE_LIMITER_UNAVAILABLE`, granted 0 (fail closed) |
| Coordinator restarted with intact state | both answer 200 again without a restart of the apps (after the 5 s cool-down) |
| Coordinator killed with `kill -9` and restarted | both continue (200) |
| State file deleted, restarted WITHOUT `LIMITER_ACCEPT_EMPTY_STATE` | `/ready` 503; the instance answers 503 `GOOGLE_BACKPRESSURE` (quarantine longer than the wait limit): nothing is granted |
| Redis URL AND coordinator URL both configured on an instance | `limiterReady: false`, granted 0, refusal `GOOGLE_LIMITER_NOT_CONFIGURED` (conflict detected, no silent precedence) |
Raw outputs: `docs/audit/evidence-d31/d31_multi.txt` and `d31_failure.txt`.

## 4. Not covered by the local run (needs the real Preview)
Real Vercel scheduling (cold starts, instance reuse, freezing), several regions, TLS and network latency to a hosted coordinator, the real function kill at `maxDuration` and its effect on a lease, 429 handling against real Google traffic from several instances, Preview versus Production variable separation, readiness through an administrator session on the deployment, and any stress test (those must use an isolated Google project or an agreed low-traffic window).

## 5. Procedure on the real Preview (after hosting and deployment)
1. Set Preview variables: `GOOGLE_LIMITER_URL`, `GOOGLE_LIMITER_TOKEN`, `GOOGLE_LIMITER_KEY_PREFIX` (the same prefix Production will use), `OPS_MONITOR_TOKEN` (new random value), the test spreadsheet and Drive folder ids and `GOOGLE_TARGET_ENV=test`; NOT `GOOGLE_LIMITER_REDIS_URL`, NOT `FINANCIAL_ACTIVATION_APPROVED`. Redeploy.
2. `OPS_MONITOR_TOKEN=... node scripts/preview-acceptance.mjs --base https://<preview-url> --calls 36 --coordinator https://<limiter-host> --coordinator-token <token>`; run it several times and from two different networks; accept "independent instances proven" only if `distinctInstances` is at least 2 and, ideally, the regions or boot times differ.
3. Check the admin readiness endpoint (`limiter.mode shared, ready true`) and `quota-health`.
4. Financial tests against the TEST sheet from the Preview URL: donation smoke, then 2, 6 and 12 simultaneous donations; replay of one submission key; allocation tests (2, 6, 12 competitors) once `ALLOCATION_SERIALIZATION_VERIFIED=true` is set FOR THE PREVIEW ONLY; coordinator stop/start; token mismatch.
5. Record everything in `docs/audit/evidence-d31/`. Stress tests of 20, 30 and 5x belong in an isolated Google project.

## 6. Financial invariant and lease scope (verified from the code)
The allocation invariant is per designation: the active allocations for one (donation, cause) must not exceed its designated amount (`activeAllocatedCents` in `allocationService.ts`); there is no cross-donation cause or project cap in the current rules (a cause's target amount is not enforced against allocations). The lease resource is `alloc:<donationId>`, which contains every designation of that donation, so the lease scope matches the protected aggregate. If a future rule adds a cross-donation cap, the lease must be widened (for example to the cause id) BEFORE that rule goes live. If the coordinator is unreachable or its quarantine is running, no lease is granted and the allocation answers a retryable 503 (tested). In production allocations stay paused until `ALLOCATION_SERIALIZATION_VERIFIED=true`.
