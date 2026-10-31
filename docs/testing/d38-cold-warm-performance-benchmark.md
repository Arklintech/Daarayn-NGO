# D38 cold and warm performance benchmark

Date 2026-11-01. **Categories are never mixed.** OFFLINE = fake sheets or the fake Google REST API with request counting (counts and behaviour, no meaningful latency). LIVE = real Google Sheets on the **approved test spreadsheet only**, one machine, one process, a local coordinator process (not hosted), email, Drive and realtime stubbed, synthetic records. PREVIEW = Vercel Preview: **not run**. D37 figures are quoted from `d37-queued-intake-and-finaliser.md`.

## 1. Track A: what a cold instance reads

Audit of the D37 intake path, attributed from the LIVE request labels (not guessed): per cold instance **3 reads** (D37 after its own one-read fix; 4 before): `get spreadsheet` (the tab listing needed for the numeric sheet id and the existence check), `get headers (batch)` (the header rows of the known tabs), `batch read` (eligibility: Causes plus Program_Content). Plus one `append rows (batch)` write.

Changes (each test-first, `tests/intake-cold-start.test.ts`, 8 tests, red then green):

| Change | Effect |
|---|---|
| Eligibility and the intake worksheet's **header row** are read in ONE `batchGet` (`batchGetRowsAndHeaders`, `readEligibilityWithHeaders`); no repository `init()` | removes the tab listing and the header batch |
| The intake row is appended with `valueInputOption: RAW` (`appendRowRaw`): literal text, nothing parsed or evaluated, no sheet id, no header read | one write, formula-safe by construction |
| **Schema contract**: `INTAKE_SCHEMA_VERSION = 1`; the header row must equal the contract columns from column A (extra columns to the right allowed); checked on EVERY request, cold or warm, never trusted from a cache | drift fails closed (`IntakeSchemaError`, nothing written, HTTP 503); a renamed or reordered column can never make a value land in the wrong column |
| A worksheet that does not exist yet (Google answers "Unable to parse range") is provisioned once (slow path), then the read is repeated | the only slow path; any other read error fails closed |

**Result (OFFLINE, real `SheetsService` against the fake Google API, requests counted): cold = 1 read + 1 write; warm = 1 read + 1 write.** Irreducible requests: the eligibility batch (a fresh read is required and may not be cached) and the append. The header contract check costs nothing extra because it rides in the eligibility request. Eligibility stays fresh and fail-closed (an injected read failure refuses the submission; an unknown cause is refused after the single read, nothing written). No idempotency, donor-uniqueness or validation read was removed (intake never had one: duplicates are resolved by the finaliser).

## 2. LIVE measurements (real Google, approved test sheet; each submission from its own module graph = a cold instance)

N = 30 simultaneous submissions, shared coordinator at 45 reads and 45 writes a minute:

| | D37 (3 reads cold, GCRA pacing, burst 5) | D38 fast path, **GCRA pacing** (run A) | D38 fast path, **window limiter** (run B) |
|---|---|---|---|
| Reads / writes per submission | 3 / 1 (D37 live N=12; N=30 at 4 / 1) | **1 / 1** (30 reads, 30 writes) | **1 / 1** (30 reads, 30 writes) |
| Acknowledgement wall time, all 30 | 158.7 s (at 4 reads) | **36.7 s** | **3.5 s** |
| Acknowledgement P50 / P95 / P99 | 138.6 / 157.6 / 158.7 s | 16.9 / 35.4 / 36.6 s | **2.6 / 3.4 / 3.5 s** |
| Inside 60 s | 0 / 30 | 30 / 30 | **30 / 30** |
| Google 429 / retries | 0 / 0 | 0 / 0 | **0 / 0** |
| Finalisation | 2 passes, 24.3 s | 2 passes, 24.3 s, 19 reads, 12 writes | 2 passes, 59.3 s, 19 reads, 12 writes |
| Receipt to COMPLETE P50 / P95 / P99 | 70.2 / 89.0 / 90.3 s | 30.0 / 46.8 / 46.8 s | 10.2 / 60.1 / 60.2 s |
| First submission to last COMPLETE (about) | about 183 s | about 61 s | about 63 s |
| Integrity | 30 / 30 / 30 / 30 | 30 distinct ids, 30 donors, 30 designations, 0 pending, payloads scrubbed | same |

Reading it correctly:

- The cold-start fix is what moved the number from "does not fit in 60 s" to "fits": 1 read per instance means 30 simultaneous submissions need 30 reads, below the 45-read budget.
- The window limiter turns that into an almost instant acknowledgement (P95 3.4 s) because an idle window admits the whole burst at once; the old pacing spaced the same 30 reads over 35 s.
- **Total completion did not improve, and cannot:** 30 donations still need about 49 reads (30 intake + 19 finaliser) against 45 per window, so the last reads wait for the window; first submission to last COMPLETE is about 61 s (pacing) or 63 s (window). The window limiter fixes burst latency, not capacity. Asynchronous processing does not raise Google's quota.

Directive targets (LIVE, Sheets side only):

| # | Target | Result |
|---|---|---|
| 1 | acknowledgement P95 <= 5 s | **met with the window limiter** (3.4 s); not met with GCRA pacing (35.4 s) |
| 2 | acknowledgement P99 <= 10 s | **met with the window limiter** (3.5 s) |
| 3 | all 30 cold submissions acknowledged inside 60 s | met in both modes (36.7 s, 3.5 s) |
| 4 | all 30 finalised within 120 s of the first submission | met (about 61 to 63 s) |
| 5 | no Google quota rejection | met (0 in all runs) |
| 6 to 9 | no duplicate completed donation, no wrong id, no overspending, no false COMPLETE | no duplicate or wrong id in any run; allocation not exercised; `final` only at COMPLETE (tests) |
| 10 | no indefinite pending record | needs a running trigger; the trigger is built and tested OFFLINE, not run on Vercel |

None of this is a Vercel result.

## 3. Cold versus warm

On Google's side there is no difference any more: both cost 1 read + 1 write (OFFLINE exact, LIVE confirmed for cold). What Vercel adds on a cold instance (function start, module load, Drive upload, the first token fetch) is **not measured**: the LIVE runs include module-graph loading per submission on one machine, which is not a Vercel cold start. This remains the Preview run's job.

## 4. Limits of these numbers

One machine and one process, a local coordinator, stubbed Drive and email, synthetic data, one spreadsheet that already holds thousands of earlier test rows (so the finaliser's whole-sheet reads are larger than a fresh sheet's). Run-to-run variation was not measured (single runs).
