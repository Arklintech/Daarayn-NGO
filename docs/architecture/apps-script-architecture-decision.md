# Apps Script architecture decision (D35)

Date 2026-10-31. Apps Script has NOT been integrated, wired into Vercel, or provisioned; this document is an evaluation only. Facts about Google's limits were read from Google's documentation on 2026-10-31; everything about Apps Script latency and throughput in this environment is **NOT MEASURED** because no Apps Script project or test spreadsheet is reachable from here.

## 1. Evidence that decides the question

1. The dominant constraint is request count against the identity budget (16 requests per specific-cause donation, 9 of them reads; audit section 4), not lock contention and not Apps Script-addressable latency.
2. The designed coordinator (`tools/limiter-server`) is complete and tested but has no host, and the locked constraints exclude every host it was designed for (paid VM, paid Redis, Upstash). Today allocation and financial activation therefore cannot be enabled in production at all.
3. Google documents: Sheets API 300 + 300 per minute per project, 60 + 60 per user per project, a service account counts as one user, a batch request counts as one request. Apps Script: 30 simultaneous executions per user, 1,000 per script, 6 minutes per execution; the quotas page lists no web-app-specific limits, no lock limits and no per-minute spreadsheet limit. Whether `SpreadsheetApp` calls draw on the Sheets API quota is **not established**.

## 2. The three designs

### Design A, optimised direct Sheets access (current direction)

Vercel talks to Sheets with governance, batching, safe retries and the existing coordinator protocol.

| Aspect | Assessment |
|---|---|
| Latency | no extra hop; reductions R1 to R3 (request inventory) cut about 30% of requests (estimate) |
| Quota | bounded by the identity budget; levers that cost nothing: fewer requests, a quota increase request, additional service accounts |
| Financial guarantees | lease + self-fencing + post-write verification; bounded-delay mutual exclusion, not storage fencing |
| Blocker | the coordination host (none under the locked constraints) |
| Cost | no new service |

### Design B, Apps Script as quota and lease coordinator (Vercel still writes directly)

Vercel asks an Apps Script web app for slot reservations and leases (`LockService` around state kept in `PropertiesService`/`CacheService`/a hidden sheet), then calls Sheets directly.

| Aspect | Assessment |
|---|---|
| Added latency | one web-app round trip per reservation. The current protocol reserves per Google request (16 per donation). If each web-app call costs several hundred milliseconds (**unmeasured**), serial reservation would add several seconds to a donation. **Only viable if reservations are batched** (reserve the operation's planned slots in one call) |
| Lock contention | `LockService` serialises callers inside one script; throughput is bounded by executions per user (30 simultaneous) |
| Shared state | `LockService` plus durable storage is sufficient for leases with monotonic tokens; stale-token rejection still cannot reach Sheets |
| Reservation expiry / Vercel termination | same lease semantics as today; must keep TTL above the function limit |
| Apps Script limits | 6-minute execution, 30 simultaneous executions per user: adequate for reservations, unmeasured for lock wait |
| Failure recovery | script outage = coordinator outage; fail closed as now |
| Security | web app needs caller authentication: HMAC-signed request body with timestamp and nonce (replay protection) checked in the script; an obscure URL is not security; deployment "executes as owner, accessible to anyone" must be combined with the signature |
| Prevents quota overruns? | Only for traffic that reserves. It does not prevent overruns by callers that skip it; the CI guard already ensures the application does not |
| Value | **a zero-cost host for the coordination protocol that already exists**, which is the actual blocker |

### Design C, Apps Script as central financial writer

Vercel submits validated operations to Apps Script, which reads, validates and writes under a script lock.

| Aspect | Assessment |
|---|---|
| Guarantee | genuinely stronger than A: serialisation happens at the point of write, inside one execution, with no lease clock or fencing assumption |
| All mutations forced through it? | only if the Vercel service account is demoted to read-only on the financial tabs and the sheet editors list is restricted; both are access-control steps outside the code. Human editors remain a bypass (F7) |
| Idempotency / reconciliation | possible (key stored with the row), but must be reimplemented in a second language and deployment pipeline |
| Throughput | one global lock (or one per donation) with each operation taking seconds: serial writes are plausibly tens per minute; **unmeasured** |
| Cost of change | moves the donation, id and allocation logic out of the repository and its 623 tests into a script deployed by hand; large rewrite with its own failure modes |
| Verdict on justification | not justified now: the evidence does not show that Design A's guarantee is insufficient, only that its coordination host is missing |

## 3. Decision matrix

| Criterion | A: optimised direct | B: Apps Script coordinator | C: Apps Script writer |
|---|---|---|---|
| Fixes the measured bottleneck (request count) | Yes (R1 to R4) | No (only hosts the limiter) | Only if SpreadsheetApp is outside the Sheets API quota (unverified) |
| Removes the missing-host blocker | No | **Yes, at zero hosting cost (if the PoC passes)** | Yes (script is the host) |
| Added latency per donation | none | high unless batched (unmeasured) | one hop (unmeasured) |
| Strength of financial guarantee | bounded-delay mutual exclusion + verification | same as A | strongest (single writer under lock) |
| Rewrite risk | low | low to medium | high |
| Reversibility | n/a | high (adapter swap, protocol unchanged) | low |
| Evidence available now | strong (tests, counts) | none (needs PoC) | none |

## 4. Recommendation

- **Architecture: Design A.** It is the only design the evidence supports today and it addresses the dominant bottleneck.
- **Apps Script decision: PROOF OF CONCEPT REQUIRED**, limited to Design B (coordination protocol host: leases and batched slot reservations). **Design C is not recommended** at this time; reopen it only if the PoC shows that A's bounded-delay guarantee cannot be accepted by the owners.
- Not approved: any integration into Vercel, any change to the active coordinator configuration, any use of real data.

### Proof of concept specification (not started; needs an approved test spreadsheet and an Apps Script project the owner creates)

1. Isolated Apps Script project and a **test** spreadsheet; no connection to the live application or Vercel configuration.
2. Endpoints: `lease.acquire/check/release` and `slots.reserve(n)`, request body signed with HMAC-SHA256 over body + timestamp + nonce; reject stale timestamps and repeated nonces; constant-time comparison.
3. Measure from a local driver (and later from a Vercel Preview): P50/P95/P99 round-trip of each call, cold start, throughput at 12, 20, 30 concurrent callers, lock wait and hold times, behaviour at the 30-execution cap, behaviour when the script times out mid-lease.
4. Re-run the existing coordinator conformance tests (`tests/limiter-server.test.ts` lease cases, `tests/shared-limiter*.test.ts`) against an adapter for the script.
5. Accept only if: reservation batching keeps added donation latency within the 10% P95 budget against the control measured on the same network path; leases never overlap across 30 concurrent callers; the script fails closed; secrets are never logged.
6. Decide hosting of the production coordinator only after the PoC; until then financial operations stay paused in production.

## 5. Order of work (cheapest first)

1. R1 to R3 (request reduction) with before/after counts. 2. Ask Google for a quota increase and evaluate additional service accounts (owner approval needed for credentials). 3. Apps Script PoC (Design B). 4. Deploy the chosen coordinator host to Preview and run the cross-instance acceptance. 5. Only then consider enabling allocations in production.
