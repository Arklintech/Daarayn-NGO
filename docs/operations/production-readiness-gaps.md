# Production readiness gaps (D35)

Date 2026-10-31. Facts re-verified in this session unless marked HISTORICAL. Nothing was deployed, committed or changed in any external system.

## 1. Release verdict: NOT READY

Reasons, in order of weight:
1. The coordination host does not exist, and the locked constraints (no paid VM, no paid Redis, no Upstash, no new hosting) rule out the hosts it was designed for. Without it allocations and the shared request limiter cannot run on Vercel; production refuses to start without it by design.
2. The control fails the proposed concurrency workload by arithmetic (12 concurrent donations need about 2.4 minutes of read budget against a 60 s function limit).
3. Nothing has been verified on Vercel, against the real Google API, or across independent instances.
4. Financial correctness depends on a bounded-delay lease, not a storage fence.

Not "ready for controlled Preview testing": Preview also needs the coordinator host and Vercel access, neither exists.

## 2. Blockers

| # | Requirement | Owner | State |
|---|---|---|---|
| B1 | Decide the zero-cost coordination host (Apps Script PoC, or an owner-approved alternative) | owner + engineering | open; PoC specified in `apps-script-architecture-decision.md` |
| B2 | Reduce requests per donation (R1 to R3) with before/after counts | engineering | proposed, not implemented |
| B3 | Google quota decision: request an increase; decide on additional service accounts | owner | open (needs Cloud console access) |
| B4 | Vercel access (CLI/login), Preview deployment with the coordinator variables, same `GOOGLE_LIMITER_KEY_PREFIX` as production | owner | no access on this machine |
| B5 | Cross-instance acceptance on Preview (independent invocations share one budget, leases do not overlap, fail closed) | engineering after B4 | not done; offline and real-process results exist |
| B6 | Alert delivery: configure a recipient and prove one delivered alert (`quota-status`, `/api/admin/diagnostics/quota-health`, coordinator `/metrics`) | owner | endpoints exist; delivery not configured |
| B7 | Domain and DNS, HTTPS, OAuth route and authorised domains, privacy page | owner | no DNS records (HISTORICAL, D31) |
| B8 | Production worksheets, backup copy and migration rehearsal; onboarding validator ready (`lib/onboarding/validate.ts`) | owner | not done |
| B9 | Owner financial policies (rounding, refunds, reversal authority) | owner | not recorded |
| B10 | Spreadsheet access control: restrict editors, protect financial ranges (human edits bypass every control) | owner | not done |
| B11 | Source revision committed and identical to the tested Preview revision | owner authorises | 80 paths uncommitted; HEAD `7e1068e` |
| B12 | Decide the conflict on "Khidr AI": the directive says preserve, the repository records its removal by architecture decision | owner | open |

## 3. Security and operations review (this session)

| Area | Finding | Status |
|---|---|---|
| Authentication / authorisation | admin routes use `requireAdmin` (admin allowlist); donor routes verify a session; routes without a helper were each read and are public by design, token or state-cookie protected, or answer 410 (see request inventory) | OK |
| Service account | key from a gitignored JSON file or environment variables; never printed here; scopes and sharing not re-audited | partial |
| Secrets | `.env`, `.env.local`, `.env.production` are gitignored; no secret values were read or printed in this audit | OK |
| Rate limiting | donate uses an in-memory per-instance limiter and trusts `x-forwarded-for` (F4) | gap |
| Replay / signing | not applicable until an Apps Script caller exists; PoC spec requires HMAC + timestamp + nonce | PROPOSED |
| Audit logging | audit rows written after the financial row, non-fatal on failure (F3, finding 7 in the consistency review) | gap |
| Error responses | financial errors return explainable messages (`AllocationError`, `DonationWriteError`) without stack traces | OK (sample) |
| Health | `/api/ops/probe` (Preview only) and `/api/ops/quota-status` (token, 200/503 by threshold), coordinator `/health` `/ready` `/metrics`; a healthy endpoint is not proof of financial safety and the documents say so | OK |
| Backup / restore | spreadsheet version history and the coordinator state backup script exist (`tools/limiter-server/deploy/`); no rehearsed restore | gap |

## 4. Prioritised next actions

1. Implement R1 to R3 behind tests, re-run `tests/request-count-baseline.test.ts`, record the new counts (target about 11 requests per donation).
2. Owner: request the Google quota increase; decide on extra service accounts (B3).
3. Build the Apps Script PoC on a test spreadsheet (B1) and measure; decide the host.
4. Obtain Vercel access; deploy Preview; run the cross-instance and W1 to W12 live workloads (B4, B5).
5. Configure and prove alert delivery (B6).
6. Replace the per-instance donate rate limiter with a shared control (coordinator-backed) (F4).
7. Serialise donation status changes under the lease to close the compare-and-set window (consistency review, section 5).
8. Owner decisions B7 to B12; only then plan production deployment, then data onboarding (separate stage), then activation of financial operations.

## 5. What remains in place and must not be loosened

`FINANCIAL_ACTIVATION_APPROVED` and `ALLOCATION_SERIALIZATION_VERIFIED` stay unset in production; `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL` is never set on Vercel; the coordinator fails closed; the write guard restricts writes to approved targets; no live traffic was generated by this audit.
