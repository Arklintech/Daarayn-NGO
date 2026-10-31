# D36 final architecture decision

Date 2026-10-31. Labels: VERIFIED / LIVE (approved test spreadsheet only) / MODEL / EXTERNAL / PROPOSED. Historical reports D29 to D35 are context, not evidence.

## 1. Decision

**Design A, optimised direct Google Sheets API access, stays the architecture.**

| Design | Decision | Evidence |
|---|---|---|
| A. Optimised direct Sheets API from Vercel | **SELECTED** | all measured gains came from here (about -35% requests per donation since D35); it keeps the existing, tested governance, idempotency and recovery |
| B. Apps Script quota coordinator | **REJECTED** | Vercel would still call Google with the same service account, so the per-user 60 reads per minute limit is unchanged; a coordinator only paces requests, which the existing limiter already does. It adds a round trip per reservation. The existing coordinator program already provides the pacing; only its hosting is open |
| C. Apps Script central writer | **DEFERRED** | the one thing that could change the outcome, Apps Script's own Sheets quota, is **not documented**: Google's page says only that using a service's Apps Script counts toward its quota reserves. A global script lock would also serialise financial writes. A proof of concept needs an Apps Script project and a test spreadsheet that only the owner can create (no clasp login exists here). It becomes relevant only if the quota request (A2) is refused |

**Apps Script verdict: DEFER.** Not integrated, nothing connected to Vercel or production.

Why not "free hosting" as a reason: a free service that does not remove the binding limit and adds latency and a second codebase is a cost, not a saving.

## 2. The real constraint

Google allows **60 reads per minute per user** by default (this project's actual value could not be read: `PERMISSION_DENIED`). A new-donor donation needs 8 to 9 reads live. Five donations per minute is the sustained ceiling; a burst of 6 already needs 68 s (live) against a 60 s function limit. After every safe reduction the remaining reads are correctness reads (section 4). The remaining levers are capacity (quota increase), or queued intake with explicit states. Both need owner decisions. See `d36-google-sheets-capacity-plan.md`.

## 3. Final system

```
Browser
  |
Vercel (Next.js route, up to 60 s)  --- Firebase Auth (identity only)
  | runWithPriority P0..P3
  v
SheetsService.call -> withGoogleRetry -> acquireSlot -> [shared limiter]      <- coordinator program: written, tested, NOT hosted
  |                                      [lease alloc:<donationId>]            <- allocations, designation changes, EVERY status change
  v
Google Sheets (sole operational store)         Google Drive (proofs, evidence)         Gmail SMTP (email)
```

Donation write flow (new donation, after D36):

1. validate; read eligibility fresh (1 batched read); upload proof to Drive.
2. find or create donor (1 read; new donor: append + 1 verification read).
3. `createWithUniqueId`: key check read, placeholder append, locate read, final write, uniqueness verification read (permanent donation id).
4. ONE atomic request appends designations, admin notification and audit record (`appendCells` across three tabs); then ONE duplicate check of the designation rows.
5. realtime event, donor email.
6. completion write: re-read the row, write only the operational fields (never overwrites an admin decision).

## 4. Reductions: what was done and what was refused

| Change | Result | Why safe |
|---|---|---|
| R1 batched follow-up appends | -2 writes | atomic; recovery idempotent; cell typing proven live |
| Designation pre-read removed on the **first-run path only** | -1 read | a replay returns before the step; recovery keeps its own read; the kept post-append check removes identical duplicates and now refuses to complete when conflicting rows exist; 9 case tests |
| Duplicate un-awaited `DONATION_PROCESSED` audit write removed from the route | -2 reads, -1 write | the `SUBMIT_DONATION` record already holds every fact; it is written atomically and awaited; the removed write could be cut off when the function returned |
| Header rows of all known tabs fetched in the same request on a cold instance | about -3 to -6 requests per cold instance | headers were already cached per instance; only the request count changes |
| R2 (merge the id reads) | **REFUSED** | weakens replay-writes-nothing and stale-claim adoption |
| R3 (single donor read) | **REFUSED** | the second read verifies donor-identity uniqueness |

Remaining 8 reads of a new-donor donation (all correctness reads): eligibility 1, donor find + verify 2 (1 for returning donors), donation key/locate/verify 3, completion re-read 1, designation duplicate check 1.

## 5. Financial guarantees (summary; detail in `d36-financial-consistency-review.md`)

Strong, tested: duplicate prevention by submission key; unique permanent ids by write-then-verify; allocation cap by lease + pre-check + post-write verification; status changes serialised (two administrators: 12 of 12 trials exactly one winner; without the lease both won in 19 of 20); a failed compensating reversal is retried, explicit and detected. **Not achievable under Google Sheets:** storage-level rejection of a stale writer and cross-request transactions. Production financial operations stay paused.

## 6. Open conflict recorded, not resolved

The instruction text asks to preserve "Khidr-related architectural decisions". The repository records the **removal** of the AI writing assistant (route answers 410; the project rules forbid AI inference providers). Nothing was reintroduced. If the owner wants Khidr functionality, that is a new, separate decision.

## 7. What this decision does not claim

No Vercel acceptance, no real-quota concurrency proof, no coordinator hosting, no alert delivery. Verdict in `d36-production-readiness.md`: NOT READY.
