#!/usr/bin/env bash
set -euo pipefail
release="$1"
[[ "$release" =~ ^/opt/yanglao/releases/[a-zA-Z0-9._-]+$ ]] || exit 2
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq nginx ca-certificates curl xz-utils
if ! id yanglao >/dev/null 2>&1; then sudo useradd --system --home-dir /var/lib/yanglao --create-home --shell /usr/sbin/nologin yanglao; fi
sudo install -d -m 750 -o yanglao -g yanglao /var/lib/yanglao/data
if [[ ! -x /opt/yanglao/node/bin/node ]]; then
    cd /tmp
    curl -fsSLo yanglao-node-SHASUMS256.txt https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
    archive=$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ { print $2 }' yanglao-node-SHASUMS256.txt)
    [[ -n "$archive" && "$archive" != *$'\n'* ]]
    curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$archive"
    grep "  $archive$" yanglao-node-SHASUMS256.txt | sha256sum --check
    sudo install -d /opt/yanglao/node
    sudo tar -xJf "$archive" --strip-components=1 -C /opt/yanglao/node
fi
export PATH="/opt/yanglao/node/bin:$PATH"
cd "$release"
npm ci --include=dev --no-audit --no-fund
npm test
if [[ ! -e "$release/data" && ! -L "$release/data" ]]; then ln -s /var/lib/yanglao/data "$release/data"; fi
if ! sudo test -e /var/lib/yanglao/data/policies.sqlite; then
    sudo chown yanglao:yanglao baseline.json
    sudo -u yanglao env PATH="$PATH" node --import tsx deploy/import-baseline.ts
fi
sudo chown -R root:root "$release"
sudo chmod -R o-w "$release"
sudo ln -sfn "$release" /opt/yanglao/current
sudo install -m 644 deploy/yanglao.service /etc/systemd/system/yanglao.service
sudo install -m 644 deploy/yanglao-backup.service /etc/systemd/system/yanglao-backup.service
sudo install -m 644 deploy/yanglao-backup.timer /etc/systemd/system/yanglao-backup.timer
if sudo test -f /etc/letsencrypt/live/yanglao-ip/fullchain.pem; then
    sudo install -m 644 deploy/nginx-https.conf /etc/nginx/sites-available/default
else
    sudo install -m 644 deploy/nginx.conf /etc/nginx/sites-available/default
fi
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable yanglao nginx
sudo systemctl restart yanglao nginx
sudo systemctl enable --now yanglao-backup.timer
sudo systemctl start yanglao-backup.service
node --version
sudo systemctl is-active yanglao nginx
