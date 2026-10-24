# Admin and Field Operations

## Admin Panel (`/admin`)
All pages are client components; identity from `AuthContext` → `/api/admin/session`. Role in UI is always "Super Admin" (no RBAC; `lib/security/rbac.ts` unused). Admin = email in `ADMIN_EMAILS`.
| Page | Data | Persistence |
|---|---|---|
| dashboard | `/api/admin/dashboard` | Sheets snapshot; zero-fallback on error |
| donations | `/api/admin/donations` | Sheets |
| donors, donors/[id] | `/api/donors`, donations, communications | Sheets |
| causes, causes/[id] | `/api/causes` | Sheets (UI falls back to defaults) |
| campaigns, programs | `/api/causes` POST | stored as Causes rows; extra fields dropped |
| communications, history | see COMMUNICATIONS doc | Sheets |
| notifications | `/api/admin/notifications` | Sheets; delete not persisted; read state global |
| field-ops, field-agents | field APIs, SSE | Sheets (+Firebase user creation) |
| ledger | `/api/ledger` | donation rows |
| beneficiaries, faqs, settings | none | **browser localStorage only** |
| sync | `/api/admin/sync/status` | static description; page still labelled "Firestore ➔ Google Sheets" |

## Field Agent portal (`/field`)
Agents are created by admin: Firebase `accounts:signUp` REST call with the public web API key (implies email/password self-signup is enabled on the Firebase project — unverified), then a `Field_Agents` row (`FA###`). Agent access: active status required. Agents see only their own reports, their general chat thread and threads of their reports, and their own notifications. Evidence viewing relies on unauthenticated `/api/media/<id>`.
Admin review: `PATCH /api/field/reports` or `/[reportId]` changes status and notifies the agent via Sheets + SSE; notes/assignee not persisted (see data model).
Offline: `lib/pwa/db.ts` IndexedDB scaffolding; actual queue/retry behaviour not verified.

## Synchronization
Admin and agent views update through SSE with audience filtering, then re-read APIs. Stale-data risks: 30 s repo caches per instance, multi-instance divergence until an SSE listener invalidates, event log polling cost, no versioning on row writes (last write wins).
