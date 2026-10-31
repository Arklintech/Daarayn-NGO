# D37 queued donation intake and single-writer finaliser

Date 2026-10-31. Builds on `d36-queued-intake-design-proposal.md` (preserved). Everything here is **isolated**: the library lives in `lib/intake/` and no route, form or service of the active donation path imports it. The direct path (`processDonation`) is unchanged and remains the only live path. Nothing was deployed, committed or pushed; no production data was used; no real email was sent; no production flag was touched.

Labels: **FAKE** (in-memory sheets), **LIVE** (real Google Sheets, approved test spreadsheet only, one machine, not Vercel), **PREVIEW**/**PRODUCTION** (not run), **DOC** (read from the vendor's documentation 2026-10-31), **DECISION** (owner).

## GO / NO-GO

**NO-GO for production and for activation.** **GO for the next stage: controlled Vercel Preview testing of the isolated implementation, after the external dependencies below.**

Does the architecture meet the business requirements?

| Requirement | Result |
|---|---|
| Accept valid submissions reliably inside the 60 s window | **Partly.** LIVE: 12 simultaneous cold instances were all acknowledged in 46.8 s; 30 were not (158.7 s with 4 reads per cold instance; about 118 s expected with the fix, not re-measured). The ceiling at the current 45 reads per minute is about 16 simultaneous cold instances, or about 50 warm ones. Whether Vercel instances are cold or warm in a burst is unknown (no Vercel access) |
| Complete the financial workflow safely in the background | **Yes (tested).** LIVE: 12 donations completed in one 13.6 s pass, 30 in two passes (24.3 s); 0 duplicates, 0 quota rejections |
| No lost submission, duplicate donation, duplicate id | **Yes (tested FAKE and LIVE)** |
| No stale writer committing after losing authority | **Converges, not fenced** (section 5); a transient duplicate row is possible |
| No false final confirmation | **Yes** (`final` only at `COMPLETE`) |
| No indefinite pending record | **Not yet:** needs a running trigger; none can be demonstrated here |
| Recovery after interruption | **Yes** (15 stage crashes FAKE; 2 crashes and a stalled worker LIVE) |
| Operational visibility, safe overload | metrics and alarm exist as functions; not wired to any screen |

External dependencies that remain (owner): donor-facing wording and timing (section 8); Vercel access and the plan (a per-minute cron needs Pro); a trigger for the finaliser (section 6: administrator-driven plus a daily cron works on any plan); a Preview run to measure real latency and instance warmth; a decision on the quota request (acknowledgement capacity scales with the per-user read quota); alert delivery; a hosted coordinator for shared request pacing (not needed for correctness of the finaliser); wiring (donate route, form, status page, emails, admin list), which was deliberately not done. The stale-writer limitation of the allocation path (F-1) is unchanged.

**It does not increase Google's quota.** Asynchronous processing alone adds nothing; the saving comes only from sharing the reads of one pass between many donations.

## 1. Lifecycle and what each state means

| State | Meaning | Donor sees | Notes |
|---|---|---|---|
| `RECEIVED` | the intake row was durably appended and confirmed; nothing is recorded as a donation; no permanent id | reference `SUB-...`, "received, not yet recorded as a donation" | the only state a donor can hold after the synchronous step |
| `ID_ASSIGNED` | the permanent `DA###` row exists, is verified unique, and its donor is verified | the donation number, explicitly **not** the final confirmation | the donation row exists as `pending`, as every new donation does today |
| `COMPLETE` | donation row, donor, designations, notification and audit record are committed and verified; the intake payload is scrubbed | **final confirmation** (the only state with `final: true`) | email delivery is a separate step and never reverses this |
| `REJECTED` | the key was reused with a different payload, or validation failed at intake | "could not accept; nothing was recorded" | validation failures are refused synchronously and store nothing |
| `RETRY_PENDING` | a pass failed after the row was claimed for work; retry count and error category are recorded | shown as `RECEIVED` | bounded by `maxRetries` (default 5) |
| `FAILED_REQUIRES_REVIEW` | retries exhausted, an invalid or tampered row, or an id collision | "under review, do not resubmit" | an administrator can `requeueIntake` |
| `DUPLICATE` | internal: a later row with the same key and payload | the canonical row's state (same reference) | not donor-facing |

Communication delivery has its own status and is out of the financial state machine: a confirmation email is sent after `COMPLETE` by a separate step and its failure is recorded on the donation row only (as in the direct path). It is not implemented here.

## 2. The durable intake record

`Donation_Intake` worksheet, one row per accepted submission: `submissionRef`, `idempotencyKey`, `payloadHash`, `payload` (minimised JSON: donor name and contact, amount, currency, reference, cause choice, proof file id), `receivedAt`, `state`, `retryCount`, `lastErrorCategory`, `donationId`, `completedAt`, `updatedAt`.

- **Reference** = `SUB-` + 60 bits of SHA-256(key + payload hash). Same key and payload give the same reference without any read; another payload under the same key gets another reference.
- **Hash** covers the donor-supplied content only. (A first version included the proof file id; the duplicate test showed that every replay uploads a new proof, so an honest replay would have been rejected as a key conflict. Fixed.)
- **Minimised, not duplicated:** the payload is emptied when the donation is `COMPLETE`; the hash stays as the integrity witness.
- **Tamper evidence:** a row whose reference or hash does not match its content is never processed (`FAILED_REQUIRES_REVIEW`, `INVALID_RECORD`). Tested.
- **Literal-safe writes:** the intake append and every finaliser write use `appendCells`/`updateCells` (numbers and booleans typed, all other text literal), so a donor name such as `=HYPERLINK(...)` can never become a formula. The same program closed F9 for the existing paths: values on the `USER_ENTERED` paths are now written with a leading apostrophe when they start with `= + - @ TAB CR`, which Sheets stores as literal text. Tested through the real `SheetsService` (`tests/formula-injection.test.ts`) and, for the typing, live (`tests/live/r1-appendcells.live.test.ts`).
- **Persistence confirmed:** the append is one atomic `batchUpdate`; the donor gets "received" only after it returns. An exception means nothing was accepted. An uncertain outcome is never retried blindly (quota errors only); the donor retries with the same key and the finaliser keeps the earliest row.

## 3. Deduplication and concurrency (proofs)

Google Sheets has no uniqueness constraint and no cross-request transaction. The design does not use "read then append". It relies on facts the storage does provide: appended rows keep a stable order, and a write of the same value twice is harmless.

| Required proof | How | Evidence |
|---|---|---|
| duplicate client submissions | same key and payload share the reference; the finaliser keeps the earliest row, marks the others `DUPLICATE`, deletes the redundant proof upload; another payload under the key is `REJECTED` (`KEY_REUSED`) | FAKE `tests/intake-queue.test.ts`; LIVE section 7 |
| two instances, same key | both append; the finaliser resolves by earliest row | FAKE and LIVE |
| simultaneous different requests | each is its own row; ids are assigned by rank | FAKE N = 6, 12, 20, 30; LIVE section 7 |
| worker crash after claiming | there is no separate claim: work is derived from the row states, so the next pass simply picks it up | FAKE (crash at every stage) |
| crash after assigning the id | the id is a pure function of the intake order; the next pass finds the donation row by its reference and continues | FAKE crash at `donations-appended` to `id-assigned-recorded`; LIVE crash at `donations-verified` |
| crash after partially writing financial records | each stage is idempotent; follow-ups are checked by deterministic id on a recovery pass; designations deduplicate by id | FAKE crash at all 15 stage boundaries; LIVE crash at `followups-written` |
| stale worker continuing after losing authority | see section 5 | FAKE (without and with lease); LIVE (without lease) |

## 4. The finaliser

`runFinaliserPass` processes a bounded batch (default 25) in the order of the ten steps of the specification:

1. read the intake rows (one read; an idle poll costs one read and stops);
2. take the `intake-finaliser` lease with immediate give-up if busy, and self-fence before every write stage (an optimisation, see section 5);
3. verify idempotency: the canonical row per key is the earliest; duplicates and conflicts are marked;
4. revalidate: row integrity (reference and hash), id collision with any other row, retry budget. Eligibility was decided at intake from the fresh catalogue; a cause that became ineligible meanwhile does **not** discard a donation, money was sent;
5. donors: find once per contact; create the missing ones in one request; verify (earliest row wins, the later row is cleared), exactly the existing donor protocol, once per batch;
6. assign the permanent id: `DA` + (highest number among donation rows that have no submission reference) + rank among canonical intake rows. Deterministic, injective, no placeholder rows, no collision retries;
7. persist: donation rows (one request), then designations, notification and audit record for the whole batch in one atomic request;
8. verify: donation rows re-read (earliest row per reference kept, later ones cleared; any other row holding the id sends the intake row to review), designations deduplicated, conflicting designation rows keep the step failed;
9. mark complete: `opStatus=complete` written to exactly two cells of each donation row; intake rows set to `COMPLETE` with the payload scrubbed;
10. release the lease (always).

Retries: a failed pass marks its rows `RETRY_PENDING` with a growing count and an error category (`QUOTA`, `NETWORK`, `INTEGRITY`, `INTERNAL`, `LOST_AUTHORITY`); after `maxRetries` they become `FAILED_REQUIRES_REVIEW` (dead letter) and are never retried until an administrator requeues them. A row whose `COMPLETE` write is confirmed is never moved back by a later failure. Never a final confirmation before the mandatory financial records are committed and verified: `COMPLETE` is written last.

## 5. Does this resolve the stale-writer limitation?

**For the intake and finalisation path: yes, by convergence, not by fencing. It does not provide storage-level fencing, and it does not touch the allocation path.**

Google Sheets still cannot reject a write that carries an old token; the lease is not claimed to fence anything. What makes a late worker harmless is that every effect is deterministic, idempotent and column-targeted:

| What a stale worker can do | Result |
|---|---|
| append donor rows again | the verification keeps the earliest row per contact and clears the later one; every worker applies the same rule |
| append donation rows again | same id (deterministic) and same reference; the verification keeps the earliest and clears the rest |
| overwrite a donation's status | impossible: it writes only `opStatus` and `opPending` cells, never the row |
| regress the intake state | the next pass re-derives it from the records (a complete donation sets `COMPLETE` again) |
| re-append designations | identical ids and content; deduplicated by id |
| re-append notification or audit | same deterministic id: a duplicate row is possible only when two workers run the same first attempt at the same moment; it is not a financial operation and is detectable by id |
| use an old snapshot to compute an id | the id is a function of the intake order, which only grows at the end |

Tested (FAKE and LIVE): a worker stalls after its snapshot, another finishes, an administrator verifies a donation, the first worker wakes up and runs to the end: no duplicate rows, ids unchanged, the administrator's status intact. With the lease and a short TTL the late worker self-fences at its first write stage and aborts without writing.

**Residual limitations (stated, not hidden):**
1. A duplicate donation row can exist **transiently** (between a stale worker's append and the next verification, normally inside the same pass). A report read in that window could count it twice, and the integrity report would flag a duplicate id.
2. Deterministic ids require that the queued path is the **only** creator of donations after its first run. A direct-path donation arriving concurrently can shift the legacy maximum; uniqueness is still protected (a clash goes to review, never overwrites) but numbering may have gaps.
3. Hand edits of the sheet bypass everything (as before).
4. The allocation path is unchanged: its stale-writer limitation (F-1) stands. This design reduces concurrent id contention; it does not make allocations safe on a stale lease.
5. Nothing here was run on Vercel with a hosted coordinator.

## 6. Worker comparison: which process runs the finaliser

The pass is a plain function (`runFinaliserPass`) with no dependency on a particular trigger. Documented facts (DOC, 2026-10-31):

| | A. Vercel cron / background | B. Apps Script time-driven worker (SpreadsheetApp) | B2. Apps Script only as a scheduler (calls a signed Vercel endpoint) | C. Administrator-driven |
|---|---|---|---|---|
| Mechanism | cron invokes an ordinary function; `after()`/`waitUntil` extend one request | time-driven trigger runs a script | trigger runs a script that does an HTTP POST | an admin page or button calls the endpoint |
| Frequency | Hobby: once per day, ±59 min; Pro: once per minute ([usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)) | as often as every minute, timing "slightly randomized" ([triggers](https://developers.google.com/apps-script/guides/triggers/installable)) | same | on demand |
| Extra cost | none on Hobby; Pro is a paid plan | none | none | none |
| Max duration | the function's `maxDuration`; `waitUntil` work "will be cancelled" when the function times out, so background work survives the response but **not termination** ([waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)) | 6 minutes per execution; 90 min of trigger runtime per day on consumer accounts, 6 h on Workspace (quotas page, read in D36) | a call of a few seconds per minute fits | the request's duration |
| Lock behaviour | the existing lease (needs a coordinator; none is hosted) | `LockService` script lock exists; the reference page documents no timeout or release semantics | not needed | the existing lease, or none (convergence) |
| Concurrency | possible overlap; correctness does not depend on exclusion | the documentation does not say whether a trigger can start while the previous run is still executing | same | admin clicks may overlap; harmless |
| Crash recovery | next invocation continues; no retries of a failed cron documented here | failures send an email to the owner; automatic retries are not documented | next call continues | next click |
| Throughput | the same quota: a pass costs the same requests wherever it runs | unknown: whether `SpreadsheetApp` draws on the Sheets API per-user quota is **not documented** | the same as A (the calls are made by Vercel) | the same |
| Security | cron endpoint must verify the caller (Vercel supplies a secret header; to be configured) | the script holds spreadsheet access as its owner | a signed request (HMAC, timestamp, nonce) | the existing admin authentication |
| Demonstrable here? | **No**: no Vercel access; the plan is unknown | **No**: no Apps Script project exists and none can be created from here | **No** | **Yes**: the pass is exercised directly in all tests |

**Selection: no external worker is selected, because neither Vercel's nor Apps Script's availability and guarantees can be demonstrated in this account and environment.** What can be demonstrated is the pass itself and the administrator-driven trigger (C). Recommended trigger plan, in this order of preference: (1) administrator-driven finalisation plus a daily Vercel cron as the safety net (works on any plan); (2) if the project is on Pro, a per-minute Vercel cron; (3) optionally B2, an Apps Script scheduler that only calls the signed endpoint (free, every minute, no SpreadsheetApp in the data path, no change to the quota). **B (a SpreadsheetApp worker) is not recommended:** it adds a second codebase and its quota behaviour is undocumented.

## 7. Measured results

### LIVE (real Google, approved test spreadsheet only, one machine, shared local coordinator at 45/45 per minute; not Vercel)

| Test | Result |
|---|---|
| N = 1 | intake 3.8 s (3 reads, 3 writes, includes creating the new worksheet); finaliser one pass 13.8 s (11 reads, 7 writes); receipt to COMPLETE 10.9 s |
| N = 12, first run (cold instance: 4 reads) | intake 63.1 s, 12 of 12 accepted, **9 of 12 inside 60 s**; the labels showed the extra read (the intake worksheet was not in the header prefetch) |
| N = 12 **after registering the intake schema (3 reads per cold instance)** | intake wall **46.8 s, 12 of 12 inside 60 s**, P50 / P95 / P99 38.8 / 46.8 / 46.8 s; 36 reads, 12 writes, 0 retries, 0 quota rejections. Finaliser: 1 pass, 13.6 s, 11 reads, 6 writes (0.92 reads and 0.50 writes per donation). Receipt to COMPLETE P50 / P95 / P99 18.1 / 26.1 / 26.1 s; 53 donations per minute. Integrity: 12 donation rows, 12 distinct ids (also unique in the whole sheet), 12 designations, 12 donors, all COMPLETE, payloads scrubbed, 0 PENDING |
| N = 30 (4 reads per cold instance, before the fix) | intake wall **158.7 s, 0 of 30 inside 60 s**, P50 / P95 / P99 138.6 / 157.6 / 158.7 s; 120 reads, 30 writes. All 30 accepted. Finaliser: 2 passes, 24.3 s, 19 reads, 12 writes (0.63 and 0.40 per donation), receipt to COMPLETE P50 / P95 / P99 70.2 / 89.0 / 90.3 s, 74 per minute. Integrity clean (30 / 30 / 30 / 30). With 3 reads the intake would need about 118 s: still outside the window; **not re-measured** |
| Duplicates | 5 instances sent one key at once, 2 workers ran at once without a lease: 1 reference, 5 intake rows (1 COMPLETE, 4 DUPLICATE), 1 donation row, 1 designation, 1 donor |
| Crash | the worker was killed at `donations-verified` and at `followups-written` (each marked 3 rows RETRY_PENDING); one recovery pass completed all 3: 3 donations, 3 designations, exactly 3 notifications and 3 audits |
| Stale worker | A stalled after its snapshot, B finished, an administrator verified a donation, A woke up and redid the whole batch: 2 donation rows, 2 distinct ids, 2 designations, the verified donation kept its status |

Cost per donation, N = 12, cold instances: queued 3.9 reads and 1.5 writes (36 + 11 reads, 12 + 6 writes, over 12) against 9.0 and 5.9 for the direct path measured live in D36.

Capacity inside the window at 45 reads per minute: acknowledgement needs `(3N - 5) / 0.75 <= 60` seconds with cold instances, so **N up to about 16**; with warm instances (1 read) about 50. **N = 20 and N = 30 do not fit when every request is a cold instance.**

### FAKE (in-memory sheets; counts and queue behaviour only; `docs/testing/evidence-d37/queue-fake-measurements.json`)

| N | Intake per submission | Finaliser (passes, reads, writes) | Total per donation | Duplicate ids |
|---:|---|---|---|---:|
| 1 | 1 R, 1 W | 1, 7, 6 | 8.0 R, 7.0 W | 0 |
| 6 | 1 R, 1 W | 1, 7, 6 | 2.2 R, 2.0 W | 0 |
| 12 | 1 R, 1 W | 1, 7, 6 | 1.6 R, 1.5 W | 0 |
| 20 | 1 R, 1 W | 1, 7, 6 | 1.4 R, 1.3 W | 0 |
| 30 | 1 R, 1 W | 2, 13, 12 | 1.4 R, 1.4 W | 0 |

A single donation costs MORE through the queue (8 + 7) than directly: the queue pays off only in bursts. The fake cannot show cold-start reads (the live runs did).

### Not run

N = 6 and N = 20 live; unavailability of the coordinator or a script live (covered by the existing real-process tests); a sustained live backlog (queue depth and oldest pending age are tested on the FAKE only); Vercel Preview; Apps Script (nothing exists to test); the worker comparison could not be demonstrated in this account (section 6).

## 8. Donor-experience recommendation (DECISION for the owner)

- **What RECEIVED means:** "We have your contribution and your payment proof. Your reference is `SUB-...`. This is not yet your donation receipt." It is a durable acceptance, not a financial record. Totals and reports do not include it.
- **When the permanent Donation ID appears:** when the state becomes `ID_ASSIGNED`: the status page and the email then show `DA###`, labelled "your donation number". Receipts and tax documents are issued only at `COMPLETE`.
- **When the final confirmation appears:** only at `COMPLETE`, as a separate message: "Your donation DA### has been recorded." Email failure never reverses it.
- **During delays:** the status page says "we are still processing your submission; you do not need to submit again; keep your reference". If an item waits longer than the alarm threshold (default 15 minutes) it is raised to the operators (`STALE`), and after `maxRetries` it is marked for review; the donor-facing wording is "being reviewed, no need to resubmit".
- **If a request is rejected:** invalid input (amount, contact, an unavailable cause) is refused immediately with a clear message and nothing is stored. A later rejection (the same key used with different details) says "we could not accept this; nothing was recorded; please submit again", with the reference.
- **Polling:** do not poll the sheet from the browser. A status page reads once per view with a short cache; the email carries the result.
- **Not activated:** nothing is wired to the donate route or form. Activation needs the owner's decision, a flag that defaults to the direct path, and the acceptance in section 10.

## 9. Overload and backlog

Intake costs one read and one write, so it keeps working long after the direct path would have queued itself into timeouts. Under a request shortage the existing limiter fails closed (503 with `Retry-After`) before anything is accepted, so nothing is half-accepted. The backlog is visible: `readQueueMetrics` returns the depth by state, the oldest pending age, retries, rows needing review and the stale count; `computeQueueMetrics` has the alarm. A sustained backlog cannot grow silently: the oldest pending age is the alarm. What asynchronous processing does **not** do is raise Google's quota or the number of requests the account may spend per minute; it only lets many donations share the requests of one pass.

## 10. Acceptance checklist

| Requirement | Status |
|---|---|
| No lost accepted submission | FAKE and LIVE: every accepted row is present; a failed append is never acknowledged |
| No duplicate financial operation | FAKE and LIVE |
| No duplicate permanent ids | FAKE and LIVE (also whole-sheet uniqueness live) |
| No overspending | not in scope here (allocations unchanged; their offline tests still pass) |
| No stale writer committing after losing authority | converges (section 5); not fenced; transient duplicate row possible |
| No false final confirmation | `final` only at `COMPLETE`; tested wording |
| No indefinite pending record | bounded retries, dead letter, stale alarm; **needs a running trigger, which does not exist yet** |
| Recovery after interruption | FAKE at every stage; LIVE at two stages and a stalled worker |
| Clear donor-facing status | yes (section 8) |
| Operational visibility | metrics function; not wired into the admin UI |
| Safe overload handling | fails closed before accepting; backlog alarm |
