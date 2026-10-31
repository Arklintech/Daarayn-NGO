# D31.7 Preview acceptance matrix

Classification vocabulary: IMPLEMENTED / TESTED LOCALLY (one process or fakes) / TESTED ACROSS PROCESSES (separate OS processes; D31 also the real application build) / TESTED ACROSS INDEPENDENT VERCEL INVOCATIONS / INFRASTRUCTURE PROVISIONED / PREVIEW VERIFIED / NOT VERIFIED.

**Preview certification: NOT ACHIEVED.** No independent Vercel invocation test was possible, no coordinator is hosted, no Preview with the current code exists, no alert was delivered.

| Requirement | Acceptance condition | Status |
|---|---|---|
| Coordinator hosting | real HTTPS service responding | NOT VERIFIED (infrastructure NOT PROVISIONED; prepared in `tools/limiter-server/deploy/`) |
| Persistence | restart and recovery verified | TESTED ACROSS PROCESSES (restart, SIGKILL, missing/corrupt state, quarantine persistence) on this machine; hosted NOT VERIFIED |
| Authentication | correct secret accepted, wrong refused | TESTED ACROSS PROCESSES (coordinator and operator endpoints; constant-time comparison); hosted NOT VERIFIED |
| Shared quotas | proven across independent Vercel instances | TESTED ACROSS PROCESSES (three instances of the real build, one budget); Vercel NOT VERIFIED |
| Request priority | P0/P1 protected from lower-priority traffic | TESTED LOCALLY and ACROSS PROCESSES (flood of 48 P3 vs 6 P0 over 3 instances: 6/6 P0 admitted); Vercel NOT VERIFIED |
| API quota controls | read/write budgets independently verified | TESTED ACROSS PROCESSES; real Google quotas NOT VERIFIED |
| Donation concurrency | correct records, no duplicates | TESTED ACROSS PROCESSES against the test sheet with a local coordinator (6, 12, 20, 30 simultaneous; replay; exhaustion); Vercel NOT VERIFIED |
| Allocation concurrency | balance invariant, no over-allocation | TESTED ACROSS PROCESSES (2/6/12/20 competitors live on the test sheet, lease from a local coordinator); NOT a transaction; Vercel NOT VERIFIED; live allocations remain blocked in production |
| Stale workers | cannot proceed after losing ownership | TESTED LOCALLY (self-fencing before the write; a stalled worker wrote nothing); storage-level fencing is NOT possible with Sheets |
| Failure handling | controlled fail-closed behaviour | TESTED ACROSS PROCESSES (coordinator stop, conflict, quarantine, wrong token); Vercel NOT VERIFIED |
| Recovery | interrupted operations reconciled | TESTED (placeholder adoption, replay after exhaustion; reconciliation page shows interrupted test donations); Vercel NOT VERIFIED |
| Monitoring | real metrics available | IMPLEMENTED (coordinator `/metrics`, `quota-health`, `quota-status`), TESTED LOCALLY; hosted NOT VERIFIED |
| Alerts | an actual notification received | NOT VERIFIED (not configured; no recipient) |
| Preview build | successful | NOT VERIFIED for the current code (local production build passes; intermittent Google Fonts fetch failures noted); the old Preview built successfully |
| Security | no exposed secrets or bypasses | TESTED LOCALLY: bundle scan finds no coordinator or monitor token pattern (only the public Firebase web key); CI guard against Sheets bypass; Preview-only probe is disabled in production and without a token |
| Backend conflict | one backend only | IMPLEMENTED and TESTED (both Redis URL and coordinator configured: not ready, requests refused) |
| Financial restriction in production | donations, donation changes and allocations paused until approved | IMPLEMENTED and TESTED LOCALLY (`FINANCIAL_ACTIVATION_APPROVED`, `ALLOCATION_SERIALIZATION_VERIFIED`); production configuration NOT VERIFIED |
