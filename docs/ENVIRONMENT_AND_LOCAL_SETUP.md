# Environment and Local Setup

Names only; never commit values.

## Variables and consumers
| Variable | Consumer | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/STORAGE_BUCKET/MESSAGING_SENDER_ID/APP_ID/MEASUREMENT_ID` | `lib/firebase.ts`, field-agents route | code has hardcoded production fallbacks |
| `FIREBASE_PROJECT_ID` | `lib/server/auth.ts` | falls back to public project id |
| `ADMIN_EMAILS` | `lib/server/auth.ts` | comma list; empty = all admin access denied |
| `GOOGLE_SHEET_ID`, `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `lib/google/client.ts` | hardcoded fallback ids exist |
| `GOOGLE_CLIENT_EMAIL` (or `GOOGLE_SERVICE_ACCOUNT_EMAIL`), `GOOGLE_PRIVATE_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` | `getGoogleAuth` | local JSON `daaraynorg-9165c-*.json` takes precedence if found, incl. a hardcoded other-machine path |
| `EMAIL_PROVIDER`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `FROM_EMAIL`, `RESEND_API_KEY` | `lib/email/*` | |
| `NEXT_PUBLIC_SITE_URL` | email links | |
| `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_APP_VERSION` | `config/features.ts` | |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN/ORG/PROJECT` | Sentry | |
| `VERCEL`, `NODE_ENV` | local-vs-/tmp fallbacks | |
| `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `GROK_*` | `ai-assist` route / stale | must be removed |

Presence check (booleans only) on the developer's `.env.local`: `ADMIN_EMAILS`, `GOOGLE_SHEET_ID`, `GOOGLE_PRIVATE_KEY`, `SMTP_USER`, `SMTP_PASS` are set; `ANTHROPIC_API_KEY` is not. Validity/permissions of any credential: **not tested**.

## Commands (from `package.json`)
```
npm install                 # npm ci FAILS: package-lock.json out of sync (@emnapi/runtime, @emnapi/core missing)
npm run dev                 # next dev
npm run build               # next build (type step fails on 2 errors)
npm start
npx tsc --noEmit --incremental false
npx eslint .                # `npm run lint` is broken on Next 16 (`next lint` reads "lint" as a directory)
```
`middleware.ts` uses the deprecated convention (Next 16 wants `proxy`). Node/npm used for the audit: see TESTS doc.

## Safe setup guidance
Use a separate test spreadsheet, Drive folder and SMTP account via env overrides before running any flow; remove the hardcoded fallback ids first or always set the env vars explicitly. Never run root `test-*.js` or `scripts/test_*` against real credentials (they write or email).
