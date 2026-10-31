# D38 burst-aware quota governance decision

Date 2026-11-01. Labels: SOURCE, OFFLINE (deterministic tests and a real coordinator process on this machine), LIVE (real Google, approved test spreadsheet only, one machine), PREVIEW (not run), DOC, OWNER.

## 1. The question

D37 acknowledged 12 simultaneous submissions in 46.8 s using 36 reads. Was the coordinator spacing requests one per 1.33 s needlessly, when Google's quota is per minute and permits concurrent requests inside it?

**Answer: yes, for bursts.** SOURCE (`lib/google/requestControl.ts`, `tools/limiter-server/gcra.cjs`): the limiter is a GCRA with a rate of 45 per minute and a burst of 5 (`GOOGLE_SHEETS_BURST`): after 5 requests every further one gets a slot 60/45 = 1.33 s after the previous. The slots are times, not a serial execution (callers wait for their slot and then run concurrently), but a burst larger than 5 is stretched over `(N - 5) x 1.33 s` even when the whole minute's budget is free. LIVE evidence: 30 submissions of 1 read each took **36.7 s** under that pacing and **3.5 s** under the window limiter below, with the same 30 reads and no 429.

## 2. Why not just raise the burst

A GCRA or token bucket with burst B and rate R admits `B + R x W` requests in a window of length W. With B = 45 and R = 45 per minute that is 90 in one minute (the test `limiter-window.test.ts` computes it): a burst just before and one just after a refill would exceed the documented 60 per minute per user. A fixed-window counter has the same flaw at the boundary (45 at 0:59 and 45 at 1:01). The quota's window alignment on Google's side is not known, so the limiter must be safe for ANY alignment.

## 3. Options evaluated

| Option | Burst when idle | Worst case in any 60 s | Verdict |
|---|---|---|---|
| Current GCRA (45/min, burst 5) | 5, then spaced 1.33 s | 5 + 45 = 50 | safe, slow for bursts (kept as the default) |
| GCRA / token bucket with burst 45 | 45 | 90 | **unsafe** |
| Fixed window of 60 s | 45 | 90 across a boundary | **unsafe** |
| **Sliding-window log, limit 45 per 60 s** | **45** | **45** | **chosen** |
| Batch reservations (reserve k slots per call) | as above | as above | not needed: one read per intake already; kept as a future option |
| Separate read and write budgets | n/a | n/a | already in place (each kind has its own window) |
| Priorities P0 to P3 | n/a | n/a | unchanged: the priority wait-share is a ceiling passed to the reservation (`maxWaitMs`); the window refuses beyond it and reserves nothing, exactly like GCRA |
| Project and principal counters | n/a | n/a | both supported (user 45, project 200 by default) |

## 4. The implemented algorithm

At most LIMIT grants in ANY window of WINDOW_MS (default **62 000 ms**, 2 s above the provider's minute to absorb client dispatch lag; `GOOGLE_LIMITER_WINDOW_MS`, clamped 60 000 to 120 000): the (i+LIMIT)th grant is at least WINDOW_MS after the ith. Sustained rate is therefore 45 per 62 s. Each grant is a possibly future time; times are monotonic per budget so order is preserved; a request whose wait would exceed its ceiling is refused and **reserves nothing**; a penalty (a 429 seen anywhere) blocks every later grant until it ends; a gate keeps every unknown budget closed during the coordinator's quarantine after lost state; old grants are pruned so the state is bounded. Implementations: `evalWindowReserve` in `tools/limiter-server/gcra.cjs` (the coordinator, persisted in the state file next to the GCRA keys, fsync before the slot is granted), `windowReserve` in `lib/google/requestControl.ts` (the process-local backend), the client command `WINDOW-reserve-v1` in `RedisRestLimiterBackend`. A property test proves the two arithmetics identical over 2000 random reservations. **Setting:** `GOOGLE_LIMITER_ALGORITHM=window`; the default is unchanged (`gcra`). It is a deployment-level setting: reserve and penalize both read it from the environment.

## 5. Proofs

| Evidence | Category | Result |
|---|---|---|
| 9 deterministic tests: idle burst admitted at once; 45 per sliding window for 1000 random arrivals over 5 seeds; the minute-boundary case (45 at 0 s, 45 at 59.9 s, 45 at 60.1 s: no window holds more than 45; the second burst is held to >= 60 s, the third to >= 120 s); sustained rate exactly 45 per minute; refusal reserves nothing; project budget binds; penalty; gate; JSON-persistable and bounded | OFFLINE | pass |
| Real coordinator process: burst of 45 at once, the 46th waits about 60 s, a request above the ceiling is refused and reserves nothing, invalid arguments refused, **a restart on intact state does not release a burst**, **lost state keeps every window closed for the quarantine**, the client speaks the same protocol (burst, pace, penalty) | OFFLINE (a real process on this machine, not a hosted coordinator) | pass |
| 30 simultaneous cold submissions, window limiter: acknowledgement 3.5 s, P95 3.4 s, 0 x 429 | LIVE | pass |
| Two bursts of 45 real reads around the boundary, window 62 s, real local coordinator, approved test sheet | LIVE | **pass**: burst 1 finished in 1.3 s, burst 2 held 62.2 s, total 63.5 s; 90 reads, 0 x 429, 0 retries; at most **45** requests dispatched in any 60 s window (of 90 sent) |
| Same test with a window of exactly 60 s (earlier run) | LIVE | 0 x 429, but **65** dispatched inside one 60 s span: client dispatch lag let the held burst overlap the first. This is why the default window is 62 s; an offline negative control (`tests/limiter-window.test.ts`, dispatch jitter) reproduces it |

## 6. Margin and what is still unknown

Limit 45 of the documented 60 per user and 200 of 300 per project leaves 15 and 100 for request-latency jitter (a grant at time t reaches Google at t plus a variable latency, so two grants 60 s apart can arrive slightly closer than 60 s), for other legitimate callers and for the unknown alignment. **The project's actual quota is NOT VERIFIED** (the service account may not read it: `PERMISSION_DENIED`, D36). Over-quota behaviour was not tested on purpose (exceeding quota is planned to become billable, DOC).

## 7. The shared-state requirement and the blocker

An in-memory limiter inside each serverless instance is **not** a shared limiter: with N instances it would admit N x 45 in a minute. Therefore: the window algorithm is implemented only where state is shared and durable, the self-hosted coordinator (and in process for tests). A Redis server does not run the marker command and the limiter then fails closed. **Vercel Queues is not an admission counter:** a queue delivers messages, it offers no atomic counter, its operations are not a rate gate, and its delivery order is approximate (DOC). The Apps Script coordinator remains the zero-cost hosting candidate evaluated in D36 (DEFER: its latency and quota behaviour are unmeasured). **Blocker, unchanged: no coordinator host exists under the locked constraints.** Consequence for Preview: Preview and production differ only by `GOOGLE_TARGET_ENV`/`VERCEL_ENV`: production refuses to run without a shared coordinator, a Preview without one falls back to the process-local limiter, which is per instance; a Preview burst across several instances can therefore exceed 45 reads per minute in total (the approved 30-submission workload needs about 49 reads in the minute, below the documented 60, so a 429 is not expected, but it is possible and must be recorded).

## 8. Decision

Adopt the sliding window as an option behind `GOOGLE_LIMITER_ALGORITHM=window`, default unchanged. Recommend `window` for the intake once (a) a shared coordinator is hosted and proven on Preview and (b) the owner has confirmed the real quota. Until then the default stays GCRA, which is safe and slower for bursts. This improves burst latency; it does not raise total throughput: a minute still holds 45 reads.
