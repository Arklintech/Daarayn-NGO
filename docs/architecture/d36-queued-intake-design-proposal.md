# D36 queued intake: design proposal

Date 2026-10-31. **PROPOSAL ONLY. No code was changed for this document; the current donation path (`processDonation`) is untouched.** Labels: VERIFIED (read in code or docs this session), MODEL (arithmetic from measured counts, not yet measured on this design), DECISION (needs the owner), RISK.

## 1. Why this exists, and when it is NOT needed

The binding limit is Google's per-user read quota (documented default 60 per minute; the project's real value could not be read). A donation costs 7 to 9 reads live, and 6 simultaneous donations already needed 68 s, 12 needed 142 s, against a 60 s function limit (`d36-performance-benchmark.md`). Every remaining read of the current path is a correctness read, so the only ways forward are more quota or fewer reads **per donation by sharing them across donations**.

**Order of preference:** (1) the quota request (`d36-google-sheets-capacity-plan.md` section 5): no code, no donor-facing change. If it is granted at the size requested (about 300 reads per minute per user), the 20-donation burst fits and this design is **not needed**. (2) This design, only if the quota is refused, or the 30-donation burst with headroom (about 470 reads per minute) is a real requirement. Do not build both.

## 2. The idea in one paragraph

Split a donation into two steps with explicit, durable states. **Intake** (synchronous, per donor): validate, check eligibility (the existing fresh read), store the proof in Drive, append ONE row to a new `Donation_Intake` worksheet, answer **HTTP 202 "received"** with a deterministic reference `SUB-...`. **Finalisation** (asynchronous, batched): a finaliser takes up to B waiting intake rows and runs the **existing, already verified id protocol once for the whole batch** (claim rows, locate, assign permanent `DA###` ids by position, write, verify uniqueness, follow-ups, completion), so its reads are shared by B donations. A donation exists as a financial record only after finalisation, exactly as a donation exists only after its id is confirmed today.

```
Donor browser
   | POST /api/donate  (flag DONATION_INTAKE_MODE=queued)
   v
INTAKE (per donor, synchronous)                        FINALISER (batched, asynchronous)
  validate -> eligibility read (1 R, fresh)              take <= B intake rows in state RECEIVED
  Drive proof upload (own API quota)                     1 snapshot read of Donations + Donors
  append ONE row to Donation_Intake (1 W)  --RECEIVED--> donors: find/create once per contact (+1 verify read)
  202 {reference SUB-..., status RECEIVED}               claim rows -> locate -> ids by position -> write -> verify   (existing protocol, vectorised)
  SMTP: "received" email (no Sheets request)             ONE atomic batch: designations + notifications + audits for all B
                                                         completion write per donation (fresh re-read, operational fields only)
                                                         intake rows -> ASSIGNED / COMPLETE; "your donation number" email
```

## 3. States, and what the donor and the books see

