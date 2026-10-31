# D29 Google API request-path inventory (read from the code, verified by `tests/request-governance.test.ts`)

Scope: every Google Sheets API request in the repository. The guard test fails CI when a `.spreadsheets` call appears outside the approved adapters, when a Sheets client is created elsewhere, or when an approved adapter calls the API outside the limiter wrapper.

| Source (file: function) | Operation | Kind | Limiter coverage | Used by | Batching possible | Retry safe | Financial records |
|---|---|---|---|---|---|---|---|
| lib/google/sheets.ts: `ensureSheetExists` (spreadsheets.batchUpdate: add tab) | create worksheet | write | `this.call` (write) | admin/setup, first use | n/a | yes only after a read-back (tab exists) | no |
| lib/google/sheets.ts: tab listing (`spreadsheets.get`) | list tabs | read | `this.call` (read), shared in-flight request | all | already coalesced (one request for all tabs) | yes | no |
| lib/google/sheets.ts: headers (`values.get` 1:1, `values.batchGet` 1:1) | header check | read | `this.call` (read); header reads requested in one tick are batched into one request | all | already batched | yes | no |
| lib/google/sheets.ts: `getRowsWithNumbers` (`values.get` A:ZZ) | read worksheet | read | `this.call` (read); identical concurrent reads coalesced only if started after the last write finished | public, admin, background | yes (see batchGetRows) | yes | indirectly |
| lib/google/sheets.ts: `batchGetRows` (`values.batchGet`) | read several worksheets in one request | read | `this.call` (read) | donation eligibility (Causes + Program_Content), allocation inputs (Donations, Donation_Causes, Allocations, Causes) | already used on the financial paths | yes | yes (authoritative reads, never cached) |
| lib/google/sheets.ts: `appendRow(s)`, `batchAppendRows` (`values.append`) | add rows | write | `this.call` (write, quota-only retry) | donations, donors, designations, allocations, audit | multi-row appends already batched | ONLY after a definite HTTP 429; never after a timeout or 5xx (ambiguous: reconciled by marker) | yes |
| lib/google/sheets.ts: `updateRowAt/updateRowsAt/updateRow` (`values.update`, `values.batchUpdate`) | change rows | write | `this.call` (write) | status changes, verification, cache fields | updateRowsAt batches | yes (idempotent set of the same values) | yes |
| lib/google/sheets.ts: `clearRowAt`, clear range (`values.clear`) | blank rows | write | `this.call` (write) | duplicate cleanup, compensation | n/a | yes | yes |
| lib/realtime/eventLog.ts: locate / end / read (`values.get`, 3 places) | realtime event log reads | read | `withGoogleRetry` kind read | background (SSE broadcaster), admin | possible: fewer polls | yes | no |
| lib/realtime/eventLog.ts: appends | event rows | write | via SheetsService | background | batch append exists | as above | no |
| lib/google/readiness.ts (2 reads) | admin readiness | read | `withGoogleRetry` kind read | admin diagnostics | already a batch for headers | yes | no |
| lib/sync/GoogleSheetsClient.ts (5 calls) | legacy sync client | read/write | `paced()` (one attempt, 429 penalises the shared budget) | admin sync status route (SyncEngine) | no | writes: no blind retry | no (sync mirror) |
| scripts/inspect_google.ts (2 calls) | maintenance inspection | read | `acquireSlot("read")` (D29); target now from `INSPECT_SPREADSHEET_ID`, no hard-coded production id | manual only | n/a | yes | no |
| scripts/* other | seed, migration, schema tools | read/write | go through `SheetsService` (governed) when they use the application's classes; a standalone script process has its own process-local limiter unless the coordinator variables are set in that shell | manual only | | | seed/migration: yes |
| lib/google/drive.ts (Drive API) | files | n/a | Drive has its own quota; retried with `withGoogleRetry` | donations (proof upload), admin | n/a | uploads reconciled by the stable file name | evidence files |
| app/api/admin/google-drive/callback (Drive about.get) | OAuth check | Drive | outside this guard | admin | n/a | yes | no |
| Firebase Identity Toolkit REST (app/api/admin/field-agents) | authentication | not Google Sheets | not applicable | admin | n/a | n/a | no |

Findings fixed in D29: (1) `scripts/inspect_google.ts` called Sheets directly against a hard-coded production spreadsheet id with no pacing: now needs `INSPECT_SPREADSHEET_ID` and charges the shared read budget; (2) there was no CI guard: added. Remaining caveat: standalone script processes are separate processes; when run next to production traffic they share the coordinator only if the coordinator variables are exported in that shell.
