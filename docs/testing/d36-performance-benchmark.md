# D36 performance benchmark

Date 2026-10-31. **Categories are never mixed:** FAKE = in-memory Sheets (integrity and request counts; latencies are relative only), LIVE = real Google Sheets on the approved test spreadsheet only (one machine, one process, not Vercel), PREVIEW = Vercel Preview (**not run**), PRODUCTION (**not run, not allowed**). A result in one category is not evidence for another.

## 1. Requests per business operation

| Operation | D35 baseline (FAKE) | After R1 (FAKE) | After D36 (FAKE) | D36 before changes (LIVE) | After D36 (LIVE) |
|---|---|---|---|---|---|
| Donation, new donor, specific cause | 9 R + 7 W | 9 + 5 | **8 + 5** | 12 + 5 (counts include a leaked audit write of the previous donation) | **9 + 5** (a header batch of a cold instance included) |
| Donation, returning donor, specific cause | n/a | 8 + 4 | **7 + 4** | 9 + 5 | **7 + 4** |
| Donation, general (new donor in FAKE, returning donor in LIVE) | 7 + 6 | 7 + 5 | **7 + 5** | 8 + 5 | **6 + 4** |
| Replay of a recorded donation | 3 + 0 | 3 + 0 | 3 + 0 | n/a | n/a |
| Allocation | 2 + 2 | 2 + 2 | 2 + 2 | 3 + 2 | 3 + 2 (1 cold header read) |
| Status change | n/a | n/a | n/a | 1 + 2 | 1 + 2 |

Note: the FAKE and LIVE general-donation figures differ by one read and one write only because FAKE measures a new donor and LIVE a returning donor. The FAKE harness agrees with LIVE on the warm path once the fire-and-forget duplicate audit write is accounted for: that write (2 reads + 1 write per donation) is outside the FAKE harness because the harness measures `processDonation`, while the write lived in the HTTP route and finished after the measurement window in LIVE, which is why it first showed up as a surplus in the next operation. **A reduction counted only in FAKE would have missed it; LIVE counts are the ones to plan with.**

Coordinator calls per operation: one limiter reservation per Google request (donation: 10 to 14; allocation: 5) plus 3 lease calls (acquire, check, release) for an allocation, a designation change and **every status change** (D36). No hosted coordinator exists; a local coordinator process was used for the LIVE bursts.

Changes behind the numbers (each with tests, none weakens a financial guarantee; R2 and R3 refused): R1 batched follow-up appends; designation pre-read removed on the first-run path only; duplicate route audit write removed; header rows of all known tabs fetched in one request on a cold instance.

## 2. Concurrency, FAKE (integrity and counts only)

Three runs of `tests/request-count-baseline.test.ts` after Phase B (preserved baseline untouched):

| N | Reads per donation (3 runs) | Writes per donation | ID-collision retries (3 runs) | Duplicate ids | Placeholders left | Relative P50 / P95 / P99 ms (3 runs) |
|---:|---|---|---|---:|---:|---|
| 12 | 8.0, 8.3, 8.0 | 5.0 to 5.2 | 0, 2, 0 | 0 | 0 | 254/269/269, 228/285/285, 249/281/281 |
| 20 | 9.4, 8.7, 9.6 | 5.3 to 5.8 | 14, 7, 16 | 0 | 0 | 248/736/823, 245/423/460, 281/690/753 |
| 30 | 9.6, 8.1, 8.0 | 5.0 to 5.8 | 24, 2, 0 | 0 | 0 | 265/729/761, 253/320/338, 282/298/298 |

Spread: **8.0 to 9.6 reads per donation**. An ID collision costs about one extra read and write for the colliding request; collisions are timing dependent, hence the spread. The relative P95/P99 rise when collisions occur; they are artefacts of the fake network and must not be quoted as latency.

## 3. Concurrency, LIVE (real Google, shared coordinator at 45/45 per minute, approved test spreadsheet)

| N | Wall time | Accepted | 429s | Retries | Within 60 s | Latency P50 / P95 / max (s) | Reads / writes per donation | Integrity |
|---:|---:|---:|---:|---:|---:|---|---|---|
| 6 | 68 s | 6 / 6 | 0 | 0 | **0 / 6** | 66.3 / 67.9 / 67.9 | 8.7 / 5.8 | 6 distinct ids, 0 PENDING, 6 designation rows |
| 12 | 142 s | 12 / 12 | 0 | 0 | **0 / 12** | 131.5 / 142.1 / 142.1 | 9.0 / 5.9 | 12 distinct ids, 0 PENDING, 12 designation rows |
| 20, 30 | **not run** | | | | | | | the arithmetic below is unambiguous and the function limit is already exceeded at 6 |

The 60-second function limit was **not enforced** in these runs (the test lets the limiter queue), so they measure the time the work needs: on Vercel the same requests would be cut off at 60 s with part of the work done (placeholder or partial rows, repaired by recovery; never exercised on Vercel). The model predicted 144 s for N=12 (108 reads at 45 per minute); LIVE measured 142 s.

## 4. Can 12 / 20 / 30 finish inside 60 s?

At 45 reads per minute (the configured budget) at most **5** simultaneous donations; at Google's documented 60 per user, 7. Required per-user read quota to finish inside 60 s: 12 -> 108 to 156, 20 -> 180 to 260, 30 -> 270 to 390 per minute (typical to planning figures). **They cannot, with the current architecture and quota.** Required change: raise the quota (`d36-google-sheets-capacity-plan.md` section 5) or adopt queued intake with explicit states (section 4 there). The runs above show the system degrades safely, not that it meets the target: no duplicate, no lost donation, no 429, only latency.

## 5. Gates from the directive

| Gate | Result |
|---|---|
| No duplicate financial records | FAKE and LIVE: pass |
| No overspending | FAKE contention tests pass; not run live in D36 |
| No false success | pass (partial states explicit) |
| No uncontrolled retries | FAKE: collisions bounded; LIVE: 0 retries, 0 429 |
| Donation P95 regression <= 10% against the control | **cannot be assessed**: the control (D35) has no LIVE latency; request count fell about 35% (fewer requests lowers latency at equal queueing) |
| 12/20/30 within the execution window | **FAILS** (section 4) |
| Higher-than-planned bursts, quota exhaustion on Google, sustained traffic, admin plus donations, worker termination on Vercel | **NOT RUN** (no Vercel; over-quota on purpose avoided: exceeding quota is planned to be billable) |
| Coordinator failure, uncertain write, recovery | covered by existing FAKE/real-process tests (passed); not run on Vercel |
