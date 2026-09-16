# DAARAYN — PRODUCTION ARCHITECTURE & OPERATIONS BASELINE

## 1. System Metadata & Canonical URLs
- **Canonical Production URL**: https://daarayn-ngo-ruby.vercel.app
- **GitHub Repository**: https://github.com/Anaskhan47/NGO-.git
- **Production Branch**: `main`
- **Certified Baseline Commit**: `cf2ff00`
- **Hosting Platform**: Vercel Serverless Platform (Node.js App Router)

---

## 2. Core Operational Architecture
DAARAYN operates as a unified operational ecosystem built with strict separation of concerns across three surfaces (Public Website, Admin Panel, Field Agent Portal):

1. **Identity & Authentication**: Firebase Authentication
   - Manages user credentials, identity tokens, and role definitions (`Admin`, `FieldAgent`).
2. **Structured Operational Data (Single Source of Truth)**: Google Sheets
   - Tab repositories: `Causes`, `Donors`, `Donations`, `Field_Reports`, `Field_Agents`, `Communications`, `Notifications`, `Audit_Log`, `Programs`, `Campaigns`, `Beneficiaries`.
3. **File, Document & Proof Storage (Single Storage Authority)**: Google Drive
   - Managed via `DriveService` with fallback storage.
   - Folders: `Payment Proofs/`, `Field Reports/Images`, `Field Reports/Documents`, `Field Voice Notes/`, `General Media/`.
4. **Realtime Event Dispatching**: Server-Sent Events (SSE)
   - Stream endpoint: `/api/realtime/stream`
   - Broadcast events: `FIELD_REPORT_SUBMITTED`, `FIELD_REPORT_UPDATE`, `CHAT_MESSAGE`, `NOTIFICATION_DISPATCH`.
5. **Email Communication Engine**: Gmail SMTP Transport (Nodemailer)
   - Host: `smtp.gmail.com:587`
   - Account: `daaraynorg@gmail.com`
6. **Operational AI Trust Engine**: KHIZR AI
   - Grounded query engine retrieving current structured data from Google Sheets repositories.

---

## 3. Application Surfaces & Modules
### A. Public Website (`/`)
- **Home & Hero**: Dynamic video hero,Quick Donation ribbon.
- **Causes Directory**: Public causes listing fetched via `/api/causes`.
- **Programs**: Family Relief, Qur'an Endowment, Masjid Infrastructure.
- **Public Donation (`/pay`)**: Multi-step donation, payment proof upload to Drive, Sheets record creation.
- **Track Donation**: Verified tracking query via `/api/ledger`.

### B. Admin Panel (`/admin`)
- **Dashboard (`/admin/dashboard`)**: Lifetime metrics, donation activity, operational status.
- **Field Operations (`/admin/field-ops`)**: Realtime SSE incident stream, status review, Take Action workflow.
- **Field Agents (`/admin/field-agents`)**: Agent registry, assignments, regional management.
- **Donors CRM (`/admin/donors`)**: Donor profiles, history, allocation tracking.
- **Donations (`/admin/donations`)**: Verification, payment proof viewer (Drive stream).
- **Cause Management (`/admin/causes`)**: Cause creation, goal tracking.
- **Programs (`/admin/programs`)**: Institutional programs management.
- **Public Ledger (`/admin/ledger`)**: Admin-only audit & transparency ledger.
- **Media Library (`/admin/media`)**: Asset management via Drive upload.
- **Donor Communications (`/admin/communications`)**: Targeted email campaigns, SMTP dispatch.
- **KHIZR AI (`/admin/ai`)**: Operational copilot & executive intelligence.

### C. Field Agent Portal (`/field`)
- **Dashboard & Assignments (`/field/dashboard`)**: Assigned tasks, submission metrics.
- **Submit Report (`/field/reports/new`)**: Field incident report with image & document upload to Drive.
- **Field Chat (`/field/messages`)**: Two-way realtime messaging, voice notes, file attachments.

---

## 4. Controlled Release Process
For all future software updates, follow the mandatory pipeline:

```
New Feature / Fix
       ↓
Local Implementation & Validation
       ↓
TypeScript Check (npx tsc --noEmit)
       ↓
Production Build Check (npm run build)
       ↓
Git Commit & Push (main)
       ↓
Vercel Automated Deployment
       ↓
Live Production Smoke Test
       ↓
Release Accepted
```

---

## 5. Emergency Recovery & Safety Guidelines
1. **Never alter Firebase Auth user UIDs**: User roles and permissions map directly to Firebase Auth credentials.
2. **Never edit Google Sheets tab headers**: Column mapping in `BaseRepository` relies on header names.
3. **Keep Drive folder structure intact**: `DriveService` automatically finds or creates named subfolders under the root parent folder.
