# Daarayn performance and reliability audit (D35)

Date: 2026-10-31. Branch `feat/daarayn-pre-release-hardening`, HEAD `7e1068e`, 80 changed paths in the working tree (D29 to D34 work, uncommitted). Nothing was committed, pushed, deployed or run against production; no real email, donation or allocation was created. This report was produced by reading the repository, running the offline suite and two new offline measurement/probe tests.

Labels used throughout: **VERIFIED** (read in code or observed in a test run this session), **TESTED** (a test result, with its limits), **HISTORICAL** (claimed by an earlier report, not re-verified), **ASSUMPTION**, **PROPOSED**, **RISK**.

## 1. What exists (VERIFIED against the repository)

| Area | Fact |
|---|---|
| Sheets access | One governed wrapper, `lib/google/sheets.ts` (`SheetsService.call` -> `withGoogleRetry` -> `acquireSlot`). Other direct callers: `lib/sync/GoogleSheetsClient.ts` (uses `paced`), `lib/realtime/eventLog.ts` (own client, `withGoogleRetry`), `lib/google/readiness.ts`, `scripts/inspect_google.ts`. `tests/request-governance.test.ts` is the CI guard against new unguarded call sites. |
| Request control | `lib/google/requestControl.ts`: GCRA reservation, identity budget 45 reads + 45 writes per minute, burst 5, max wait 25 s, project budget 200 + 200, priorities P0 to P3. Coordinator adapters: HTTPS REST, raw Redis. Fail closed by default. |
| Coordinator | `tools/limiter-server/server.cjs`, durable state, quarantine after state loss, leases with fencing tokens. **Not provisioned anywhere.** |
| Leases | `lib/google/allocationLease.ts`, resource `alloc:<donationId>`, TTL 75 s, wait 25 s. Production without a coordinator refuses to run (never falls back to a per-process table). |
| Financial pauses | `FINANCIAL_ACTIVATION_APPROVED` (donations, donation changes) and `ALLOCATION_SERIALIZATION_VERIFIED` (allocations) gate production. Neither is set anywhere reachable. |
| Routes | 61 `route.ts` files; 6 carry an explicit `runWithPriority` wrapper; 2 check a financial pause (see the request inventory). |
| Environment | No `vercel`, `gcloud`, `docker`, `flyctl` or Redis on this machine; no `.vercel` directory; no limiter or flag variables set in the process or `.env.local`; function region seen in earlier Preview evidence was `iad1` (HISTORICAL). |

Confirmed against the D29 to D32 reports: coordinator not provisioned, cross-instance Vercel acceptance not done, production not deployed, alert delivery not configured, production financial operations restricted by code, large uncommitted tree. All six statements hold today.

## 2. Test results (this session)

| Check | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0, 0 errors |
| `npx vitest run` | 62 files, 623 tests, all passed (baseline before this session: 60 files, 612). The 11 additional tests are the two new files below. |
| Allocation contention (existing, offline) | passed (competing allocations against one fixed balance, 10 randomised trials each) |
| Coordinator processes (existing, real processes) | passed (including lease fencing, quarantine, hard kill) |

Environment limits: every test uses the in-memory fake Sheets (`tests/helpers/fakeSheets.ts`) with 0 to 4 ms random delay per call and the request limiter switched off (`tests/setup.ts`). Latency figures from them are **relative only**; they say nothing about Google's latency or quota behaviour.

## 3. Request cost per business operation (TESTED, control)

