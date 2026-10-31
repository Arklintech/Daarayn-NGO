# Google Sheets request inventory (D35)

Derived from the code on 2026-10-31 (branch `feat/daarayn-pre-release-hardening`, HEAD `7e1068e` plus uncommitted work). Counts of requests per operation come from `tests/request-count-baseline.test.ts` (fake Sheets, one counted call = one Google request); nothing here was measured against Google.

## 1. Call sites that talk to Google Sheets (VERIFIED by search)

| File | Calls | Governance |
|---|---|---|
| `lib/google/sheets.ts` | `values.get`, `values.batchGet`, `values.append`, `values.update`, `values.batchUpdate`, `values.clear`, `spreadsheets.batchUpdate` | every call through `SheetsService.call` (retry + limiter slot) |
| `lib/sync/GoogleSheetsClient.ts` | `values.append`, `values.update`, `values.get` | `paced(...)` |
| `lib/realtime/eventLog.ts` | `values.get` (3 call sites: locate, end, read) and appends | `withGoogleRetry(..., kind: "read")` |
| `lib/google/readiness.ts` | `values.batchGet` of header rows | `withGoogleRetry` |
| `lib/google/client.ts`, `config.ts` | client construction, `guardWrites` write guard | production write guard |
| `scripts/inspect_google.ts` | `values.get` | offline tool, not part of the app |

CI guard: `tests/request-governance.test.ts` fails when a new unguarded call site appears.

## 2. Cost per business operation (TESTED, control)

| Operation | Reads | Writes | Requests | Evidence |
|---|---:|---:|---:|---|
| Donation, specific cause | 9 | 7 | 16 | request-baseline.json `oneDonationSpecificCause` |
| Donation, general | 7 | 6 | 13 | `oneDonationGeneral` |
| Donation retry (duplicate) | 3 | 0 | 3 | `duplicateRetry` |
| Allocation | 2 | 2 | 4 (+3 lease calls) | `oneAllocation` |
| 12 / 20 / 30 concurrent donations | 108 / 184 / 270 | 84 / 142 / 210 | 16.0 / 16.3 / 16.0 each | `concurrent12/20/30` |

Not included: realtime event-log requests (separate client), email (SMTP, not Sheets), Drive upload (separate API and quota). Admin dashboard, reports, communications and field-agent workflows were not counted in this session; their request counts are **NOT MEASURED**.

Budget (VERIFIED in `lib/google/requestControl.ts`): identity 45 reads and 45 writes per minute, burst 5, max wait 25 s; project 200 + 200. Google (checked 2026-10-31): 60 + 60 per user per project, 300 + 300 per project, service account = one user, a batch request = one request.

## 3. Endpoint inventory (61 route files, generated from the code)

Columns: route, methods exported, authentication detected in the file, explicit priority wrapper, financial-pause check, repositories referenced, services referenced. "Reads/writes" are the repositories each route reaches; exact per-call counts exist only for the operations in section 2. A blank priority means the default priority applies.

