# D31 Coordinator hosting runbook (operator steps; NOT executed: no Google Cloud access existed)

Extends `D29_COORDINATOR_DEPLOYMENT_RUNBOOK.md` with the prepared files in `tools/limiter-server/deploy/`. One VM, one disk, one coordinator process. Never create a second coordinator with its own disk.

## 0. Preconditions (stop if any is missing)
1. The owner approved the cost (calculator result) and the region; the project id is confirmed; billing is enabled.
2. A hostname you control, with its DNS A record pointing at the VM's static external address BEFORE Caddy starts.
3. `gcloud auth login` done by an authorised person; `gcloud config set project <PROJECT_ID>`.

## 1. Create the infrastructure (billable; needs authorisation)
```
REGION=us-east1; ZONE=us-east1-b          # match the Vercel function region (currently iad1); us-east4 is the nearest alternative
gcloud compute addresses create daarayn-limiter-ip --region $REGION
gcloud compute disks create daarayn-limiter-state --zone $ZONE --size 10GB --type pd-standard
gcloud compute instances create daarayn-limiter --zone $ZONE --machine-type e2-micro --image-family debian-12 --image-project debian-cloud \
  --address daarayn-limiter-ip --disk name=daarayn-limiter-state,device-name=limiter-state,mode=rw,boot=no --tags limiter --shielded-secure-boot
gcloud compute firewall-rules create limiter-https --allow tcp:80,tcp:443 --target-tags limiter     # 80 only for certificate issuance
# SSH only through Identity-Aware Proxy (no public port 22): allow the IAP range and use `gcloud compute ssh --tunnel-through-iap`
gcloud compute firewall-rules create limiter-iap-ssh --allow tcp:22 --source-ranges 35.235.240.0/20 --target-tags limiter
```
Never open port 8787. Do not change other firewall rules.

## 2. Prepare the host
On the VM: install Docker and the compose plugin; copy `tools/limiter-server/` (the Dockerfile, `server.cjs`, `gcra.cjs`, `deploy/`) to it; `docker build -f tools/limiter-server/Dockerfile -t daarayn-limiter:local .`; copy `deploy/docker-compose.yml` and `deploy/Caddyfile` to `/opt/daarayn-limiter/`; edit the hostname in the Caddyfile; run `deploy/install-vm.sh` as root (formats only an empty disk, mounts by UUID, creates the root-only token file).

## 3. First start and the empty-state rule
The first start on an empty disk is quarantined for 75 s by design. Either wait it out (preferred: nothing to remember), or start once with `LIMITER_ACCEPT_EMPTY_STATE=true` and immediately recreate the container without it. The variable must NOT stay set: it is the switch that would accept a lost state silently.

## 4. Verification on the REAL hostname (all must pass before the coordinator counts as hosted)
| # | Check | Expected |
|---|---|---|
| 1 | `curl -fsS https://<host>/health` | `{"ok":true,...}`, no secret |
| 2 | `curl -fsS https://<host>/ready` (after 75 s) | 200 |
| 3 | `curl -H "Authorization: Bearer $TOKEN" https://<host>/metrics` | counters only; without a token 401 |
| 4 | reserve: `POST /` with the script command (use `scripts/preview-acceptance.mjs` against a Preview, or `curl` the command from the tests) | granted, wait numbers |
| 5 | priority: P3 flood versus P0 | P0 admitted, P3 refused when the queue builds |
| 6 | lease: acquire, check, release; a second acquire is refused while held | |
| 7 | `docker kill -s KILL limiter`; Docker restarts it; `/ready` 200; the same lease/budget continues | |
| 8 | stop the VM and start it | container returns by itself; state intact |
| 9 | delete the state file, restart WITHOUT accept-empty | `/ready` 503 for 75 s, then 200; corrupt copy kept as `*.corrupt-*` |
| 10 | wrong token | 401; plain HTTP `curl http://<host>:8787` unreachable from outside |
| 11 | snapshot created and restorable (restore into a scratch disk, never over the live one) | |
Record the VM id, region, disk id and mount, image version and results in `docs/audit/evidence-d31/hosting-evidence.md`. Never record the token.

## 5. Day-two
Daily snapshot via `deploy/backup-state.sh` or a snapshot schedule; apply OS updates in a maintenance window (stop, patch, start; the application fails closed meanwhile); rotate the token by changing `limiter.env` and the Vercel variable, recreating the container and redeploying Vercel.