Source: `tests/request-count-baseline.test.ts`, evidence `docs/testing/evidence-d35/request-baseline.json`. One counted call is one Google API request (a batched read counts once; the fake's internal nesting is excluded). Realtime event-log traffic uses a separate client and is **not** included, so real totals are higher by at least one request per donation.

| Operation | Reads | Writes | Notes |
|---|---:|---:|---|
| Donation, specific cause (after D35 fix) | 9 | 7 | was 8 + 7 before the lost-update fix below (+1 read) |
| Donation, general (no cause chosen) | 7 | 6 | |
| Retry of an already recorded donation | 3 | 0 | duplicate detected, nothing written |
| Allocation | 2 | 2 | plus 3 coordinator lease calls (acquire, check, release) and one limiter reservation per Sheets request |

Per-worksheet breakdown of the specific-cause donation (before the +1): Donations full-sheet reads 3, Donors 2, Donation_Causes 2, Causes+Program_Content batched 1; appends to Donors, Donations, Donation_Causes, Notifications, Audit_Log; two row updates on Donations.

| Concurrent donations (fake Sheets) | Succeeded | Duplicate ids | Placeholders left | Requests per donation | P50 / P95 / P99 (relative ms) |
|---|---:|---:|---:|---:|---|
| 12 | 12 | 0 | 0 | 16.0 | 283 / 298 / 298 |
| 20 | 20 | 0 | 0 | 16.3 | 252 / 330 / 362 |
| 30 | 30 | 0 | 0 | 16.0 | 283 / 284 / 285 |

Id collisions and retries occur inside the id algorithm under concurrency (log lines "ID collision ... retrying") and are included in these counts.

## 4. The dominant bottleneck

**The Google request budget, consumed by the number of requests per donation, not by lock contention or Apps Script-addressable latency.**

Evidence chain:
1. A specific-cause donation costs 9 reads and 7 writes (section 3), measured.
2. The configured identity budget is 45 reads and 45 writes per minute (VERIFIED in `requestControl.ts`). Google's published limits are 60 reads and 60 writes per minute per user per project and 300 + 300 per project; a service account counts as one user; a batch request counts as one request (checked on developers.google.com/workspace/sheets/api/limits on 2026-10-31).
3. Arithmetic (ASSUMPTION-free but **not measured live**): sustained capacity is limited by reads, 45 / 9 = about 5 donations per minute per identity at the configured budget (6.7 at Google's 60).
4. A burst of 12 concurrent donations needs 108 reads. At 45 per minute that is about 2.4 minutes of read budget (1.8 at 60), while the donate route's `maxDuration` is 60 s. Requests are queued, not refused, so most of the burst would be cut off mid-operation by the platform and left as `PENDING` placeholders or partial rows that recovery then repairs.

Therefore the existing implementation **fails** the proposed 12/20/30-concurrent acceptance workload by arithmetic, regardless of any lock. This must be confirmed on a real deployment before anything is relied on; it was not measured with the real limiter in this session.

Other candidates, assessed independently:

| # | Candidate | Finding |
|---|---|---|
| 1 | Excessive reads | Yes: 9 per donation, 3 of them whole-sheet scans of `Donations` (grows with the sheet). |
| 2 | Excessive writes | 7 per donation, 4 of them independent appends to four tabs. |
| 3 | Missing batching | Eligibility and the allocation inputs already use one batched read. The four follow-up appends (donor, notification, audit, designations) are separate requests. |
| 4 | Repeated identical data | Donors read twice, Donation_Causes twice, Donations three times in one operation. |
| 5 | Full-sheet scans | Every read is `A:ZZ` of the whole tab. |
| 6 | Serial round trips | The id algorithm is serial: read, claim append, re-read, write, verify read. About 15 serial requests per donation. |
| 7 | Coordinator requests | One reservation per Google request, plus 3 lease calls per allocation. Not measured against a real coordinator (none exists). |
| 8 | Lock contention | Only allocations for the same donation contend. Not a throughput limit. |
| 9 | Retry amplification | Bounded (5 attempts, 40 s elapsed cap, full jitter, quota penalty shared through the coordinator). Id-collision retries add requests under concurrency (visible in the counts). |
| 10 | Cold starts | Not measured. |
| 11 | Region latency | Function region `iad1` (HISTORICAL); Google round-trip not measured. |
| 12 | Dashboard aggregation | Not measured this session; the admin routes read whole tabs, cached 2 minutes in-process. |
| 13 | Unnecessary synchronous work | The donor waits for all follow-ups (including SMTP) because they run in parallel inside the request. |
| 14 | App-level processing | Negligible at current sheet sizes (the whole 30-donation burst ran in under 0.4 s on the fake). |

## 5. Defects found and fixed (financial integrity)

| ID | Defect | Evidence | Fix |
|---|---|---|---|
| F2 | A donation with ACTIVE allocations could be set to `rejected`/`pending` through `PATCH /api/admin/donations`. | Probe test failed: donation `rejected` with 60 still actively allocated. | Moving a donation out of the verified state now runs under the same `alloc:<id>` lease and is refused (HTTP 409, code `ACTIVE_ALLOCATIONS`) while active allocations exist. Probe now passes; reversing the allocations first allows it (test B2). |
| F8 | The donation's final completion write (`saveAtRow`) rewrote the whole row from memory and silently undid an admin verification made while the follow-up steps (including SMTP) ran. | Probe test failed: status `pending` after the admin had set `completed`. | `saveAtRow` re-reads the row and writes only the operational fields it owns. Cost: +1 read per donation (8 -> 9). Probe passes. |
| F1 | Lowering a designation (`recordDesignation`) ran outside the allocation lease, so it could interleave with an allocation checked against the old amount. | Code reading. The interleaving probe did **not** reproduce it in 15 randomised trials (that does not show absence). | `recordDesignation` now runs under the allocation lease. Closed by construction, not by a failing-then-passing test. |
| - | `maxDuration` of `/api/admin/donations` was 30 s and `/api/admin/designations` unset, while a lease wait can take 25 s. | Code reading. | Both set to 60 s (the lease TTL, 75 s, still outlives the function limit). |

New code is limited to: `lib/services/allocationService.ts` (`withDonationBalanceLock`, `assertNoActiveAllocations`), `lib/services/designationService.ts`, `app/api/admin/donations/route.ts`, `app/api/admin/designations/route.ts`, `lib/repositories/donationRepository.ts`, `lib/donations/designations.ts` (error type widened to include 503), plus the two test files.

## 6. Other verified findings (not changed)

| ID | Finding | Severity |
|---|---|---|
| F3 | If the compensating reversal of an over-cap allocation fails (`allocationService.ts`, the `total > designated` branch), the raw Sheets error propagates and the surplus row stays active until noticed. The lease makes the situation unlikely; it is the backstop. | Medium |
| F4 | `POST /api/donate` uses an in-memory, per-instance rate limiter (`lib/security/rate-limiter.ts`), so it does not limit across Vercel instances and trusts `x-forwarded-for`. | Medium (abuse control, not integrity) |
| F5 | The submission key is client generated (`DonateForm` uses `crypto.randomUUID`). A client that omits it gets a fresh server key per request and therefore no duplicate protection. | Medium |
| F6 | Notification and audit ids are `Date.now()` plus 4 random characters and are not checked for uniqueness (donation and allocation ids are). A collision is improbable, not impossible. | Low |
| F7 | Human editors of the spreadsheet can bypass every control. The locked architecture cannot prevent this; only sheet permissions and protected ranges can reduce it. | Policy |
| F9 | The task statement asks to preserve "Khidr AI". The repository records a deliberate decision to remove it (`ai-assist` answers 410, project instructions forbid AI inference providers). Nothing was added or removed. Needs an owner decision before any work. | Conflict |

## 7. Architecture

```
Browser --> Vercel (Next.js route, up to 60 s)
              |  runWithPriority P0..P3
              v
        SheetsService.call --> withGoogleRetry --> acquireSlot --> [coordinator: reservation]   (coordinator NOT PROVISIONED)
              |                                                     [coordinator: lease alloc:<id>, allocation/designation/status-away-from-verified only]
              v
        Google Sheets API  (sole operational store)        Google Drive (proofs, evidence)
```

## 8. Recommendation (summary; details in the decision document)

Keep **Design A, optimised direct Sheets access**, as the architecture. First reduce requests per donation (batched appends via one `spreadsheets.batchUpdate`, merged scans), then raise capacity at no hosting cost (request a Google quota increase, evaluate additional service accounts, which each have their own per-user limit under the 300 project limit). Evaluate Apps Script only as a possible zero-cost host for the coordination protocol, via an isolated proof of concept. See `apps-script-architecture-decision.md`.

## 9. Outstanding risks

1. The coordination host does not exist and the locked constraints exclude every host that was designed for it.
2. Throughput of the control fails the proposed concurrency criteria by arithmetic (not live-measured).
3. Stale-writer prevention is bounded-delay self-fencing, not storage fencing (Sheets cannot reject a stale token).
4. Nothing has been measured on Vercel or against Google in this session.