| Endpoint | Methods | Auth | Priority | Pause check | Repositories | Services |
|---|---|---|---|---|---|---|
| `admin/allocations` | GET,PATCH,POST | admin | P0 |  | allocation | createAllocation,reverseAllocation |
| `admin/catalog/upload` | POST | admin |  |  |  | driveService |
| `admin/communications` | GET | admin |  |  | communication |  |
| `admin/communications/ai-assist` | POST | removed (410) |  |  |  |  |
| `admin/communications/approve` | POST | admin |  |  |  |  |
| `admin/communications/automations` | POST | admin |  |  | cause,communication,donation | sendEmail |
| `admin/communications/generate` | POST | admin |  |  | cause |  |
| `admin/communications/recipients` | GET | admin |  |  | communicationRecipient |  |
| `admin/communications/resolve` | POST | admin |  |  |  |  |
| `admin/communications/send` | POST | admin |  |  | communicationRecipient |  |
| `admin/communications/status` | GET | admin |  |  | communication |  |
| `admin/communications/upload` | POST | admin |  |  |  | driveService |
| `admin/dashboard` | GET | admin |  |  |  |  |
| `admin/designations` | PUT | admin |  |  |  | recordDesignation |
| `admin/diagnostics/google-readiness` | GET | admin |  |  |  |  |
| `admin/diagnostics/google-usage` | GET | admin |  |  |  |  |
| `admin/diagnostics/quota-health` | GET | admin |  |  |  |  |
| `admin/donations` | GET,PATCH | admin | P1 | yes | auditLog,donation,donationCause | realtimeBroadcaster |
| `admin/donors-local` | GET | admin |  |  |  |  |
| `admin/donors/[id]/history` | GET | admin |  |  |  |  |
| `admin/field-agents` | GET,PATCH,POST | admin |  |  | auditLog,fieldAgent,notification | realtimeBroadcaster |
| `admin/google-drive/callback` | GET | none/other |  |  |  |  |
| `admin/google-drive/connect` | GET | admin |  |  |  |  |
| `admin/google-drive/create-root` | POST | admin |  |  |  |  |
| `admin/google-drive/status` | GET | admin |  |  |  |  |
| `admin/notifications` | DELETE,GET,PATCH,POST | admin |  |  | notification | realtimeBroadcaster |
| `admin/programs` | GET,POST | admin |  |  |  | realtimeBroadcaster |
| `admin/programs/hold` | POST | admin |  |  | auditLog,cause,programContent |  |
| `admin/programs/images` | DELETE,GET,PATCH,POST | admin |  |  | cause | driveService |
| `admin/reconciliation` | GET,POST | admin |  |  |  |  |
| `admin/session` | GET | admin |  |  |  |  |
| `admin/setup/operations` | POST | admin |  |  |  |  |
| `admin/sync/retry` | POST | removed (410) |  |  |  |  |
| `admin/sync/status` | GET | admin |  |  |  |  |
| `admin/sync/trigger` | POST | removed (410) |  |  |  |  |
| `causes` | GET,POST | admin | P3 |  | cause | realtimeBroadcaster |
| `dispatch-updates` | POST | admin |  |  | allocation,auditLog,communication,donor,program |  |
| `donate` | POST | none/other | P0 | yes | donation | donationService |
| `donor/dashboard` | GET | donor session |  |  | allocation,cause,donation,donor |  |
| `donor/lookup` | POST | donor session |  |  | donor | sendEmail |
| `donor/verify` | DELETE,POST | donor session |  |  |  |  |
| `donors` | GET,POST | admin |  |  | donor | realtimeBroadcaster |
| `field/chat` | GET,POST | admin |  |  | fieldMessage,fieldReport | realtimeBroadcaster |
| `field/notifications` | GET,PATCH | field agent |  |  | notification |  |
| `field/profile` | GET | field agent |  |  |  |  |
| `field/reports` | GET,PATCH,POST | admin |  |  | auditLog,fieldReport,notification | driveService,realtimeBroadcaster |
| `field/reports/[reportId]` | GET,PATCH | admin |  |  | auditLog,fieldReport,notification | realtimeBroadcaster |
| `files/share/[token]` | GET | none/other |  |  |  | driveService |
| `ledger` | GET | admin |  |  | donation |  |
| `manifest/admin` | GET | none/other |  |  |  |  |
| `manifest/field` | GET | none/other |  |  |  |  |
| `media` | POST | admin |  |  |  | driveService |
| `media/[fileId]` | GET | admin |  |  | cause,programImage | driveService |
| `ops/probe` | GET | ops token / Preview-only |  |  |  |  |
| `ops/quota-status` | GET | ops token / Preview-only |  |  |  |  |
| `programs` | GET | none/other | P3 |  |  |  |
| `public/stats` | GET | none/other | P3 |  |  |  |
| `realtime/stream` | GET | admin |  |  |  | realtimeBroadcaster |
| `seed-field-ops` | GET | removed (410) |  |  |  |  |
| `seed-sheets` | POST | removed (410) |  |  |  |  |
| `test-email` | POST | admin |  |  |  | sendEmail |

