# Performance and concurrency acceptance plan (D35)

Date 2026-10-31. The control is the existing implementation as measured by `tests/request-count-baseline.test.ts` (`docs/testing/evidence-d35/request-baseline.json`). Environment of that control: in-memory fake Sheets, 0 to 4 ms random delay per call, limiter off, one Node process, Windows 11. Its latencies are **relative only**. Everything marked PENDING needs infrastructure that does not exist yet.

## 1. Criteria

| # | Criterion (from the directive) | Status against the control |
|---|---|---|
| 1 | No material regression in public-page loading and ordinary UI interactions | NOT MEASURED this session; D34 changed only the hero video; no D35 change touches public pages |
| 2 | No Apps Script dependency for static pages or cached responses | Holds (no Apps Script exists) |
| 3 | Donation P95 latency regression <= 10% against the control | PENDING. The only change on the donation path is +1 read (saveAtRow, 15 -> 16 requests, +6.7%); real latency impact unmeasured. If one read costs about the average request time, expected P95 impact is of the same order (about +6%), **an estimate, not a result** |
| 4 | P99 measured and reviewed | Offline P99 recorded (12/20/30: 298 / 362 / 285 relative ms); real P99 PENDING |
| 5 | No uncontrolled retries or storms | Bounded retry policy VERIFIED in code (5 attempts, 40 s cap, full jitter, shared 429 penalty); under load unmeasured |
| 6 | No duplicate financial records | Holds offline (0 duplicate ids in 12/20/30 bursts, competing allocations) |
| 7 | No overspending | Holds offline (allocation-contention); not proven deployed |
| 8 | No quota-related failures in the defined workload | **Fails by arithmetic** for the 12/20/30 workloads at 45/45 per minute (audit section 4); not run live |
| 9 | Safe rejection when coordination is unavailable | Holds with real coordinator processes (HISTORICAL for hosted) |

## 2. Workloads (same harness before and after any change)

| ID | Workload | Offline (done) | Live Preview (pending) |
|---|---|---|---|
| W1 | one donation | yes | yes |
| W2 | 12 concurrent donations | yes | yes |
| W3 | 20 concurrent donations | yes | yes |
| W4 | 30 concurrent donations | yes | yes |
| W5 | burst above planned concurrency (e.g. 60) | no | yes |
| W6 | admin traffic plus donations | no | yes |
| W7 | sustained traffic (30 min at planned rate) | no | yes |
| W8 | quota exhaustion | covered by existing limiter tests | yes |
| W9 | coordinator unavailable | real-process tests (passed) | yes |
| W10 | timeout after an uncertain financial write | existing tests (donation retry, allocation key) | yes, with injected timeout on the test sheet |
| W11 | process termination and recovery | existing tests | yes (kill a Preview function mid-donation) |
| W12 | allocation competition on a fixed balance | yes (2/6 competitors, 10 trials) | yes (12/20/30 competitors, repeated) |

Metrics to record per run: P50/P95/P99, throughput, successes, failures, HTTP 429 and 503 counts, retries, Google requests per operation (from `/api/admin/diagnostics/quota-health` and the usage counters), coordinator calls per operation, lease wait and hold times, end-to-end donation and allocation duration, function duration against the 60 s limit.

## 3. Rules for the live runs

- Test spreadsheet and test Drive folder only (the write guard enforces approved targets); dummy donors on `.invalid` addresses; the email allowlist stays on; no real email.
- Production financial flags stay unset; the Preview deployment uses `/api/ops/probe` and `scripts/preview-acceptance.mjs`.
- Each change is measured before and after with the same workload and the same network path; a change is accepted only if requests per donation fall or stay equal and no integrity check regresses.

## 4. Command reference

```bash
npx vitest run tests/request-count-baseline.test.ts tests/financial-bypass-probe.test.ts
npx vitest run
npx tsc --noEmit --incremental false
```

## 5. Release gate for this plan

Not satisfied. Criteria 3, 4, 5, 8 need live runs; criterion 8 currently fails by arithmetic and needs R1 to R4 (request inventory) and a quota decision first.