| State | Meaning | Financial record? | Donor sees | Admin sees |
|---|---|---|---|---|
| `RECEIVED` | intake row durably stored, proof stored, no permanent id yet | **no** (not counted in any total, like today's `PENDING` placeholder) | reference `SUB-...`, "received, your donation number follows" | listed as "awaiting numbering", with proof link |
| `ASSIGNED` | permanent `DA###` donation row confirmed unique; follow-ups pending | yes, status `pending` as every new donation today | donation number by email | normal donation, `opStatus` partial/pending shown as today |
| `COMPLETE` | follow-ups done | yes | same | normal |
| `DUPLICATE` | a later intake row with the same submission key | no | same reference as the original | hidden/greyed, linked to the winner |
| `STUCK` | older than a threshold and not assigned | no | reference still valid | **integrity exception** (`STALE_INTAKE`) with a one-click "finalise now" |

The 202 means **"received"**, never "recorded as a donation". The wording is a DECISION (section 9).

## 4. Why the current guarantees can be kept

| Guarantee | How the design keeps it |
|---|---|
| No duplicate donation per submission key | the reference is derived from the key (`SUB-` + base32 of its SHA-256), so a replay returns the same reference with **no read**; two intake rows with one key are resolved deterministically by the finaliser (earliest row wins, later rows `DUPLICATE`), and the Donations rows keep the existing per-key rule (earliest row for a key wins, later claim rows are cleared) |
| Permanent, unique donation ids | the finaliser uses the **same** claim-then-verify algorithm (`createWithUniqueId`), applied to a block of claim rows appended in one request; the post-write uniqueness verification stays (R2 stays refused) |
| Permanent, unique donor ids | the donor find/create/verify protocol stays (R3 stays refused), executed once per distinct contact in the batch |
| Idempotent retries, interrupted work | every step is keyed; a finaliser killed mid-batch leaves claim rows that the existing stale-placeholder adoption (after 20 s) finishes; an interrupted follow-up is `opPending` and recovered as today |
| No false success | the 202 is sent only after the intake append is confirmed; an uncertain append is never retried blindly (quota errors only) and the donor's retry carries the same key |
| Audit | the `SUBMIT_DONATION` audit record is written in the finaliser's atomic batch, after the confirmed donation row; the intake row itself is an immutable timestamped record of the receipt |
| Allocation, designation and status controls, priorities, retry rules | unchanged (the finaliser runs at priority P1; intake at P0) |
| Stale-writer limitation (F-1) | not made worse: ids are still assigned by the verified protocol; the finaliser is effectively a single writer in practice, which reduces concurrent id contention |

Correctness does **not** depend on a lease or on a single finaliser: two finalisers processing the same intake row both reach the per-key rule and one yields. A lease (if one exists later) only avoids wasted work.

## 5. Request cost (MODEL, to be measured live before any decision)

Intake per donor: **1 read** (eligibility, fresh, unchanged rule) + **1 write** (the intake row). Finaliser per batch of B rows: about **8 reads** (Donations snapshot, Donors snapshot, Donors verify, Donations locate, Donations verify, Donation_Causes duplicate check, Donations re-read for the completion write, intake read) and **6 writes** (donor rows, claim rows, final rows, follow-up batch, completion batch, intake status), independent of B, plus collision retries.

| | Current path | Queued, B = 25 |
|---|---|---|
| Reads per donation, amortised | 7 to 9 | 1 + 8/25 = **1.3** |
| Writes per donation, amortised | 4 to 5 (+1 event) | 1 + 6/25 = **1.2** |
| Burst of 12: reads | 108 | 12 + 8 = **20** |
| Burst of 20: reads | 180 | 20 + 8 = **28** |
| Burst of 30: reads | 270 | 30 + 16 (two batches) = **46** |
| Time until every donor is acknowledged at 45 reads per minute | 142 s (N = 12, measured) | N = 12: about 9 s; N = 30: about 33 s (reads / 0.75 per s after the burst of 5) |
| Ceiling of simultaneous acknowledgements inside 60 s | 5 (45/min) to 7 (60/min) | about **50** (45/min) to 65 (60/min) |

The acknowledgement phase fits the 60 s window for bursts of 30 with the current budget; the finalisation phase runs separately and is not constrained by the donor's request. These are arithmetic from today's measured counts; **no live measurement of this design exists**.

## 6. Who runs the finaliser (the real engineering question)

Vercel cron (VERIFIED, [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing), 2026-07-15): Hobby runs a job at most **once per day with up to 59 minutes of imprecision**; Pro runs once per minute; cron invokes an ordinary function with the same limits and pricing. The project's plan is not known here. Therefore the design must not depend on a minute cron:

| Trigger | Works on Hobby? | Cost | Role |
|---|---|---|---|
| Admin opens the donations page or presses "finalise now" | yes | the admin page already reads the donations; adds the intake read | **primary on Hobby**: finalise all `RECEIVED` rows older than 30 s; an admin verifying a payment finalises that row on demand |
| Cron every minute | **Pro only** | one function call per minute | primary on Pro |
| Daily cron | yes | one call per day | safety net: finalises anything left, raises `STUCK` exceptions |
| After-response work in the intake request (Next.js `after`/`waitUntil`, to be verified for this deployment) | yes | every intake would attempt a claim: about 1 read + 1 write each | optional; adds back about one request per donor |

Consequence on Hobby: donors may wait until an administrator looks at the list before they receive the permanent number. An administrator has to verify each payment against its proof anyway, so numbering is not the bottleneck today, but it changes the expectation (DECISION).

## 7. Failure matrix

| Failure | Behaviour |
|---|---|
| Intake append definitively fails | 503, nothing stored, donor retries with the same key |
| Intake append outcome uncertain (timeout) | donor retries with the same key; two rows possible; the finaliser keeps the earliest, marks the other `DUPLICATE`; the donor sees one reference either way |
| Proof upload fails | as today: 503 before anything is stored |
| Replay of a received submission | same reference, **no Sheets request** |
| Finaliser killed mid-batch | claim rows remain; adopted after the stale threshold by the next finaliser; intake rows stay `RECEIVED` until their donation row is confirmed |
| Part of a batch assigned, part not | per-row state; the rest is picked up next run |
| Follow-ups fail | `opPending` per donation, recovered as today |
| Email fails | recorded on the donation row as today; the reference remains valid |
| Cause became ineligible between intake and finalisation | the donation is **still recorded** (money was sent), designation left unresolved and flagged for an administrator; never discarded |
| Intake row never finalised | `STALE_INTAKE` integrity exception, daily cron and "finalise now" |
| Two finalisers at once | the per-key rule and the uniqueness verification decide; wasted reads, no duplicate record |
| Coordinator or limiter unavailable | intake fails closed (503); finaliser waits |
| Sheet edited by hand | out of scope, as everywhere (F7) |

## 8. What would change in the code (when approved)

New: `Donation_Intake` worksheet and repository (registered schema, headers), `intakeService` (validate, eligibility, Drive proof, append, reference), batch finaliser reusing the donation repository protocol in a vectorised form, integrity rule `STALE_INTAKE`, admin list and "finalise now", "received" and "donation number" emails (SMTP, no Sheets cost), `DonateForm` handling of the 202 state. Feature flag `DONATION_INTAKE_MODE=direct|queued`, **default `direct`**, so the current path stays the production behaviour until the owner flips it and rollback is a variable change.
Not changed: allocation, designation, status-change controls, the id and donor protocols' guarantees, request governance, priorities, the coordinator, Apps Script (not used).

## 9. Decisions needed from the owner before any code

1. **Donor-facing semantics.** Accept "received, reference SUB-..., your donation number follows" instead of the immediate `DA###`? Proposed text for the confirmation and the first email; whether receipts and tax documents are issued only after numbering.
2. **Vercel plan.** Is the project on Hobby or Pro? Pro gives a minute cron (a paid plan; not assumed). On Hobby the finaliser is driven by administrators plus a daily safety net.
3. **Can an administrator verify a payment from a `RECEIVED` row** (finalising that one row at once), or only after numbering?
4. **Retention and protection** of `Donation_Intake` (it holds the same personal data as Donations): restrict the sheet, same rules.
5. **Acceptance of the limits:** acknowledgements up to about 50 per minute at the current budget; the permanent number may lag.

## 10. Rollout with gates (each gate must pass before the next)

| Step | Content | Gate |
|---|---|---|
| 0 | the quota request is answered; decisions 1 to 5 recorded | owner |
| 1 | intake path behind the flag (default `direct`); finaliser as a manual endpoint; fake-sheet protocol tests (duplicate keys, kills mid-batch, stale claim adoption, two finalisers, batch of 25, ids unique, no PENDING left) | full offline suite and the new tests green; the direct path untouched |
| 2 | live burst on the approved test spreadsheet: N = 12, 20, 30 acknowledgements inside 60 s, finalisation batches, kill the finaliser mid-batch, same-key storm | acknowledgements inside 60 s, 0 duplicates, 0 PENDING, request counts match the model within 20% |
| 3 | admin list, emails, `STALE_INTAKE`, recovery drills | tests and a rehearsal on the test sheet |
| 4 | Vercel Preview: independent invocations, real latency, the finaliser triggers that the plan allows | requires Vercel access (EXTERNAL) |
| 5 | production flag flip | explicit owner approval; financial activation stays a separate decision |

## 11. Risks of the design itself

A donor-facing semantic change is the main cost and cannot be tested away. The batched id protocol is the most delicate code in the system: it must be a vectorised form of the verified algorithm, not a new algorithm, and needs its own concurrency campaign before any live use. On Hobby the numbering latency depends on administrator attention. A bug in the finaliser could delay numbering for many donors at once (mitigation: `STALE_INTAKE`, "finalise now", the flag). None of this removes the unprovable stale-writer limitation (F-1) or the need for a quota decision for allocations, admin traffic and growth.

## 12. What this proposal does not claim

No code, no measurement of this design, no Vercel result, no owner decision. The numbers in section 5 are a model from measured counts of the current path and must be validated at gate 2 before relying on them.