Note on the "Pause check" column: it detects a check written in the route file. The allocation pause (`allocationsPaused`) is enforced inside `createAllocation`, so `admin/allocations` shows no mark although it is paused in production. Auth "none/other" routes were each read: `donate`, `programs`, `public/stats`, the two manifests are public by design; `files/share/[token]` checks a signed expiring token; `admin/google-drive/callback` relies on a signed state cookie issued to an admin; `donor/dashboard` verifies the donor session. `seed-sheets`, `seed-field-ops` and `admin/communications/ai-assist` only answer 410.

### Criticality, idempotency and risk for the financial workflows

| Workflow | Reads | Writes | Criticality | Coordinator usage | Idempotency | Risk |
|---|---:|---:|---|---|---|---|
| `POST /api/donate` | 9 (7 general) | 7 (6) | Financial, P0 | one reservation per Google request; **no lease** | `submissionKey` (client UUID; server fallback is per request, so no protection if omitted); duplicate path costs 3 reads | Burst capacity (see audit section 4); per-instance rate limit |
| `PATCH /api/admin/donations` | 2 to 3 | 1 + audit | Financial, P1 | reservation per request; **lease only when leaving the verified state** (D35) | `expectedStatus` compare-and-set (read-then-write, not atomic) | Read-modify-write of a whole row |
| `PUT /api/admin/designations` | 3 | 1 + audit | Financial, default priority (no wrapper) | reservation + lease (D35) | replay safe (same split) | previously outside the lease; no explicit priority |
| `POST /api/admin/allocations` | 2 | 2 (+ audit) | Financial, P0 | reservation + 3 lease calls | `requestKey`; earliest row wins, later same-key rows are reversed by the system | needs a coordinator host; paused in production until verified |
| `PATCH /api/admin/allocations` (reverse) | 1 | 1 + audit | Financial, P0 | reservation only | idempotent (already reversed returns the record) | not serialised; reversal only lowers the allocated total |
| `GET /api/public/stats`, `/api/programs`, `/api/causes` | cached | none | Public, P3 | reservation | n/a | shed first under pressure |

## 4. Reuse and caching (VERIFIED)

- Eligibility for a donation is read fresh (never cached) in one batched request; allocations read their four inputs in one batched request. Good: no stale balance authorises a financial operation.
- `BaseRepository` keeps a per-instance cache (30 s TTL); financial paths pass `true` (force refresh) or read through `getRowsWithNumbers`.
- Not cached and not safe to cache: balances, designations, allocation totals. Safe to cache with a stated staleness: public programs and causes (30 s to minutes), non-critical dashboard aggregates.

## 5. Proposed reductions (PROPOSED, none implemented)

| # | Change | Expected effect | Safety requirement |
|---|---|---|---|
| R1 | Combine the four independent follow-up appends (donor, notification, audit, designations) into one `spreadsheets.batchUpdate` with `appendCells` | writes 7 -> about 4 per donation | prove on a test spreadsheet that header mapping, row order and the quota count (documented as one request per batch) hold; keep per-step failure reporting |
| R2 | Merge the id algorithm's first read into the claim read and drop one verification read where the claim marker already proves uniqueness | reads 9 -> about 7 | must keep the post-write uniqueness check; test with the existing concurrent-id tests plus 30-way bursts |
| R3 | Read the donor once (find and verify) | -1 read | tests for concurrent donors with the same contact |
| R4 | Request a Google quota increase for the project and per-user limits (free; approval not guaranteed) and evaluate additional service accounts (each has its own 60/min under the 300/min project limit) | capacity x2 to x5 without hosting cost | owner approval for new credentials; limiter identity keys per account |

Estimated combined effect of R1 to R3: about 16 -> about 11 requests per donation (about -30%). This is an estimate; it requires before/after measurement with the same harness.
