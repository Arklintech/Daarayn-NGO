# Daarayn — Project Overview

Audit date: 2026-10-24. Evidence base: source of commit `ff5ca7d` (branch `fix/realtime-donations-khizr-removal`) read directly, plus tsc/eslint/build run on an isolated copy. No live Sheets/Drive/SMTP/Firebase call was made. Complements (does not replace) `PROJECT_MASTER_CONTEXT.md` (2026-10-17), whose findings were re-verified against code here.

## Purpose
Daarayn Public Charitable Trust operating system: public donation site, Admin Panel, Field Agent portal, lookup-based Donor portal.

## Approved architecture (verified in code)
| Concern | System | Status in code |
|---|---|---|
| App | Next.js 16.2.10 App Router, React 19.2.4, TS (strict, noImplicitAny off), Tailwind 4 | yes |
| Auth | Firebase Auth only; server verifies ID tokens with `firebase-admin` (`lib/server/auth.ts`) | yes |
| Operational data | Google Sheets via `lib/google/sheets.ts` + `lib/repositories/*` | yes (see conflicts) |
| Files | Google Drive via `lib/google/drive.ts` | yes, with local-disk fallback |
| Email | Nodemailer/Gmail SMTP (`EMAIL_PROVIDER=gmail`), Resend adapter alternative | yes |
| Realtime | SSE `/api/realtime/stream` over append-only `Realtime_Events` sheet tab | yes |
| Hosting | Vercel (`vercel.json`, `/tmp` branches in code) | assumed |

## Application areas
- Public: `/`, `/pay`, `/donor`, `/donor/dashboard`.
- Admin `/admin/*` (dashboard, donations, donors, causes, campaigns, programs, communications, notifications, field-ops, field-agents, ledger, beneficiaries, faqs, settings, sync).
- Field `/field/*` (login, dashboard, reports, messages, notifications, profile, help).
- PWA: `app/manifest.ts`, `/api/manifest/admin|field`, `public/sw.js`.

## Headline state
Core donation → verify → dashboard path is implemented against Sheets/Drive. Significant defects: unauthenticated PII/file endpoints, AI/"Khizr" feature present, several admin pages localStorage-only, email status not persisted, committed SMTP password literal, source tree missing from the working directory. See `TESTS_AND_KNOWN_ISSUES.md`.
