# D32 Production data onboarding runbook (future stage; nothing here was run)

Pre-requisites: production deployed and smoke-tested, financial operations still restricted, coordinator healthy, alerts verified, owner sign-off for onboarding recorded separately from the deployment sign-off.

1. Receive the real records and the owner's independent totals (counts and opening balances from the trust's books). Do not request or accept them before this stage. Keep them out of the repository and out of chat; use a private folder.
2. Convert to the batch format of `lib/onboarding/validate.ts` (donors, causes, donations, designations, allocations) and run `validateOnboardingBatch`; fix every problem at its source; `ok` must be true with the stated totals supplied.
3. Take a backup copy of the production spreadsheet; create the missing worksheets by the application's own setup under the write guard (production target) with NO rows; verify headers against the registry (drift check) and the `google-readiness` endpoint.
4. Rehearse the import on a copy first; then import into production in the order Causes, Donors, Donations, Donation_Causes, Allocations, Audit_Log through the application's repositories (not by pasting cells), in small batches within the quota budget (the limiter paces them).
5. Reconcile: record counts per sheet, totals against the owner's totals, designation and allocation caps (reconciliation page shows no new exceptions), a sample of donor dashboards against the books, the highest donation number against the application's counter.
6. Keep the import log and the validator output as evidence.
7. Activation sign-off (separate record): only then set `FINANCIAL_ACTIVATION_APPROVED=true` and redeploy; allocations remain paused until the allocation verification gate is accepted for production.
No donor communication is sent as part of onboarding. Test and dummy records are never imported.
