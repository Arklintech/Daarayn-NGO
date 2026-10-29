# CLAUDE.md — Daarayn Public Charitable Trust

Before any work, read in this order: `PROJECT_MASTER_CONTEXT.md`, `PROJECT_FEATURE_AND_ACCEPTANCE_MATRIX.md`, `PROJECT_KNOWN_ISSUES_AND_NEXT_STEPS.md`. Reference: `PROJECT_ROUTE_AND_FEATURE_INVENTORY.md`, `PROJECT_ARCHITECTURE_AND_DATA_FLOWS.md`. Older root reports (STATUS_REPORT, PHASE_3_*, CRITICAL_FIX_REPORT, …) are historical claims, not evidence.

## Non-negotiable rules
- Continue from the existing project state. Do not restart or re-architect without a proven root cause.
- Preserve committed, uncommitted and untracked work. Never reset/clean/stash/revert/switch branches without being asked.
- Firebase Authentication = authentication only. Google Sheets = sole operational data source of truth. Google Drive = evidence/files. Gmail SMTP (Nodemailer) = email. SSE = realtime.
- Do not reintroduce operational Firestore. Do not reintroduce KHIZR, MOMIN, AI chat or AI inference providers (the existing `ai-assist` route/"Khizr" UI is a known violation to remove, not a pattern to extend).
- Field Agents are "Field Agents", never "Volunteers".
- Never print or commit credentials, private keys, SMTP secrets or tokens; never expose donor/beneficiary personal data unnecessarily.
- Diagnose root causes before fixing. Keep test-only activity separate from implementation, and never run tests that write to production Sheets/Drive or email real recipients.
- SMTP acceptance is not inbox delivery; "attempted" is not "succeeded". Don't let an API report success on failure.
- Do not mark anything TESTED or DEPLOYED without actual evidence. Update the acceptance matrix when status changes.
- Do not deploy until explicitly authorized and the required acceptance tests pass.

## Stack
Next.js 16 App Router, React 19, TypeScript, Tailwind 4, npm. Repositories in `lib/repositories`, metrics in `lib/donations/metrics.ts`, auth in `lib/server/auth.ts`, realtime in `lib/realtime`. No test suite exists; `npx tsc --noEmit --incremental false` currently reports 3 errors.
