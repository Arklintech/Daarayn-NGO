# Shared Google request limiter (D21)

## Why
All instances of the platform use ONE Google service identity. Google's documented quota is 60 read and 60 write requests per minute per user per project. A process-local limiter (D20) only protects one process; N instances can send N times the intended rate. The limiter state therefore has to live in a store every instance can reach, updated atomically. Google Sheets is never used for this.

## What is implemented (code)
- `lib/google/requestControl.ts`: `RedisRestLimiterBackend` — one counter per budget (`read`, `write`) per Google service identity (key = prefix + SHA-256 of the identity email, first 12 hex chars). A single Lua `EVAL` (GCRA) runs inside the store and uses the STORE's clock (`TIME`), so instance clock skew is irrelevant and two instances can never both take the same slot.
- Backend selection: shared when BOTH `GOOGLE_LIMITER_REDIS_REST_URL` and `GOOGLE_LIMITER_REDIS_REST_TOKEN` are set; otherwise process-local (and the admin readiness endpoint shows `limiter.mode = "process-local"` with a warning).
- Separate read and write budgets, burst, bounded wait (`GOOGLE_SHEETS_MAX_WAIT_MS`), penalty on Google HTTP 429 (shared by all instances), Retry-After and bounded retries: unchanged from D20.

## Environment variables (names only; values are the owner's)
| Name | Purpose | Default |
|---|---|---|
| `GOOGLE_LIMITER_REDIS_REST_URL` | REST endpoint of the Redis-compatible store | unset = process-local |
| `GOOGLE_LIMITER_REDIS_REST_TOKEN` | its access token (secret; server-only, never `NEXT_PUBLIC_`) | unset |
| `GOOGLE_LIMITER_KEY_PREFIX` | namespace (use different values for test and production) | `daarayn:sheets` |
| `GOOGLE_LIMITER_TIMEOUT_MS` | coordinator call timeout | 1500 |
| `GOOGLE_LIMITER_ON_COORDINATOR_FAILURE` | `fail_closed` or `degraded_local` | `fail_closed` |
| `GOOGLE_LIMITER_DEGRADED_SHARE` | fraction of the budget one instance may use alone in degraded mode | 0.25 |
| `GOOGLE_SHEETS_READS_PER_MINUTE`, `..._WRITES_PER_MINUTE`, `..._BURST`, `..._MAX_WAIT_MS` | budgets | 45 / 45 / 5 / 25000 |

Use different key prefixes (or separate databases) for test and production so a test run can never consume the production budget; the key already differs per service identity.

## Failure policy (coordinator unreachable, slow, wrong token, HTTP error)
- `fail_closed` (default): the request is refused BEFORE it is sent to Google, with a retryable error (HTTP 503 through the existing handlers). Nothing is stored; a retry or replay of the same submission key is safe. No instance can bypass the global limit. Cost: Sheets-backed features are unavailable while the coordinator is down.
- `degraded_local` (opt-in): the instance paces itself with `GOOGLE_LIMITER_DEGRADED_SHARE` of the budget until the coordinator answers again. The global limit can then be exceeded if more than `1/share` instances run; choose it only if availability matters more than strict quota.
- After a failure the coordinator is not called for 5 seconds, so a dead store cannot slow every request.

## Owner approval required (NOT done, nothing provisioned)
1. Choose and approve a managed Redis-compatible service with a REST API (for example Upstash Redis through the hosting marketplace) — an external service holding only counters (numbers), no donor data.
2. Create one database per environment; place URL and token in the hosting provider's server-side secret store (not in the repository).
3. Decide the failure policy (recommended: `fail_closed`).
4. Redeploy (separate approval) and confirm `GET /api/admin/diagnostics/google-readiness` reports `limiter.mode = "shared"`.
5. Run the multi-instance live test (below) against the approved test sheet before any production use.

Until step 1 to 4 are done, cross-instance enforcement is BLOCKED: the code is ready and tested against a local emulator, but no shared enforcement exists in any running environment.

## Evidence and its limits
`tests/shared-limiter.test.ts` runs several independent clients over real HTTP sockets against a local emulation of the coordinator (`tests/helpers/fakeRedisRest.ts`). It proves the client protocol, the atomic-reservation arithmetic, the shared penalty and the failure policies. It does NOT prove behaviour of a real Redis service, network latency, or Lua execution inside a real server. A multi-instance run against the real service must be recorded after approval.

