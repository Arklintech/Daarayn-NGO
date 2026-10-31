# D29 Coordinator deployment runbook (Google Compute Engine VM, persistent disk)

Status: PREPARED, NOT EXECUTED. This machine has no `gcloud` CLI and no Google Cloud login (checked), so nothing was provisioned or inspected in Google Cloud. Every step below is for the owner (or an operator with access) to run. Nothing here is verified against a live project.

Scope: the coordinator (`tools/limiter-server/server.cjs`) is infrastructure that supports the Vercel application. It stores only theoretical-arrival-time numbers per budget. It holds no donor data, no financial data and no Google data and is not a source of truth. The application, admin panel, API routes and the Khidr integration stay on Vercel.

## 1. Read-only checks before any change (owner)
1. `gcloud --version`, `gcloud auth list`, `gcloud config list` (active account and project).
2. Confirm the active project is the intended Daarayn project (`daaraynorg-9165c` appears in the repository's credential file names; confirm it in the console).
3. List what already exists: `gcloud compute instances list`, `gcloud compute disks list`, `gcloud compute firewall-rules list`, `gcloud billing projects describe PROJECT`.
4. Look at the Sheets API quotas (Console > APIs & Services > Google Sheets API > Quotas): record the real "Read requests per minute per user", "Write requests per minute per user" and the per-project values. The application defaults assume Google's documented 60/60 per user and 300/300 per project; these have NOT been verified for this project.

## 2. Topology
| Item | Choice |
|---|---|
| VM | one `e2-micro` (0.25 vCPU burst, 1 GB) or `e2-small`, Debian/Ubuntu LTS, in `us-central1`, `us-west1` or `us-east1` |
| Disk | a SEPARATE persistent disk (10 GB pd-standard is plenty) mounted at `/var/lib/daarayn-limiter`, `discard,defaults,nofail`; the boot disk is not used for state |
| Process | Docker image from `tools/limiter-server/Dockerfile` or `node server.cjs`, one container with `--restart unless-stopped`, volume `/var/lib/daarayn-limiter:/data` |
| TLS | a domain name pointing at the VM's static IP and a reverse proxy (Caddy) terminating HTTPS on 443 and proxying to `127.0.0.1:8787`; the coordinator binds only to `127.0.0.1` (`LIMITER_HOST=127.0.0.1`) so it is never reachable without TLS |
| Firewall | allow 443 (and 22 from the operator's address only); deny 8787 from outside |
| Static IP | reserve one (a reserved IP in use is free; unused it is billed) |

## 3. Cost assumptions (to be confirmed by the owner in the pricing calculator before purchase)
- Google documents a free tier for ONE non-preemptible `e2-micro` per month in `us-west1`, `us-central1` or `us-east1`, with 30 GB-months of standard persistent disk and 1 GB of North America egress per month (source: Google Cloud free tier documentation, fetched during D29). Coordinator traffic is small (a few hundred small requests an hour), but egress above 1 GB, a second disk beyond the 30 GB, a static IP not in use, snapshots and any other VM in the billing account are charged.
- If the free tier does not apply (other region, other e2-micro already running), expect a few US dollars a month for the VM and disk; a snapshot schedule adds cents. These are estimates, not quotes.

## 4. Provisioning (owner; billable steps need authorisation)
```
gcloud compute disks create daarayn-limiter-state --size=10GB --type=pd-standard --zone=us-central1-a
gcloud compute instances create daarayn-limiter --zone=us-central1-a --machine-type=e2-micro --image-family=debian-12 --image-project=debian-cloud --disk=name=daarayn-limiter-state,device-name=limiter-state,mode=rw,boot=no --address=<reserved-ip> --tags=limiter
```
On the VM: format the disk once (`mkfs.ext4 -m 0 /dev/disk/by-id/google-limiter-state`), mount it, add it to `/etc/fstab` by UUID with `nofail`, install Docker and Caddy, `chown` the state directory to the container user (uid 1000, `node`).

## 5. Run
```
docker build -f tools/limiter-server/Dockerfile -t daarayn-limiter .
docker run -d --name limiter --restart unless-stopped -p 127.0.0.1:8787:8787 \
  -v /var/lib/daarayn-limiter:/data \
  -e LIMITER_TOKEN="$(cat /root/limiter-token)" -e LIMITER_REQUIRE_HTTPS=true -e LIMITER_HOST=0.0.0.0 \
  daarayn-limiter
```
(`LIMITER_HOST=0.0.0.0` inside the container; the host publishes the port on 127.0.0.1 only.) The first start on an empty volume is quarantined for `LIMITER_QUARANTINE_MS` (75 s). Add `-e LIMITER_ACCEPT_EMPTY_STATE=true` for that very first start only, then remove it. Generate the token with `openssl rand -base64 32`, store it in Secret Manager or a root-only file, and set the same value in Vercel (see D29_VERCEL_CONFIGURATION.md). Never put it in the image, the repository or a log.

Caddyfile: `limiter.example.org { reverse_proxy 127.0.0.1:8787 }` (Caddy sends `X-Forwarded-Proto: https`, which the coordinator requires when `LIMITER_REQUIRE_HTTPS=true`).

## 6. Single-instance enforcement
- One VM, one container, `--restart unless-stopped`; do NOT put it in a managed instance group, behind an autoscaler or on Cloud Run.
- A lock file on the state disk stops a second process on the same disk (verified by test: second instance exits with code 2). A second VM with its own disk cannot be detected from the code: never create one. Deployments are stop-then-start (`docker stop limiter && docker rm limiter && docker run ...`), never overlapping.

## 7. Verification after provisioning
1. `curl https://limiter.example.org/health` -> `{"ok":true,...}` (no secret in the body).
2. `curl https://limiter.example.org/ready` -> 200 once the quarantine has ended.
3. `curl -H "Authorization: Bearer $TOKEN" https://limiter.example.org/metrics` -> counters only.
4. Without a token every POST returns 401; plain HTTP behind the proxy returns 421.
5. Reboot the VM: after boot the container returns, `/ready` is 503 only if the state was lost; the same budget continues otherwise.
6. Run `tests/live/shared-limiter-real.live.test.ts` with the real URL and token, then the six-donation and burst runs from `docs/audit/D29_CAPACITY_AND_LOAD_TEST_REPORT.md` with the same variables on every process.

## 8. Backup and recovery
- Daily disk snapshot with a 7-day retention (a schedule policy). The state is only quota timing: restoring an old snapshot is SAFE because stale arrival times are in the past, but a snapshot older than a minute may under-count recent reservations; after a restore start with a quarantine (do not set `LIMITER_ACCEPT_EMPTY_STATE`; delete the state file so the 75 s quarantine applies).
- Lost or corrupted state needs no manual repair: the coordinator quarantines every budget for 75 s and keeps the corrupt file as `*.corrupt-<time>`.

## 9. Monitoring and alerting requirements
See D29_MONITORING_AND_ALERTING_RUNBOOK.md. Minimum: an uptime check on `/health` and `/ready`, a disk-usage alert, a VM restart alert and the quota-health alerts. None of these is configured yet.

## 10. Rollback
Stop the container; the application then fails closed (retryable 503) for Google-backed routes. To roll back the application, redeploy the previous Vercel deployment; to remove the coordinator entirely, unset the two Vercel variables ONLY together with `GOOGLE_LIMITER_ALLOW_PROCESS_LOCAL=true` on a verified single-instance deployment (not on Vercel). Do not delete the state disk before the incident is closed.

## 11. Why not Cloud Run with local disk
Cloud Run's filesystem is ephemeral and instances can overlap during deploys; the coordinator's durability and single-authority properties depend on one persistent disk and one process. Cloud Run would need a separately designed and verified shared durable state; that is not implemented.
