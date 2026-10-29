# ROUTE & FEATURE INVENTORY (from source, 2026-10-17)

Status words: see PROJECT_FEATURE_AND_ACCEPTANCE_MATRIX.md. Nothing below was browser-tested in this audit. Auth legend: **none** = no server check; **admin** = `requireAdmin` (Firebase ID token verified, email in `ADMIN_EMAILS`); **agent** = active `Field_Agents` row; **admin|agent** = either.

Middleware (`middleware.ts`): for `/admin/*` and `/field/*` only checks that a cookie `daarayn_session` exists (a client-written presence flag, not a credential) and redirects to the login page; `/api/*` is excluded from the matcher so API security rests entirely on per-route checks. Sets X-Frame-Options etc. only on matched paths.

## Public pages
| Route | Files | Notes |
|---|---|---|
| `/` | `app/page.tsx`, `GlobalHeader`, `HeroSection`, `LegacySections`, `Footer`, `QuickDonationRibbon` | SEO metadata, canonical `https://daarayn.org`, JSON-LD. Sections/amounts are hardcoded (e.g. ₹1,500, ₹8,000 cases), not from Sheets. Ribbon loads `/api/causes`. |
| `/pay` | `app/pay/page.tsx`, `PayPageLayout`, `DonateForm` | Loads `/api/causes`; posts multipart to `/api/donate` with `submissionKey` (idempotency, UUID kept in a ref; reset on <500). |
| `/donor` | `app/donor/page.tsx` | Calls `/api/donor/lookup`. |
| `/donor/dashboard` | `app/donor/dashboard/page.tsx` | Calls `/api/donor/dashboard?donorId=`. |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | `app/sitemap.ts` (only `/` and `/donor`), `app/robots.ts` (disallows admin/field/api/donor dashboard), `app/manifest.ts` | |

## Admin pages (all client components; layout `app/admin/layout.tsx` + `AdminLayoutClient.tsx`; auth via `lib/AuthContext.tsx` → `/api/admin/session`)
| Route | APIs used | Persistence |
|---|---|---|
| `/admin/login` | Firebase client sign-in | cookies `daarayn_token`(1h), `daarayn_session`(24h) written by JS, SameSite=Strict, not HttpOnly |
| `/admin/dashboard` (`/admin` renders it) | `/api/admin/dashboard` | derived from Sheets snapshot; in-memory cache 3 min on error only |
| `/admin/donations` | `/api/admin/donations` GET/PATCH | Sheets `Donations` |
| `/admin/donors`, `/admin/donors/[id]` (+5 tabs) | `/api/donors`, `/api/admin/donations`, `/api/admin/communications`, `/api/causes`, `/api/admin/donors-local` | Sheets `Donors`; donors-local reads a JSON file (not authoritative) |
| `/admin/causes`, `/admin/causes/[causeId]` | `/api/causes`, `/api/admin/donations` | Sheets `Causes` (falls back to `DEFAULT_CAUSES` in UI on failure) |
| `/admin/campaigns`, `/admin/programs` | `/api/causes` POST, `/api/media` | **Saved as Causes rows** (extra fields like `isCampaign`/`goalAmount` are dropped by `causeRepository.mapEntityToRow`). `Campaigns`/`Programs`/`Allocations` repositories exist but no page uses them (only `dispatch-updates`). |
| `/admin/communications` | `/api/causes`, `generate`, `resolve`, `send`, `upload`, **`ai-assist`** | `Communications` row written after send |
| `/admin/communications/history` (`?id=`) | `/api/admin/communications`, `/status?id=` | `layout.tsx` sets force-dynamic. `/admin/communications/test-report` is a debug stub. |
| `/admin/notifications` | `/api/admin/notifications` | Sheets `Notifications`; read/star persisted; delete NOT persisted |
| `/admin/field-ops`, `/[id]` | `/api/field/reports`, `/api/field/chat`, `/api/admin/field-agents`, `/api/media`, SSE | Sheets |
| `/admin/field-agents`, `/[agentId]` | `/api/admin/field-agents`, `/api/field/reports` | Sheets `Field_Agents` + Firebase user creation via REST signUp |
| `/admin/ledger` | `/api/ledger` (admin), `/api/media` | Donation rows presented as ledger; no separate public ledger |
| `/admin/beneficiaries` | none | **localStorage `daarayn_beneficiaries`** |
| `/admin/faqs` | none | **localStorage `daarayn_admin_faqs`** (public site does not read it) |
| `/admin/settings` | none | **localStorage** (`daarayn_admins_list`, `daarayn_seo_meta`) |
| `/admin/sync` | `/api/admin/sync/status|retry` | status is a static descriptive response |

## Field pages (`app/field/*`; `FieldLayoutClient`, `lib/FieldAgentAuthContext.tsx`)
`/field/login`, `/field` (redirect), `/field/dashboard`, `/field/reports`, `/field/reports/new`, `/field/reports/[id]`, `/field/messages`, `/field/notifications`, `/field/profile`, `/field/help`. APIs: `/api/field/reports`, `/api/field/chat`, `/api/field/notifications`, `/api/field/profile`, SSE stream.

## API routes
| Route | Methods | Auth | Data |
|---|---|---|---|
| `/api/donate` | POST | none; in-memory IP rate limit 15/min | Donations, Donors, Drive, Notifications, Audit_Log, email |
| `/api/causes` | GET public (safe mapping); POST admin | GET none | Causes (seeds defaults if empty — unauthenticated GET can write) |
| `/api/donor/lookup` | POST | **none** | reads and **creates** Donors; returns profile |
| `/api/donor/dashboard` | GET | **none** | donor + donations by `donorId` |
| `/api/donors` | GET/POST | admin | Donors; POST merges arbitrary body fields |
| `/api/admin/donations` | GET/PATCH | admin | Donations |
| `/api/admin/donors-local` | GET | admin | local JSON file |
| `/api/admin/dashboard` | GET | admin | snapshot of 5 tabs |
| `/api/ledger` | GET | admin | Donations |
| `/api/admin/notifications` | GET/POST/PATCH/DELETE | admin | Notifications (shared, not per-admin) |
| `/api/admin/communications` | GET | admin | Communications |
| `…/communications/resolve|send|status|generate|upload|automations` | POST/GET | admin | see data-flows doc |
| `…/communications/ai-assist` | POST | **none** | external Anthropic API |
| `/api/admin/field-agents` | GET/POST/PATCH | admin | Field_Agents + Firebase REST signUp/password reset |
| `/api/field/reports` | GET/POST (admin\|agent), PATCH (admin) | as stated | Field_Reports, Drive |
| `/api/field/reports/[reportId]` | GET (admin\|agent, owner-scoped), PATCH admin | | |
| `/api/field/chat` | GET/POST admin\|agent (ownership-scoped) | | Field_Messages + `/tmp` JSON mirror |
| `/api/field/notifications`, `/api/field/profile` | GET | agent | |
| `/api/media` | POST | admin | Drive upload |
| `/api/media/[fileId]` | GET | **none** | Drive file stream; errors return 200 placeholder SVG |
| `/api/realtime/stream` | GET (SSE) | admin\|agent; audience-filtered | `Realtime_Events` |
| `/api/dispatch-updates` | POST | admin | Programs/Allocations; sends no email |
| `/api/test-email` | POST | admin | sends a real email |
| `/api/admin/sync/*`, `/api/seed-*` | | admin / 410 | deprecated stubs |
| `/api/manifest/admin|field`, `/api/admin/session` | GET | none / admin | |
