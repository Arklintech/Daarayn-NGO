# D29 execution log

| Step | Action | Result |
|---|---|---|
| 0 | Recorded branch `feat/daarayn-pre-release-hardening`, HEAD `7e1068e`; working tree had only `.claude-flow/` untracked (previous work was committed in D27) | preserved |
| A1 | Inventoried every Google API request path (`REQUEST_PATH_INVENTORY.md`) | one bypass found: `scripts/inspect_google.ts` (direct Sheets calls, hard-coded production spreadsheet id) |
| A2 | Read the coordinator and adapters; verified quota defaults in `limiterConfig()` (45/45, burst 5, wait 25 s, project 200/200) | matches the earlier reports |
| A3 | `gcloud` not installed, no Google Cloud login: no read-only inspection of project, VMs, disks, billing possible; pricing from Google's published free-tier page and one secondary source for Memorystore | recorded as NOT VERIFIED |
| B1 | Added `tests/request-governance.test.ts` (CI guard) | 10 pass; also proves the detector flags an ungoverned call |
| B2 | Priority (P0 to P3) with atomic admit-or-refuse (script v3), rolling 60 s counters, shed counters | `tests/quota-governance.test.ts` 8 pass |
| B3 | Alert evaluator and `quota-health` admin route; coordinator `/metrics` | unit-tested |
| B4 | Coordinator validation, key bound, constant-time auth | 4 new tests pass (21 coordinator tests) |
| B5 | `scripts/inspect_google.ts` paced and made explicit about its target | governance test covers scripts |
| C1 | Allocation contention: offline randomised latency (20 trials) | no violation |
| C2 | Live allocation contention (test sheet, local coordinator): 6 x 30 against 100 | 3 admitted, total 90, 0 429 |
| F1 | Live 12-donation burst at the default wait limit | 12 accepted, 134 s, 100 reads / 82 writes, longest wait 15 s, 0 429, 0 refusals |
| G | Offline suite 55 files / 573 tests; tsc 0; eslint 0; build exit 0; bundle scan clean (public Firebase key only) | PASS |
| UI | No UI code changed in D29; the 280/320/375/430/820/1440 screenshots from D27 (`docs/audit/evidence-d27/`) remain the visual evidence | not re-captured |
| Not done | hosting, Vercel configuration, hosted tests, independent Vercel instances, 5x burst, real alert configuration, single-writer allocation design, quota verification in the console | each listed as NOT VERIFIED / NOT RUN with an owner action in the reports |
