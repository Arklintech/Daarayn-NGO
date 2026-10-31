# D31.1 Infrastructure provisioning report

Overall: NOT PROVISIONED. No billable resource was created and no cloud account was touched. Reason: this machine has no Google Cloud access and no authenticated deployment tooling (details below). Everything that can be prepared without access is prepared and listed.

## 1. Access inspection (read-only, actual results of this session)
| Item | Result |
|---|---|
| `gcloud` CLI | not installed |
| Google Cloud authentication / active account / active project / billing / permissions | NOT AVAILABLE: no CLI, no application-default credentials, no `CLOUDSDK_*` or `GOOGLE_APPLICATION_CREDENTIALS` variable in the shell; the repository root holds Google Sheets/Drive service-account JSON files (gitignored). They were NOT used to attempt Cloud resource access (they are the application's Sheets/Drive identity, not an account with Compute Engine rights) |
| The project `daaraynorg-9165` | only inferred from the JSON file names (`daaraynorg-9165c-...`); the exact project id (the file names carry a hash suffix) and whether it is the intended project are UNVERIFIED |
| Existing VMs, disks, networks, firewall rules, regions, quotas | NOT INSPECTED |
| Docker | not installed locally (the container image could not be built or run here; the coordinator was tested as a plain Node process) |
| Domain and DNS | `daaraynorg.com`, `www.daaraynorg.com` and `limiter.daaraynorg.com` return NO address record (nslookup): the domain is not delegated to any host yet, and no certificate could be issued for a coordinator hostname. Domain registrar/DNS access: NOT AVAILABLE |
| Vercel function region (for latency) | the Preview built in D27 served from `iad1` (Washington DC; response header `x-vercel-id: bom1::iad1::...`: edge in Mumbai, function in iad1) |

## 2. Region, sizing and cost analysis (inputs verified where stated; prices are NOT quotes)
Workload: the coordinator handles one small HTTPS POST per Google request (at most a few per second at the configured budgets, about 45 reads plus 45 writes a minute), a few lease commands and an occasional `/metrics` read; one JSON file of under a few kilobytes is rewritten with fsync per request. CPU and memory needs are minimal.
| Choice | Recommendation | Basis |
|---|---|---|
| Region | `us-east1` (South Carolina) or `us-east4` (Northern Virginia), matched to the Vercel FUNCTION region (currently `iad1`); if the Vercel function region is ever moved (for example to Mumbai) move the coordinator with it. The coordinator adds one round trip to every Google request, so a 10 to 20 ms hop is negligible against Sheets latency while 200+ ms would be noticeable | `x-vercel-id` of the D27 Preview; Google's free-tier region list (us-west1, us-central1, us-east1) fetched in D27 |
| Machine | `e2-micro` (2 shared vCPU, 1 GB) is sufficient; `e2-small` if headroom for Docker and Caddy is wanted | workload above |
| Disk | a SEPARATE 10 GB `pd-standard` (state only; boot disk separate) | separate disk gives clean snapshot/restore |
| Static external IP | needed for a stable DNS record; Google has charged for external IPv4 addresses since 2024 | pricing page could not be retrieved in this session: NOT VERIFIED |
| Snapshots | daily, 7-day retention; a 10 GB disk with a few kilobytes of state produces tiny incremental snapshots | |
| Egress | well below 1 GB a month | |
| Monitoring | Cloud Monitoring uptime checks and basic VM metrics: free allowances apply, to be verified | |
Indicative monthly cost (to be confirmed in the Google Cloud pricing calculator by the owner BEFORE authorising): e2-micro VM and 30 GB standard disk may fall in the free tier in `us-east1` (the free-tier page lists one non-preemptible e2-micro per month in us-west1, us-central1 and us-east1, 30 GB-months of standard disk, 1 GB North America egress) but the free tier is per billing account and does not cover a static or in-use external IPv4 address, snapshots beyond the allowance or a second VM; plan for roughly 4 to 10 US dollars a month all-in until the calculator says otherwise. The domain registration and DNS hosting cost belong to whoever manages `daaraynorg.com`. This estimate is NOT a verified cost.

## 3. Topology prepared (files in `tools/limiter-server/deploy/`)
`docker-compose.yml` (coordinator read-only container, `restart: unless-stopped`, port published on 127.0.0.1 only, state volume `/var/lib/daarayn-limiter:/data`, capabilities dropped; Caddy in host network mode), `Caddyfile` (only `/`, `/health`, `/ready`, `/metrics` proxied; 8 KB body limit; Authorization header deleted from the access log; HSTS; no server banner), `install-vm.sh` (formats ONLY an empty disk, mounts by UUID with `nofail`, creates the root-only token file without printing it, never sets `LIMITER_ACCEPT_EMPTY_STATE`), `backup-state.sh` (snapshot with 7-day retention). None of it has been executed: no VM exists.

## 4. Exact remaining actions (owner)
1. Provide Google Cloud access: either install and authenticate `gcloud` on the operator machine (`gcloud auth login`, `gcloud config set project <id>`), or run the commands yourself from `docs/ops/D31_COORDINATOR_HOSTING_RUNBOOK.md`; confirm the project id and that billing is enabled.
2. Approve the cost (calculator result) and the region.
3. Create the DNS record for a hostname you control (for example `limiter.<your-domain>`) pointing at the static IP; DNS must resolve BEFORE Caddy starts.
4. Provide the alert recipient (section D31 monitoring report).
Until 1 to 3 are done the status of every hosting item stays NOT PROVISIONED.
