#!/usr/bin/env bash
set -euo pipefail
release="$1"
expected="$2"
[[ "$release" =~ ^/opt/yanglao/releases/[a-zA-Z0-9._-]+$ ]] || exit 2
[[ "$(readlink -f /opt/yanglao/current)" == "$expected" ]] || { echo 'Current release changed; stop instead of overwriting concurrent work.'; exit 3; }
sudo test -f /var/lib/yanglao/data/policies.sqlite
export PATH="/opt/yanglao/node/bin:$PATH"
cd "$release"
npm ci --include=dev --no-audit --no-fund
npm test
[[ "$(readlink -f /opt/yanglao/current)" == "$expected" ]] || { echo 'Current release changed during tests; abort.'; exit 3; }
sudo systemctl start yanglao-backup.service
ln -s /var/lib/yanglao/data "$release/data"
sudo chown -R root:root "$release"
sudo chmod -R o-w "$release"
sudo ln -sfn "$release" /opt/yanglao/current
sudo systemctl restart yanglao
for n in $(seq 1 15); do
  if curl --fail --silent http://127.0.0.1:3210/api/health | grep -q '"engine":"1.3.0"'; then
    echo 'City coverage 1.3.0 is healthy.'
    sudo systemctl is-active yanglao nginx snap.certbot.renew.timer yanglao-backup.timer
    exit 0
  fi
  sleep 1
done
sudo ln -sfn "$expected" /opt/yanglao/current
sudo systemctl restart yanglao
echo 'Health verification failed; previous application release restored. Database backup retained.'
exit 4
