#!/usr/bin/env bash
# Daily snapshot of the coordinator state disk (run from a machine or Cloud Scheduler job with Compute Engine snapshot permission), plus a local copy.
# The state holds only quota timing, leases and fencing counters: a snapshot is safe to restore, but anything older than a minute can UNDER-count recent
# reservations, so after a restore start with a quarantine (do NOT set LIMITER_ACCEPT_EMPTY_STATE).
set -euo pipefail
ZONE="${ZONE:?set ZONE}"; DISK="${DISK:-daarayn-limiter-state}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
gcloud compute disks snapshot "$DISK" --zone "$ZONE" --snapshot-names "limiter-state-$STAMP" --description "Daarayn coordinator state (technical coordination data only)"
# retention: keep 7 days (a snapshot schedule policy is preferable: gcloud compute resource-policies create snapshot-schedule ...)
gcloud compute snapshots list --filter="name~^limiter-state- AND creationTimestamp<-P7D" --format="value(name)" | xargs -r -n1 gcloud compute snapshots delete --quiet