## D22 additions
- **Production never silently falls back.** When `GOOGLE_TARGET_ENV=production` (or `VERCEL_ENV=production`) and the shared coordinator is not configured, the admin readiness endpoint answers HTTP 503 with `state: "limiter_not_configured"` and every Google request is refused unsent with a retryable error, unless the owner explicitly accepts a single instance with `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true`.
- **Every request is paced:** SheetsService, the realtime event log, readiness checks and the legacy sync client all pass through the same read/write budget (Drive has its own quota and is not covered).
- **Limits applied:** the budget is per Google service identity (Google's per-user limit, 60 reads and 60 writes a minute, is the binding one; the project limit of 300 a minute is not reached while one identity is used). Configure fewer than 60 (default 45).
- **Reservation lifecycle:** the key holds only the next-free-slot time (a number) and expires one minute after that slot; an abandoned reservation simply lapses. A timed-out call may or may not have reserved a slot: the cost is a small unused slot, never a bypass.
- **Compatibility to confirm on the real service:** the script uses `EVAL` with `TIME`, `GET`, `SET ... PX` and `string.format`. Upstash-style REST (`POST` of a JSON command array with a Bearer token) is assumed. This is NOT verified against a real service yet.
- **Verification after provisioning:** `npx vitest run --config vitest.live.config.ts tests/live/shared-limiter-real.live.test.ts` (three independent processes, throw-away key prefix, no Google calls). It reports NOT RUN until the two variables are set. Then repeat the six-donation live test with the same variables set on every process.

## D25: choosing a coordinator WITHOUT Upstash (decision required from the owner)

The application runs on Vercel (serverless: many independent function instances). Process-local limiting cannot work there. The limiter therefore needs ONE place that every instance reserves its request slot from. Any of these satisfies the code; none is provisioned yet.

| Option | What it is | Configure | Notes |
|---|---|---|---|
| A. Any Redis-compatible server over TCP | a managed Redis from any vendor (not Upstash), or a Redis you host | `GOOGLE_LIMITER_REDIS_URL=rediss://:PASSWORD@HOST:PORT` | Needs `EVAL`, `TIME`, `GET`, `SET ... PX`. TLS is used for `rediss://`. One short connection per reservation (serverless friendly). |
| B. Self-hosted coordinator service (this repository) | `tools/limiter-server/server.cjs`, a small Node program speaking the REST protocol; no third-party service | run it on ONE persistent host (small VM, Cloud Run with minimum instances 1, Fly.io, Render): `LIMITER_TOKEN=... PORT=8787 LIMITER_STATE_FILE=/data/limiter-state.json node tools/limiter-server/server.cjs`, then `GOOGLE_LIMITER_REDIS_REST_URL=https://host` and `GOOGLE_LIMITER_REDIS_REST_TOKEN=...` in the application | MUST be exactly one instance (two would each hold their own state). State is persisted after every reservation; if the file is lost the service holds all budgets off for `LIMITER_STARTUP_HOLDOFF_MS` (15 s) after a start. Put it behind HTTPS. A single instance is a single point of failure: the application then fails closed (503) rather than bypassing the limit. |
| C. REST front end of a Redis service | any service that accepts a JSON command array with a Bearer token | the two REST variables | Same script. |

Project-level quota: the reservation takes a slot from the identity budget and, in the same atomic step, from a project budget shared by all identities (`GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE`, `..._WRITES_PER_MINUTE`, default 200 each, below Google's 300 a minute; 0 disables). A Google 429 penalises both budgets.

What is verified: `tests/limiter-server.test.ts` starts the real coordinator service as its own process and runs three independent client processes against it (shared rate, restart continuing the budget, state-lost hold-off, shared 429 penalty, outage failing closed, wrong token). A redis:// path is tested against a local RESP emulator. A live six-donation run against the approved test sheet was run with the limiter routed through the coordinator process on the same machine. What is NOT verified: a coordinator hosted on real infrastructure reached from Vercel, network latency and failure modes of a managed Redis, and the Lua script inside a real Redis server (the script text is exercised only by the emulators' equivalent arithmetic).
