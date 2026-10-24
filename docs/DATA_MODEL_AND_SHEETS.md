# Data Model and Sheets

Spreadsheet id: `GOOGLE_SHEET_ID` env, **with a hardcoded fallback id in `lib/google/client.ts`** (same for `GOOGLE_DRIVE_ROOT_FOLDER_ID`). Tabs are auto-created with headers by `ensureSheetExists`; unknown record keys auto-append new header columns. Rows are cleared, never deleted. `parseValues` skips rows whose first cell is empty. Writes are `values.update` at a row number or `values.append`; no transactions or versioning.

| Tab | Repository | Columns (headers in code) | Created by | Updated by |
|---|---|---|---|---|
| Donations | `donationRepository` | id, donorId, donorName, donorEmail, amount, currency, date, status, paymentMethod, causeId, causeTitle, proofDriveFileId, transactionReference, notes, submissionKey | `/api/donate` | `PATCH /api/admin/donations` |
| Donors | `donorRepository` | id, name, email, phone, country, city, donationPreference, communicationPreference, dateJoined, totalDonations, totalAmountDonated, projectsSupportedCount, casesSupportedCount, donationHistory(JSON), projectsSupported(JSON), casesSupported(JSON), status | `/api/donate`, `/api/donor/lookup` (anonymous!), `/api/donors` POST | donationService, `/api/donors` POST |
| Causes | `causeRepository` | id, title, category, targetAmount, raisedAmount, location, description, status, imageUrl, driveFileId, createdAt | `/api/causes` POST; GET seeds `DEFAULT_CAUSES` if empty | same |
| Campaigns / Programs / Allocations | respective repos | see source | no page writes them (Programs/Campaigns pages write Causes) | `dispatch-updates` reads |
| Field_Reports | `fieldReportRepository` | id, agentId, agentName, category, title, description, urgency, estimatedBudget, location, beneficiaries, media, documents, status, timelineStages, assignedTo, createdAt, updatedAt | `/api/field/reports` | admin PATCH (notes/assignee fields dropped) |
| Field_Agents | `fieldAgentRepository` | id, firebaseUid, name, email, phone, country, state, district, city, address, role, region, status, assignedSupervisor, avatarUrl, joinDate, requirePasswordChange, permissions, stats | `/api/admin/field-agents` | same |
| Field_Messages | `fieldMessageRepository` | id, conversationId, reportId, agentId, senderId, senderRole, senderName, text, timestamp, read, attachmentDriveFileId | `/api/field/chat` | — |
| Notifications | `notificationRepository` | id, recipientType, recipientId, type, title, message, read, isStarred, relatedEntityId, createdAt | services/routes | PATCH read/star; **DELETE is a no-op** |
| Communications | `communicationRepository` | id, type, subject, bodyText, selectedCauses, recipientCount, sentCount, failedCount, status, createdBy, createdAt, completedAt, errorSummary | `processBroadcast`, automations | — |
| Audit_Log | `auditLogRepository` | event_id, actor_id, actor_role, action, entity_type, entity_id, before_state, after_state, timestamp, request_id, source | many | append-only by convention |
| Realtime_Events | `lib/realtime/eventLog.ts` | eventId, type, audience, payload, createdAt, origin | broadcaster | never |
| _System | `initializeSystemMetadata` | schema/migration info | scripts | — |

## Identifiers
`DA###` donations (max+1 within position-locked row), `DNR-<base36>-<rnd>` donors (non-atomic create; duplicates possible), `FR###`/`FA###` via `nextSequentialId` (max+1 from fresh read, non-atomic), `BCAST-<ts>-<n>`, `NOTIF-…`, `AUDIT-…`, `MSG-…`.

## Relationships
Donation→Donor by `donorId`, fallback normalized `donorEmail` (`metrics.belongsToDonor`). Donation→Cause by `causeId` else title match (`resolveCauseId`). Donor counters (`totalDonations`, …) are legacy; figures derive from donations.

## Source-of-truth risks
- Competing stores: `data/*.json` and `/tmp` mirrors (`field_chat.json`, `secure_storage`, `donors.json` via dead `lib/db.ts`), browser localStorage for Beneficiaries/FAQs/Settings (`daarayn_beneficiaries`, `daarayn_admin_faqs`, `daarayn_admins_list`, `daarayn_seo_meta`), `donor_id` in localStorage.
- Fields lost on write: `confirmationEmail*` (Donations), `adminNotes`/`assignedAdminId` (Field_Reports), `allocatedAmount`/`allocationStatus`, `selectedCauses`, milestone fields (Communications).
- Duplicate ids pre-existing in data (reported DA006) are surfaced as `duplicateIds`; not verified against live sheet.
- Cache: per-instance 30 s; cross-instance invalidation only via SSE-listener instances.
No data was read from or written to the real spreadsheet during this audit.
