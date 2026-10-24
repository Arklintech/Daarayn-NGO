# Architecture Decisions, Conflicts, Assumptions

## Approved (carried forward)
Next.js App Router + TS; Firebase Auth only; Sheets sole operational store; Drive for files; Gmail SMTP; SSE; Field Agents never "Volunteers"; no operational Firestore; no KHIZR/MOMIN/AI.

## Conflicts found in code
| # | Conflict | Evidence |
|---|---|---|
| C1 | AI/Khizr present | `app/api/admin/communications/ai-assist/route.ts` (Anthropic, unauthenticated); "Khizr" text in `app/admin/communications/page.tsx`; `KHIZR_` filter in dashboard; `generateAIMessage` in `lib/db.ts`; env names `AI_PROVIDER`, `GROK_*` |
| C2 | Non-Sheets stores | `data/*.json`, `/tmp` mirrors, Drive `secure_fallback`, `lib/db.ts` local donors/donations, `/api/admin/donors-local`, localStorage for Beneficiaries/FAQs/Settings |
| C3 | Firestore remnants | `lib/db-sync.ts`, `mock_donations.ts`, `seed_test_donors.mjs`, migration scripts, admin sync page wording. No active API route reads/writes Firestore (grep verified) |
| C4 | Firebase Storage initialised | `lib/firebase.ts` `getStorage` (unused) |
| C5 | "Volunteer" role remains | `lib/AuthContext.tsx` `AdminRole` includes "Volunteer Manager" |
| C6 | Auth beyond "authentication only" | none found; roles come from env + Sheets |

## Unresolved decisions needing approval
1. Removal scope of AI code and env names.
2. Public donor-portal auth model (OTP? signed link?).
3. Where Beneficiaries/FAQs/Settings live in Sheets (new tabs).
4. Media access model (signed expiring URLs vs auth proxy).
5. Whether to rotate the SMTP app password and purge commit `3b244e1` before any push.
6. History URL form (`?id=` vs path route).
7. Restore of the missing working-tree directories (not done; needs the user's say-so).

## Assumptions
Hosting is Vercel (inferred from `/tmp` branches, `vercel.json`); the deployed commit is unknown; Firebase email/password sign-up setting unknown.
