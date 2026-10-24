# Repository Map

Root: `D:\Projects\NGO--main` (git root, remote `origin` = github.com/Arklintech/Daarayn-NGO, only `origin/main` exists remotely). Branches: `main`, `cutover-sheets-drive`, `fix/realtime-donations-khizr-removal` (HEAD `ff5ca7d`, 43 commits ahead of main, 72 ahead of cutover).

**Working-tree warning:** at audit time the directories `app/ lib/ components/ public/ data/ scripts/ docs/ config/` and `node_modules` are absent from disk; 236 tracked files show as deleted. HEAD holds them intact. Uncommitted: `next.config.ts` (+2 cache-header rules), `next-env.d.ts`. Untracked: `CLAUDE.md`, `PROJECT_*.md`, `.claude/`, `.claude-flow/`. Nothing was restored or changed; HEAD was exported read-only to a scratch directory for reading.

## Source layout (from HEAD)
| Path | Responsibility |
|---|---|
| `app/page.tsx`, `app/pay`, `app/donor` | Public pages |
| `app/admin/**` | Admin UI (client components); `AdminLayoutClient.tsx` shell |
| `app/field/**` | Field Agent UI; `FieldLayoutClient.tsx` |
| `app/api/**` | 40+ route handlers (see ARCHITECTURE_AND_DATA_FLOW) |
| `components/` | `DonateForm`, `QuickDonationRibbon`, `LegacySections`, header/footer, `providers/PWAProvider` |
| `lib/server/auth.ts` | `requireAdmin / requireAgent / requireAdminOrAgent` |
| `lib/google/{client,sheets,drive}.ts` | Google auth, `SheetsService`, `DriveService` |
| `lib/repositories/*` | One class per Sheets tab on `BaseRepository` (30 s cache) |
| `lib/services/donationService.ts` | Donation intake orchestration |
| `lib/donations/{metrics,snapshot}.ts` | Single source of money figures; batch-read snapshot |
| `lib/realtime/*` | Broadcaster, sheet event log, event contract, client hooks |
| `lib/email/*`, `lib/email.ts` | Provider manager, Gmail/Resend, templates, deliverability |
| `lib/communication-resolver.ts`, `lib/broadcast-worker.ts`, `lib/broadcast-store.ts` | Recipient resolution and send |
| `lib/security/*` | In-memory rate limiter, audit logger, unused RBAC, client session isolation |
| `lib/AuthContext.tsx`, `FieldAgentAuthContext.tsx`, `authCookies.ts` | Client auth |
| `public/sw.js` | Service worker |
| `middleware.ts` | Cookie-presence redirect for `/admin`,`/field` |

## Legacy / dead / risky files
- `lib/db.ts`: only its types are imported; its functions (`getOrCreateDonor`, `createDonation`, `saveAllocations`, `generateAIMessage`) have no callers. Contains local JSON fallbacks.
- `lib/db-sync.ts` (Firestore sync queue), `lib/sync/*`, `server.js` (Express), `mock_donations.ts`, `seed_test_donors.mjs`, `scripts/migrate-firestore-to-sheets.ts`, `scripts/export-firestore-data.js`: legacy Firestore-era.
- `data/*.json`, `data/secure_storage/**`: tracked local-fallback artifacts.
- Root `test-*.js`, `send_test_email.ts`: ad-hoc, **send real email**; `test-email.js` and `test-all-inboxes.js` contain a hardcoded SMTP password (see issues SEC-1).
- `sync_to_main.js`, `upload-env*.js`, `replace_*.js`, `fix_*.js`: one-off tooling with machine-specific paths.
