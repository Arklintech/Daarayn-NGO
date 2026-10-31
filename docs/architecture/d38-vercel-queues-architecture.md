# D38 Vercel Queues architecture for the donation finaliser

Date 2026-11-01. Labels: **SOURCE** (read in this repository), **OFFLINE** (tests on a model of the documented queue, NOT Vercel), **DOC** (Vercel documentation read 2026-11-01), **ESTIMATE**, **NOT VERIFIED**, **OWNER**. Historical D35 to D37 reports are context, not evidence.

## 1. Verdict on the question

**Vercel Queues is suitable as the finaliser's trigger and as nothing more, and it can replace the unselected trigger without any VM, Redis or paid database.** It cannot be proven on Vercel from this machine: there is no Vercel CLI, login, token or `.vercel` project here (SOURCE, checked). Everything below that depends on Vercel behaviour is DOC or OFFLINE until the owner runs the Preview acceptance (`d38-vercel-preview-acceptance.md`).

## 2. What the documentation says, and what the design takes from it

| Documented fact (DOC) | Design consequence |
|---|---|
| Beta on all plans; durable, replicated before the publish returns; at-least-once delivery ([concepts](https://vercel.com/docs/queues/concepts)) | the queue is a trigger only; a duplicate delivery must be harmless (it is: the finaliser converges) |
| No FIFO guarantee, "even with a single consumer and max concurrency set to 1" | the processing order is the **order of the rows in Google Sheets**, never the order of callbacks |
| Retries until success or expiry; `maxDeliveries` caps a trigger; the SDK `retry` callback may acknowledge a poisoned message | application-level retry policy (`intakeRetryPolicy`); trigger `maxDeliveries: 8` |
| **No built-in dead-letter queue** | failure evidence lives in Google Sheets (`RETRY_PENDING`, `retryCount`, `lastErrorCategory`, `FAILED_REQUIRES_REVIEW`); an expired or acknowledged message erases nothing |
| Idempotency key: dedupe window `min(retention, 24 h)`, dedupe happens out of band after the publish returns; behaviour after acknowledgement is **not stated** | the design never relies on it: keys are per time bucket and per source (accept, handoff, reconcile), so a new bucket always produces a new message |
| Messages can be delayed (up to the retention) | each wake-up is sent with a delay of the coalescing window plus a skew margin (6 s) |
| Topics are partitioned by deployment id; push mode delivers to the SAME deployment that published; deleting a deployment stops its deliveries and its pending messages expire | a deployment change can strand wake-ups; reconciliation redispatches from the sheet; rollback and cutover steps account for it (`d38-donation-finaliser-worker-design.md`) |
| A push consumer with a `queue/v2beta` trigger has no public URL and only Vercel's queue can invoke it | no authentication logic is needed in the consumer; a second guard answers 404 unless the queued mode is on |
| Max concurrency per consumer group exists in push mode, **but its configuration key is not listed** in the trigger options table (`type`, `topic`, `retryAfterSeconds`, `initialDelaySeconds`, `maxDeliveries`) | **not used and not invented.** Correctness does not depend on it; concurrency is bounded by coalescing and by the finaliser lease where a coordinator exists |
| SDK type definitions of `@vercel/queue` 0.10.0 expose an **experimental** send option `experimental_concurrencyKey` ("at most one push delivery per key is active, coalesced messages re-run the handler") | **not used**: it is not in the published documentation. It is exactly the primitive the finaliser would like (one active delivery with coalescing); record it as a simplification to adopt when Vercel documents it |
| Hobby plan includes the first 1,000,000 queue API operations; message size is metered in 4 KiB units; sends with an idempotency key and push deliveries with max concurrency count at 2x ([pricing](https://vercel.com/docs/queues/pricing)) | see the cost estimate below |
| Local development needs `vercel link` and `vercel env pull` (OIDC) | not possible here; offline tests use a model of the documented semantics |

## 3. The design in one picture

```
Browser -> POST /api/intake/accept (flag DONATION_INTAKE_MODE=queued)
             1 Sheets read (eligibility + intake header contract), Drive proof, 1 Sheets append (RAW)  -> 202 "received", reference SUB-...
             then, best effort: send({v:1, type:"intake.drain", correlationId, bucket, hint?})  [no donor data]
Vercel Queues (topic daarayn-intake)  --push-->  private consumer  app/api/queues/intake-finaliser/route.ts
             handleCallback -> handleDrain: runFinaliserPass until idle (bounded budget) -> hand off with a delayed signal if not idle
Google Sheets  <-- the finaliser reads the pending intake rows itself, in intake order; every state lives here
Recovery: admin button | daily cron /api/internal/intake/reconcile | the consumer's own handoff  -> redispatch from the sheet
```

Files (all new, none imported by the direct path): `lib/intake/queue/{messages,dispatcher,consumer,reconcile,vercelTransport}.ts`, `app/api/queues/intake-finaliser/route.ts`, `app/api/intake/{accept,status}/route.ts`, `app/api/internal/intake/reconcile/route.ts`, `app/api/admin/intake-queue/route.ts`, `app/api/ops/queue-status/route.ts`, `deploy/vercel.d38-preview.json`.

## 4. Coalescing: one wake-up for a burst

Compared options: **A** one signal per intake record (30 submissions = 30 deliveries, each a full-sheet finalisation): rejected. **B** one idempotent batch wake-up per time bucket with a delay (chosen). **C** a coalescing window followed by one drain: this is B. **D** the experimental concurrency key: not documented, not used.

Why B loses no wake-up (proved by tests, OFFLINE): a wake-up is published with a delay of `COALESCE_SECONDS (5) + SKEW_MARGIN (1)` and keyed by the 5 s bucket of its publish time. A second submission in the same bucket has its publish deduplicated; that is safe because the delivered message becomes visible only after the bucket has ended, so the consumer's first read of the sheet already contains the second row. A submission that arrives while a pass is running either appears in the pass's idle check or has its own wake-up in a later bucket. A pass that cannot finish (time budget, busy lease, a failed pass) publishes a delayed handoff signal; if even that fails, reconciliation covers it. Keys are namespaced per source so a recovery signal can never be swallowed by the key of the message it recovers (a bug the tests found).

Measured on the model (OFFLINE): a burst of 30 produced at most 2 wake-ups and at most 8 finaliser passes (30 rows are 2 batches of 25 plus idle checks).

## 5. The publish / append gap, case by case (all OFFLINE tests)

| Case | Behaviour |
|---|---|
| Sheet append succeeds, publish fails | 202 still returned (`queued:false`), failure counted; reconciliation redispatches; the row is durable |
| Publish succeeds, HTTP response lost | donor resends with the same key: same reference, one donation (the later row is `DUPLICATE`) |
| Message delivered before the batch finishes | harmless: the pass reads the sheet, converges |
| Consumer crashes | redelivery; rows carry their own retry state; completes exactly once |
| Message expires, is lost, or its deployment is deleted | rows stay `RECEIVED` in the sheet; reconciliation redispatches; nothing silent |
| Duplicate delivery after acknowledgement | the second run finds nothing to do |
| Sheets unreadable | the consumer throws, the queue retries with backoff, after 8 deliveries the message is acknowledged and the rows remain for reconciliation |
| Poison message (wrong version, junk) | acknowledged and ignored; carries no financial work |

## 6. Cost estimate (ESTIMATE, from the documented operation definitions; the project's plan and credits are NOT VERIFIED)

Per wake-up message: 1 send (an idempotency key makes it 2 units) + 1 notify (the push delivery) + 1 delete (the acknowledgement) = **4 operations**; each message is far below 4 KiB (1 unit). A handoff or a retry adds another message of the same cost. Worst case is one wake-up per donation (donations spaced more than 5 s apart) plus one handoff: **8 operations per donation**. At 10,000 donations a month that is at most 80,000 operations; at 100,000 a month at most 800,000, below the 1,000,000 that the Hobby plan includes. A daily reconciliation adds at most 4 operations a day. A failed delivery that times out is billed for the function's full `maxDuration` (60 s): the cap `maxDeliveries: 8` bounds that. Push deliveries are ordinary function invocations at the existing compute rates: an idle poll is one Sheets read and about one second; a pass over a full batch took 13 to 25 s live. **Not claimed:** that queues are free, the Pro price per operation (regional, not fetched), whether this account has Queues enabled. **OWNER:** confirm the plan, the included usage and that no usage-based billing is enabled before the Preview run.

## 7. Failure and security notes

The consumer route is private only when its trigger is configured; the trigger lives in `deploy/vercel.d38-preview.json` and is applied with the documented `vercel deploy --local-config`, so the repository's `vercel.json` (and therefore Production) is unchanged. If the route were ever reachable publicly, a call would only run one bounded, idempotent pass (no data is returned). The accept route keeps the in-memory per-instance rate limiter (finding F4 stands). Queue messages contain no donor data (tested).
