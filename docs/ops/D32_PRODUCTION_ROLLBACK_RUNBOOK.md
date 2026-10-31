# D32 Production rollback runbook

| Situation | Action | Notes |
|---|---|---|
| A bad application deployment | in Vercel, promote/redeploy the previous production deployment (instant rollback) or `vercel rollback` | no data migration is involved: Sheets stays as it is; check readiness and the paused state afterwards |
| Allocation misbehaviour | unset `ALLOCATION_SERIALIZATION_VERIFIED`, redeploy | allocations answer the paused 503; donations continue |
| Any doubt about financial correctness | unset `FINANCIAL_ACTIVATION_APPROVED`, redeploy | donations, donation changes and allocations pause; public pages stay up |
| Coordinator trouble | the application already fails closed; fix or restore the coordinator (D31 backup runbook) | do NOT set `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL` on Vercel |
| Wrong environment variable or token | correct it, redeploy (variables apply only to new deployments) | |
| Data import went wrong | restore the pre-import copy of the spreadsheet or its version history; discard the import log; re-run the validator before trying again | follow the data onboarding runbook |
| Domain or OAuth change went wrong | revert the change in the respective console; keep the previous values recorded before every change | |
Before every production change record: the current production deployment id, the list of variable NAMES, and a spreadsheet copy. After a rollback re-run the smoke tests and write the incident record in `docs/audit/`.
