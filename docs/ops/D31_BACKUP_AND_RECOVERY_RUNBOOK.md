# D31 Backup and recovery runbook

## 1. What must be backed up
| Asset | Backup | Frequency | Restore effect |
|---|---|---|---|
| Coordinator state (budget times, leases, fencing counters; NO donor or financial data) | persistent-disk snapshot (`tools/limiter-server/deploy/backup-state.sh`, or a snapshot schedule), 7-day retention | daily | safe: stale times are in the past; a snapshot older than a minute can under-count recent reservations, therefore ALWAYS restore with a quarantine (delete the restored state file or start without `LIMITER_ACCEPT_EMPTY_STATE`; the 75 s hold applies) |
| Google Sheets (the only operational source of truth) | Google's own version history plus an owner-managed copy of the spreadsheet before every onboarding or migration (File > Make a copy, or Drive copy) | before each change and monthly | record counts and sample reconciliation after any restore |
| Drive evidence files | Drive's own retention; no application backup | n/a | |
| Application code and configuration | Git history, Vercel deployment history (instant rollback to a previous deployment) | every release | |

## 2. Coordinator recovery cases
| Case | Action | Evidence of success |
|---|---|---|
| Process crash | Docker restarts it; nothing to do | `/ready` 200 |
| VM reboot | container restarts by itself; the disk is mounted by UUID with `nofail` | `/ready` 200, `/metrics` shows leases/budgets continuing |
| State lost or corrupt | do nothing: 75 s quarantine; the corrupt file is kept as `limiter-state.json.corrupt-<time>`; find out why (disk errors, a bad restore) | `/ready` 503 then 200 |
| Disk failure | create a new disk from the latest snapshot (or empty), attach as `limiter-state`, remount, start WITHOUT accept-empty (quarantine applies) | `/ready` 200 |
| VM lost | recreate the VM from the runbook, attach the state disk, start | as above; DNS A record unchanged if the static IP was kept |
| Token leaked or suspected | generate a new token, update `limiter.env`, recreate the container, update the Vercel variable, redeploy; check Caddy logs | old token gets 401 |
During any coordinator outage the application refuses Google-backed requests (retryable 503); no financial record is created or lost because of the coordinator, and uncertain operations are reconciled from the sheets.

## 3. Restore drill (monthly, on a scratch disk)
Create a disk from the newest snapshot, mount it on a scratch VM or directory, start a coordinator against it on a different port with a different token, confirm `/ready` goes 503 then 200 and a lease acquire/release works, then delete the scratch resources. Record the date and result in `docs/audit/`.

## 4. Financial recovery (application level)
Use `D29_INCIDENT_AND_RECOVERY_RUNBOOK.md`: never resume an uncertain operation automatically; read back by the stable identity (submission key, request key, claim marker); an unfinished placeholder is adopted after 20 s by the same submission key; interrupted bookkeeping is completed from Admin > Reconciliation > Recover, which the owner runs deliberately.
