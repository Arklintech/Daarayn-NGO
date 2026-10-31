# D31.2 Coordinator hosting and security report

Hosting status: NOT HOSTED (no VM, no DNS, no TLS, nothing public). This report records the security review of the coordinator code, what was verified locally and what can only be verified on the real host.

## 1. Code-level security review of `tools/limiter-server/server.cjs` (verified from the code and tests)
| Control | Result | Evidence |
|---|---|---|
| Authentication | Bearer token on every quota, lease and `/metrics` request; constant-time comparison; refuses to start with a token under 24 characters | tests: wrong token, same-length wrong token, missing token, short token refused |
| TLS | the process itself speaks HTTP and binds the address given by `LIMITER_HOST` (compose publishes it on 127.0.0.1); HTTPS is Caddy's job; with `LIMITER_REQUIRE_HTTPS=true` quota/lease/metrics requests without `X-Forwarded-Proto: https` get 421 | test (421) |
| Request validation | bodies over 4 KB are dropped; JSON must be an array; every number finite and in bounds; keys `[A-Za-z0-9:_.-]{1,200}`; at most 500 budget keys and 200 leases; lease TTL 1 s to `LIMITER_MAX_LEASE_MS` | 4 validation tests |
| Health endpoints | `/health` (alive) and `/ready` (storage writable, no quarantine) show only booleans and a countdown; no secret, no key names, no identities | tests |
| `/metrics` | token required; aggregate counters only (no keys, no identities) | test |
| Error handling | refusals are small JSON errors; no stack traces; state errors answer 503 and are logged without the token | code |
| Logging | start-up line shows port, trusted flag, quarantine; the token is never logged; Caddy deletes the Authorization header from its access log | code, Caddyfile |
| Data held | budget arrival times, lease records (resource id, worker id, token, expiry), fencing counters: no donor data, no financial data, no Google data | code |
| State file permissions | directory `0700` owned by uid 1000 on the host (install script); the container runs as `node`, root filesystem read-only | deploy files (NOT EXERCISED on a host) |
| Atomic persistence | temp file, `fsync`, rename before every answer; a failed save refuses the request and rolls the slot back | storage-failure test |
| Single process | lock file with heartbeat, dead-owner detection; a second instance on the same disk exits with code 2; a second instance on ANOTHER disk cannot be detected | test; limitation |
| Corrupt / missing state | quarantine of every budget and lease for `LIMITER_QUARANTINE_MS` (never below `LIMITER_MAX_LEASE_MS`), persisted so a crash loop cannot shorten it; the corrupt file is kept | tests |
| `LIMITER_ACCEPT_EMPTY_STATE` | defaults to false and is absent from the compose file; the install script documents it for the very first start only | deploy files |
| Hard termination | no granted slot or lease is lost after SIGKILL | test (and the real-build run below) |
| Concurrent mutation | single-threaded handler with synchronous persistence | tests (24 reservations, 3 processes) |

## 2. Verification against a real host (the required 18 checks): NOT RUN
Hosted `/health`, `/ready`, `/metrics`, quota reservation, priority admission, lease acquire/release, concurrent mutation, process termination, restart recovery, disk error handling, wrong token and external HTTPS access were NOT executed against a public HTTPS endpoint because none exists. The same checks were executed against the coordinator running as a LOCAL process (D26 to D30 and D31 below); that is evidence of the program's behaviour, not of the hosting.

## 3. Local verification this round (real application build, three instances, local coordinator)
See `D31_CROSS_INSTANCE_ACCEPTANCE_REPORT.md`: coordinator stop (all instances refuse, 503), restart with intact state (continues), SIGKILL and restart (continues), state deleted and restarted without accept-empty (`/ready` 503, requests refused as busy), conflicting backend configuration refused.

## 4. Deployment evidence record (to be completed on the host; no token is ever recorded)
| Field | Value |
|---|---|
| VM identifier / region / disk id and mount / image version / HTTPS hostname / health, restart, auth results / backup configuration | NOT AVAILABLE: not provisioned |

## 5. Limitations
Single VM = single point of failure (the application fails closed); no multi-region failover; TLS, firewall and SSH hardening depend on how the host is configured (IAP or an allow-listed address for SSH, only 80/443 open); Caddy and Docker patching is an operator task; Docker was not available here, so the container image and the compose file were not executed.
