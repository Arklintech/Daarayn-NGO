# D29 Vercel configuration for the shared limiter

Status: documented from the code; NOT applied. No Vercel access exists on the machine used for D29 (no CLI, no login). The authoritative variable names below were read from `lib/google/requestControl.ts` and `.env.example`; none was invented.

## Coordinator connection (server-side only; NEVER `NEXT_PUBLIC_*`)
| Variable | Meaning | Production | Preview |
|---|---|---|---|
| `GOOGLE_LIMITER_URL` (older alias `GOOGLE_LIMITER_REDIS_REST_URL`) | HTTPS URL of the coordinator (the REST adapter POSTs commands to it and reads `/metrics` from the same origin) | required | required (the SAME coordinator and prefix while Preview uses the same Google project) |
| `GOOGLE_LIMITER_TOKEN` (older alias `GOOGLE_LIMITER_REDIS_REST_TOKEN`) | the coordinator's `LIMITER_TOKEN` | required, secret | required, secret |
| `GOOGLE_LIMITER_KEY_PREFIX` | namespace of the budget keys (default `daarayn:sheets`). CORRECTION (D30): every environment that uses the SAME Google service identity and project (Production and Preview alike) must use the SAME prefix, because Google's quota is shared by all of them; different prefixes would create independent budgets that together can exceed the real quota. Use a different prefix only for a different Google project | same value | same value |
| `GOOGLE_LIMITER_TIMEOUT_MS` | coordinator call timeout (default 1500) | optional | optional |
| `GOOGLE_LIMITER_ON_COORDINATOR_FAILURE` | `fail_closed` (default) or `degraded_local` | leave unset (fail closed) | leave unset |
| `GOOGLE_LIMITER_REDIS_URL` | a raw `redis://` or `rediss://` URL for a real Redis server | do NOT set together with the REST pair | do NOT set together with the REST pair |
| `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL` | explicit single-instance acceptance | NEVER on Vercel | NEVER on Vercel |

## Budgets (defaults read from the source, verified)
`GOOGLE_SHEETS_READS_PER_MINUTE=45`, `GOOGLE_SHEETS_WRITES_PER_MINUTE=45`, `GOOGLE_SHEETS_BURST=5`, `GOOGLE_SHEETS_MAX_WAIT_MS=25000`, `GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE=200`, `GOOGLE_SHEETS_PROJECT_WRITES_PER_MINUTE=200`, `GOOGLE_RETRY_MAX_ELAPSED_MS=40000`. Do not raise these to hide inefficient request use; Google's documented per-user limits (60 and 60 a minute) and project limits (300 and 300 a minute) are NOT verified for this project: read them in the Cloud Console first.

## Environment labels already used by the application
`GOOGLE_TARGET_ENV` (`test` | `production`), `GOOGLE_SHEET_ID`, `GOOGLE_TEST_SHEET_ID`, `GOOGLE_PRODUCTION_SHEET_ID`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_DRIVE_TEST_FOLDER_ID`. Production means `GOOGLE_TARGET_ENV=production` or `VERCEL_ENV=production`; there the application refuses Google requests (retryable 503) and the readiness endpoint answers 503 `limiter_not_configured` unless a shared limiter is configured.

## Checks after configuring (owner)
1. `GET /api/admin/diagnostics/google-readiness` as an administrator: `limiter.mode` must be `shared`, `limiter.ready` true (no URL or token is shown).
2. `GET /api/admin/diagnostics/quota-health`: `coordinator` must contain metrics (reachable) and `status` should be `ok`.
3. Every Vercel environment that serves traffic carries the same URL, token and prefix for its namespace. Preview deployments use the Preview values.
4. Confirm no coordinator value appears in client bundles (the repository's bundle scan covers the token patterns) and none is printed in logs: the application never logs the URL or token.

## Failure behaviour (verified by tests with a local coordinator)
Coordinator unreachable, slow (>`GOOGLE_LIMITER_TIMEOUT_MS`), wrong token or HTTP error: the request is refused unsent with a retryable 503 (`GOOGLE_LIMITER_UNAVAILABLE`); for 5 s the coordinator is not called again. There is NO automatic fallback to process-local limiting in production. A donation is never reported successful unless its rows were persisted and verified.

## What this document does not establish
Nothing here proves that independent Vercel instances share the coordinator: that needs the hosted coordinator and a run across real Vercel invocations (NOT VERIFIED).
