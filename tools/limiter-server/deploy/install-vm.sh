#!/usr/bin/env bash
# Run ON the coordinator VM as root, once, AFTER the DNS record exists. Nothing here is executed by the repository tooling.
# Prerequisites: Debian/Ubuntu VM, a SEPARATE persistent disk attached with device name "limiter-state", Docker and the compose plugin installed.
set -euo pipefail

DISK=/dev/disk/by-id/google-limiter-state
MNT=/var/lib/daarayn-limiter

# 1. Format ONLY an empty disk, then mount it by UUID (nofail so a missing disk does not hang boot).
if ! blkid "$DISK" >/dev/null 2>&1; then
  echo "formatting empty disk"; mkfs.ext4 -m 0 -F "$DISK"
fi
mkdir -p "$MNT"
UUID=$(blkid -s UUID -o value "$DISK")
grep -q "$UUID" /etc/fstab || echo "UUID=$UUID $MNT ext4 discard,defaults,nofail 0 2" >> /etc/fstab
mount -a
# the container runs as uid 1000 (node); the state directory belongs to it, nobody else can read it
chown 1000:1000 "$MNT"; chmod 700 "$MNT"

# 2. The secret: generate once, root-only, never printed.
mkdir -p /opt/daarayn-limiter
if [ ! -f /opt/daarayn-limiter/limiter.env ]; then
  umask 077
  echo "LIMITER_TOKEN=$(openssl rand -base64 36 | tr -d '\n=+/')" > /opt/daarayn-limiter/limiter.env
  echo "token generated in /opt/daarayn-limiter/limiter.env (root only). Copy it to Vercel as GOOGLE_LIMITER_TOKEN through the Vercel dashboard or CLI; do not paste it anywhere else."
fi

# 3. Start. The very first start on an empty disk is quarantined for 75 s; to skip that once, run:
#    LIMITER_ACCEPT_EMPTY_STATE=true docker compose up -d     and afterwards:  docker compose up -d --force-recreate   (without the variable)
cd /opt/daarayn-limiter
docker compose up -d
sleep 5
curl -fsS http://127.0.0.1:8787/health && echo
echo "when DNS and TLS are ready:  curl -fsS https://<hostname>/health   and   curl -fsS https://<hostname>/ready"
