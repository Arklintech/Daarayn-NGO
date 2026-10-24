# Donor and Donation Workflows

## Lifecycle
1. **Submit** (`/pay`): name, contact (email or phone), amount, cause(s), UPI ref, screenshot. Client sends `submissionKey` (retry-safe; reset on <500 response).
2. **Intake** (`donationService.processDonation`): see ARCHITECTURE_AND_DATA_FLOW. New donations are always `pending`; payment method forced "UPI"; notes record a fixed 90/10 split. Multi-cause selection is accepted but only a single selected cause resolves to a `causeId`; `selectedCauses` is never stored.
3. **Acknowledge**: email only if contact contains `@`; phone-only donors get no acknowledgement. Result (`confirmationEmailSent/Error`) is returned to the browser only.
4. **Admin visibility**: SSE `DONATION_CREATED`, Notifications row, `/admin/donations` list (includes `proofUrl=/api/media/<id>`).
5. **Verify/reject**: `PATCH /api/admin/donations` with optional `expectedStatus`; audit and SSE follow. No "allocated" transition is reachable from the UI/API (`saveAllocations` in dead `lib/db.ts`).
6. **Reporting**: totals from `metrics.ts` (received = completed|verified|allocated).
7. **Communication history**: broadcasts recorded in `Communications`; no per-donor history is stored (donor "Communications" tab filters broadcasts).

## Donor management
- Create: automatically at donation; also anonymously by `POST /api/donor/lookup` (creates a row for any email/phone — spam/enumeration risk); admins via `POST /api/donors` (merges arbitrary body fields on edit).
- Dedupe: `findByContact` exact lowercase email or exact phone; no normalization of phone formats; two simultaneous first-time donations can create two donors.
- Search/filter: `GET /api/donors?q=&status=` over name/email/phone/id.
- Donor portal: `/donor` posts identifier, stores donor id in localStorage; `/donor/dashboard?donorId=` has **no auth**. Additionally the dashboard filter `d.donorEmail === donor.email` matches *all* donations with an empty email when the donor has no email (phone-only donor sees other phone-only donors' donations). Code-read finding, not executed.

## Where it stops/fails (by code)
Drive failure → proof `local_*` or empty and a 200 placeholder image on view; email failure not persisted; rejected→pending transitions allowed; no refund/edit flow; no payment gateway (manual UPI screenshot verification only, by design).
