# D32 Final release acceptance matrix (D31 + D32)

Statuses: Implemented / Tested locally / Tested across processes / Tested across independent Vercel invocations / Infrastructure provisioned / Preview configured / Preview verified / Alerts configured / Alert delivery verified / Production configured / Production deployed / Production smoke-tested / Real data onboarded / Financial operations activated.

| Status item | Result |
|---|---|
| Implemented | YES for: HTTPS coordinator with durable state, leases, quarantine, validation, metrics; limiter adapter with priority; allocation serialisation and production pause; backend-conflict guard; financial activation switch; Preview-only probe and acceptance driver; quota alert rules and endpoints; Sheets-bypass CI guard; onboarding validator; deployment, backup and runbook files |
| Tested locally | YES (612 tests in 60 files) |
| Tested across processes | YES (separate processes against the real coordinator program; three instances of the real application build against it; D26 to D31) |
| Tested across independent Vercel invocations | NO |
| Infrastructure provisioned | NO (no VM, disk, DNS, certificate) |
| Preview configured / verified | NO / NO |
| Alerts configured / alert delivery verified | NO / NO |
| Production configured / deployed / smoke-tested | NO / NO / NO |
| Real data onboarded | NO (separate future stage; validator ready) |
| Financial operations activated | NO (restricted by code in production) |

## Gates run in this session (actual results)
| Gate | Result |
|---|---|
| Full offline suite | 60 files, 612 tests PASS (the D30 baseline of 57 files / 597 tests is preserved and extended by 3 files / 15 tests: onboarding validator 7, activation 2, probe 3, plus the conflict guard 2 and the global 429 alert 1) |
| Coordinator tests (real processes) | PASS (within the suite) |
| Allocation concurrency tests | PASS (2/6/12/20 offline; live runs of D30) |
| Sheets bypass guard | PASS |
| TypeScript | exit 0, 0 errors |
| ESLint | 0 errors |
| Production build | exit 0 on the final code (intermittent Google Fonts fetch failures occurred on earlier attempts: 2 of 5 builds in D31 needed a retry) |
| Bundle and secret scan | 62 files, only the public `NEXT_PUBLIC_FIREBASE_API_KEY` web identifier; no coordinator or monitor token pattern |
| Real-build multi-instance run | PASS (see the cross-instance report) |

## Release requirements
| Requirement | Status |
|---|---|
| Shared coordination verified across independent Vercel invocations | NOT VERIFIED |
| Allocation concurrency proven on the deployed system | NOT VERIFIED (live allocations stay blocked) |
| Selected coordinator topology actually deployed | NOT DONE |
| Alert delivery verified | NOT DONE |
| Donation recovery proven | TESTED locally and live on the test sheet; NOT on Vercel |
| No bypass path | PASS (CI guard) |
| Production worksheets and migration rehearsal | NOT DONE |
| Domain, HTTPS | NOT DONE (no DNS) |
| OAuth production-ready | NOT DONE (owner decisions) |
| Financial owner policies approved | NOT DONE |

## FINAL STATUS: READY AFTER SPECIFIED EXTERNAL SETUP
(Status 2 of 6. Not "ready for Preview certification" because even the Preview needs the coordinator host, Vercel access and an alert recipient that do not exist yet.)
