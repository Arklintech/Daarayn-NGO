# Deploying the Google request coordinator (limiter service)

Status: the package is ready (`tools/limiter-server/`), but NOTHING IS HOSTED. Hosting, its cost and its secrets are owner decisions. Until a coordinator is reachable from Vercel and configured, a production deployment refuses Google requests by design (fail closed).

## Why a coordinator
Vercel runs many independent function instances; all use ONE Google service identity, whose quota is 60 reads and 60 writes a minute per user (300 per project). Only one shared, atomic counter can keep their combined rate under that quota. The coordinator is that counter. It never sees Google data: it stores numbers (the next free slot time per budget).

## Host requirements
| Requirement | Why |
|---|---|
| Exactly ONE instance (max instances = 1, "recreate" deploys, no rolling overlap) | Two instances would hold two independent budgets. A lock file on the shared state disk refuses a second instance on the same disk; instances on different disks cannot see each other, so this is a hosting setting, not something the code can enforce. |
| A durable disk or volume mounted at the state path | The state is written (fsync + atomic rename) before every reply, so a restart continues the same budget. Without a durable disk every restart is a state loss and is quarantined. |
| HTTPS in front (platform TLS) | Quota requests are refused unless `X-Forwarded-Proto: https` when `LIMITER_REQUIRE_HTTPS=true` (default in the Dockerfile). |
| A secret `LIMITER_TOKEN` of at least 24 random characters | Every quota request needs `Authorization: Bearer <token>`. The service refuses to start with a shorter token. |
| Restart policy "always" | A crash must come back; while it is down the application fails closed (503), never bypasses. |

## Service settings (environment variables, names only)
| Name | Default | Meaning |
|---|---|---|
| `LIMITER_TOKEN` | required | shared secret (platform secret store, never in the image or the repository) |
| `PORT`, `LIMITER_HOST` | 8787, 0.0.0.0 | listener |
| `LIMITER_STATE_FILE` | `limiter-state.json` (image: `/data/limiter-state.json`) | state path on the durable disk |
| `LIMITER_REQUIRE_HTTPS` | false (image: true) | refuse quota requests that did not arrive over HTTPS |
| `LIMITER_QUARANTINE_MS` | 75000 | hold applied to EVERY budget when the state is missing, unreadable or invalid: Google's 60 s quota window plus a 15 s margin |
| `LIMITER_ACCEPT_EMPTY_STATE` | false | set to true ONLY for the very first start on a new empty volume to skip the one-time quarantine |

Endpoints: `GET /health` (process is up; no secret), `GET /ready` (200 only when storage is writable and no quarantine is running), `POST /` (quota commands, authenticated). Use `/health` for the platform liveness probe and `/ready` for readiness/alerts.

## Behaviour that matters
- **Restart with intact state:** the same budget continues; no burst.
- **State lost or corrupted:** all budgets are closed for the quarantine (75 s by default). Callers that would have to wait longer than `GOOGLE_SHEETS_MAX_WAIT_MS` (25 s) get a retryable "busy" answer instead of waiting. The corrupt file is kept beside the state as `.corrupt-<time>` for investigation. The quarantine is itself persisted, so a crash loop cannot shorten it.
- **Disk failure:** reservations are refused (503) and not granted; service resumes when the disk works.
- **Coordinator down or unreachable:** the application refuses Google requests unsent (retryable 503). `degraded_local` is NOT recommended and must not be enabled without an explicit owner decision.
- **Hard crash:** a slot is persisted before it is handed out, so no granted slot is lost.

## Application settings (Vercel, Production and Preview; names only)
`GOOGLE_LIMITER_REDIS_REST_URL` (the service's HTTPS URL), `GOOGLE_LIMITER_REDIS_REST_TOKEN` (the same secret as `LIMITER_TOKEN`), optional `GOOGLE_LIMITER_KEY_PREFIX` (different value for test and production namespaces), `GOOGLE_LIMITER_TIMEOUT_MS` (1500), `GOOGLE_SHEETS_READS_PER_MINUTE` / `..._WRITES_PER_MINUTE` (45), `GOOGLE_SHEETS_PROJECT_READS_PER_MINUTE` / `..._WRITES_PER_MINUTE` (200). Every Vercel environment instance must carry the same URL and token for the same namespace. Do not set `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL` on Vercel.

## Rollout checklist (owner)
1. Choose a persistent host (small VM, Fly.io machine with a volume, or a container service that supports one always-on instance with a volume). Build with `docker build -f tools/limiter-server/Dockerfile -t daarayn-limiter .`.
2. Generate the token, store it as the service secret, deploy ONE instance, mount the volume, confirm `/health` then (after the quarantine, or with `LIMITER_ACCEPT_EMPTY_STATE=true` for the first start) `/ready`.
3. Set the two application variables on Vercel; redeploy (separate approval).
4. Check `GET /api/admin/diagnostics/google-readiness`: `limiter.mode` must be `shared` and `ready: true`.
5. Run `tests/live/shared-limiter-real.live.test.ts` with the same URL and token (three processes, throw-away key prefix) and then the six-donation live run with the coordinator configured on every process.
6. Token rotation: set the new token on the service and on Vercel, redeploy both; expect a short window of retryable 503 answers.

## Limits of the evidence (today)
The coordinator program and its failure modes are tested as real separate processes on one machine (`tests/limiter-server.test.ts`, 17 tests). No hosted deployment, no network between Vercel and a host, and no real multi-instance Vercel run exists. Until step 5 above is done the limiter is NOT production-verified.
