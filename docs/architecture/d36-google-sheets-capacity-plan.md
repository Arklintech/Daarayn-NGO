# D36 Google Sheets capacity plan

Date 2026-10-31. Labels: **VERIFIED** (observed this session), **LIVE** (real Google, approved test spreadsheet only), **MODEL** (arithmetic from measured counts), **EXTERNAL** (needs the account owner), **ASSUMPTION**.

## 1. Who calls Google, and what the limits are

| Fact | Value | Basis |
|---|---|---|
| Principal | one **service account** in Google Cloud project `daaraynorg-9165c` (key file or env key) | VERIFIED (read from the credential file; only the project id and a masked email were printed) |
| Documented defaults | 300 reads + 300 writes per minute per project; 60 + 60 per minute per user per project; a service account counts as ONE user; a batch is one request; refills every minute; no daily cap | LIVE docs read 2026-10-31: [Google Sheets usage limits](https://developers.google.com/workspace/sheets/api/limits) |
| Actual quota of this project | **NOT VERIFIED.** The Service Usage API answered `PERMISSION_DENIED` for the service account, so the effective limits cannot be read from here | VERIFIED probe |
| Charges | standard use is free; "exceeding the quota request limits is planned to incur charges ... later in 2026"; no rate card was published in the sources found | docs + search 2026-10-31 |
| Application budget | 45 reads + 45 writes per minute per identity, burst 5, project budget 200 + 200, max wait 25 s (production), function limit 60 s | VERIFIED in `lib/google/requestControl.ts`, `donate/route.ts` |

Because every call uses one identity, **the binding limit is 60 reads per minute per user**, not the 300 per project.

## 2. Request cost per operation (measured)

LIVE on the approved test spreadsheet (`tests/live/quota-cost.live.test.ts`, after D36 Phase B):

| Operation | Reads | Writes | Total |
|---|---:|---:|---:|
| Donation, new donor, specific cause (instance partly cold: header batch) | 9 | 5 | 14 |
| Donation, returning donor, specific cause | 7 | 4 | 11 |
| General donation, returning donor | 6 | 4 | 10 |
| Status change (verification) | 1 | 2 | 3 |
| Allocation | 3 (1 cold header read) | 2 | 5 |
| Dashboard / reconciliation | 2 / 1 | 0 | 2 / 1 |

Not included in those counts: the realtime event-log write and its locate read (stubbed in the live suites; planning figure +1 write, +1 read), SMTP (not Google Sheets). Under concurrency the live burst of 6 averaged **8.7 reads and 5.8 writes per donation** (includes ID-collision retries and the cold instances).

History: D35 baseline 9 + 7 -> R1 9 + 5 -> D36 8 + 5 (in-memory, new donor) and, live, 9 + 5 / 7 + 4. A fire-and-forget duplicate audit write in the donate route (2 reads + 1 write per donation, invisible to the in-memory tests because it leaked into the next measurement window) was removed in D36.

## 3. Capacity model

Planning figures (deliberately conservative): **13 reads and 7 writes per new-donor donation** = 8 measured warm + 2 cold-instance metadata + 1 event-log + 1.6 collision retries (observed up to +1.6) + safety; typical case **9 reads and 6 writes**.

| Scenario | Reads needed | Writes needed | Per-user read quota needed to finish in 60 s (typical / planning) | Verdict at 60 reads per minute |
|---|---:|---:|---|---|
| 1 donation | 9 / 13 | 6 / 7 | 9 / 13 | fits |
| 12 simultaneous | 108 / 156 | 72 / 84 | 108 / 156 | **does not fit** (1.8x to 2.6x) |
| 20 simultaneous | 180 / 260 | 120 / 140 | 180 / 260 | **does not fit** (3x to 4.3x) |
| 30 simultaneous | 270 / 390 | 180 / 210 | 270 / 390 | **does not fit** (4.5x to 6.5x); planning figure also exceeds the 300 per project default |
| Sustained | 60 / 13 = 4.6 to 6.7 donations per minute per identity | 60 / 7 = 8.6 | | |

Headroom: admin dashboard and reconciliation (1 to 2 reads per page view, each admin refresh), background recovery and a 20% safety margin. Required quota for the 30-burst with headroom: **about 470 reads and 250 writes per minute per user, and the same order per project**; for 20: about 310 reads; for 12: about 190 reads. The project limit of 300 is itself too small for the 30 case once admin traffic is added.

LIVE evidence for the shape of the problem (shared coordinator at 45/45, real Google, approved test sheet, one process; function limit NOT enforced, so this measures the time the work needs): see `docs/testing/d36-live-acceptance-results.md`. N=6: all accepted, 0 quota rejections, **68 s wall, 0 of 6 within 60 s**.

## 4. Options and what each really changes

| Option | Effect on the limit | Cost / risk | Status |
|---|---|---|---|
| A1. Fewer requests per donation (done: R1, designations pre-read, duplicate audit removal, header prefetch) | about -35% since D35 | none left that keeps every correctness read | DONE, see benchmark |
| A2. Quota increase request on the project (per-user and per-project) | the only lever that moves the binding limit | approval not guaranteed; "exceeding quota" charges planned; the effective starting values are unknown | **EXTERNAL**: owner submits (below) |
| A3. More service accounts | each user has its own 60 per minute **only if calls are spread across them**; the project limit still applies | more credentials to protect, rotate and share the sheet with; the directive forbids creating identities without owner approval | NOT DONE, owner decision |
| A4. Queued intake (explicit durable states) | amortises the ID reads over a batch: about 1 read for N donations instead of 4 per donation | changes donor-facing semantics; needs a finaliser that runs on a schedule or on the next request; a major change to the permanent-ID path | PROPOSED, needs owner decision and its own design and test campaign |
| Apps Script B (coordinator) | none: the calls still come from the same identity | adds latency | REJECTED |
| Apps Script C (writer) | unknown: it is **not documented** whether `SpreadsheetApp` draws on the Sheets API per-user quota | one global lock serialises writes; second codebase | DEFERRED until A2 is answered |

### A4, the only structural option, in more detail (not implemented)

Accept the donation with ONE write (an intake row carrying the submission key and a durable reference `SUB-...`; no reads), answer "received" with that reference, and let a finaliser assign the permanent `DA###` ids for many intake rows with one read of Donations and one batched write. Explicit states: `RECEIVED` -> `ID_ASSIGNED` -> `COMPLETE`. Requirements before building: (1) the owner accepts that the donor sees a submission reference first and the permanent id shortly after; (2) a way to run the finaliser (Vercel cron availability depends on the plan; or finalise lazily on every donation and admin request); (3) recovery rules for a stuck intake row; (4) the same uniqueness verification as today, once per batch. It would reduce reads per donation from about 8 to about 2, which is the only change that gets 12/20/30 inside the quota without a quota increase. It is not a refactor of the current code and must not be rushed.

## 5. Quota-adjustment proposal for the account owner (EXTERNAL; nothing was submitted)

1. In Google Cloud console, project `daaraynorg-9165c`, open **APIs & Services -> Google Sheets API -> Quotas & System Limits** and record the effective values of "Read requests per minute", "Write requests per minute", "Read requests per minute per user", "Write requests per minute per user" (this session could not read them).
2. Check **Billing** for the project and read the current Google notice on charges for exceeding Sheets quota before requesting anything larger than the defaults.
3. Request, with the justification "public charitable donation intake with bursty traffic around campaigns": per-user reads 300 per minute and writes 150 per minute; per-project reads 600 and writes 300. (Derived from section 3: the 30-donation burst with headroom needs about 470 reads; this request sizes the 20-donation burst with headroom, which is the pragmatic target; ask for more only if campaigns demand 30.)
4. Do not assume approval. If refused or partially granted, the achievable burst is `(granted per-user reads) / 13` donations per minute and the queued intake design (A4) becomes necessary.
5. Do not create additional service accounts until the owner has approved the security model in section 6.

## 6. If separate identities are ever considered

Security exposure: every identity is another private key that can read and write the financial sheet. Credential storage: Vercel environment variables or Secret Manager, never in the repository. Sheet sharing: each identity needs editor access to the spreadsheet; restrict to the approved sheet only. Rotation and revocation: documented per identity; a leaked key must be revocable without downtime. Quota accounting: per-user quotas are per principal, but the per-project limit applies to the sum; the shared limiter must account for each identity separately (it already supports identity and project budgets). Complexity: the request governor, the readiness page and the alerts must report per identity. Do not add an identity to evade quota controls: it helps only if the project limit has room and the owner approves.

## 7. What was NOT verified

The real quota values; whether a quota increase is granted; behaviour of Google over its quota (not tested on purpose); anything on Vercel; N=20 and N=30 on real Google (not run: N=6 already misses the 60 s window and the arithmetic is unambiguous).
