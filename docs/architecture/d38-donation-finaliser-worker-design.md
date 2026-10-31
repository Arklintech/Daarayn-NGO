# D38 donation finaliser worker, duplicate visibility and cutover

Date 2026-11-01. Builds on `d37-queued-intake-and-finaliser.md` (preserved). Labels: SOURCE, OFFLINE (fake sheets and a model of the documented queue), LIVE (real Google, approved test spreadsheet only, one machine, not Vercel), PREVIEW (not run), OWNER.

## 1. The worker

Trigger: a private Vercel Queues consumer (`app/api/queues/intake-finaliser/route.ts`) that runs `handleDrain`: bounded `runFinaliserPass` calls until the sheet reports nothing left (idle), within a 40 s budget of the 60 s function limit; otherwise a delayed handoff wake-up. The consumer is the only trigger of the finaliser; the other recovery paths (admin button, daily cron) **only publish a wake-up** and never run a pass themselves, so no second path bypasses the controlled consumer. The lease (`intake-finaliser`) is an efficiency device where a coordinator exists; correctness never depends on it (D37 proof: a worker that wakes up late converges to the same result).

Order of processing: the finaliser reads the intake rows in **sheet order** and assigns the permanent id by rank, so the order in which queue callbacks arrive is irrelevant (the queue promises only approximate order).

The `RECEIVED -> ID_ASSIGNED -> COMPLETE` contract is unchanged; only `COMPLETE` produces a final confirmation (`final:true`), tested through the route.

## 2. Duplicate visibility (Track E)

A stale finaliser can briefly append a second copy of a donation row. **Rule (implemented, OFFLINE tested):** `DonationRepository.canonical` drops a row only when an EARLIER row has the same donation id AND the same non-empty `submissionRef`. It applies in `hydrate`, the single path of `getAll` and of the batched `loadSnapshot`, so dashboards, reports, exports, donor history and the allocation inputs never count the copy. Rows without that proof (a duplicate id on the direct path, a manual edit, two submissions sharing an id) are all kept, so the integrity report still flags every real conflict (tested). Effect on writes: `updateStatus` and recovery read the raw rows and refuse an ambiguous id (409), so while a copy exists an administrator cannot change that donation's status until the next finaliser pass removes the copy: fail closed, never a double count.

## 3. Direct / queued isolation and cutover

The permanent donation id must have exactly one creator at a time. The direct path creates ids by claim and verify; the queued finaliser creates them as `legacy maximum + rank`. Running both would shift the legacy maximum under a queued row (uniqueness is still protected, a clash goes to review, but numbering would gap). Therefore the switch is **exclusive and explicit**:

**Cutover to queued (OWNER approves each gate):**
1. Pause direct submissions: unset `FINANCIAL_ACTIVATION_APPROVED` (production) or take the donate form offline; confirm `POST /api/donate` answers the paused 503.
2. Drain the direct path: every donation in `Donations` has `opStatus=complete`; the reconciliation page shows no interrupted donation and no `PENDING` placeholder (stale ones adopted or cleared).
3. Verify no conflicting id creator remains: the highest `DA` number is recorded; `Donation_Intake` is empty or fully `COMPLETE`.
4. Provision `Donation_Intake` with its header row (schema version 1) and verify the contract with one test accept on the test sheet.
5. Set `DONATION_INTAKE_MODE=queued`, apply the Preview/production queue configuration (`deploy/vercel.d38-preview.json` is the template), set `CRON_SECRET` and `OPS_MONITOR_TOKEN`.
6. Point the donation form at `/api/intake/accept` (a separate, reviewed change; not made here).
7. Verify end to end with one dummy submission to COMPLETE, then `GET /api/ops/queue-status` returns 200.

**Rollback to direct:** (a) stop new queued submissions (unset `DONATION_INTAKE_MODE`: every queued route answers 404); (b) **drain** the queue: run the admin "Redispatch" until the admin queue shows nothing waiting and nothing needing review (rows that need review are requeued or resolved by a person); (c) only when `Donation_Intake` has no non-final row, re-enable the direct path. Pending queued submissions are never abandoned: their reference stays valid and their rows stay in the sheet. Messages pinned to a replaced deployment are covered by reconciliation.

## 4. Recovery summary

Accepted submissions have a deterministic recovery path in every failure listed by the directive (publish failure, lost response, early delivery, consumer crash, message expiry, duplicate publication, deployment change); each is an OFFLINE test in `tests/intake-queue-worker.test.ts`. After bounded retries a row moves to `FAILED_REQUIRES_REVIEW`, stops retrying, stays visible on `/admin/queue` and in `/api/ops/queue-status`, and an administrator can requeue it: the action is **audited before it runs** and refused if the audit record cannot be written (OFFLINE tested; the planned mutation check of that guard did not complete on this machine, see readiness report).

## 5. What is still not proven

Behaviour on Vercel (cold or warm instances in a burst, queue delivery timing, the real retry cadence); `maxConcurrency` (key not documented, not used); the stale-writer limitation of the **allocation** path (separate review); the F4 rate limiter is still per instance.
