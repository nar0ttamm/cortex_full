#!/usr/bin/env bash
# CortexFlow Pipecat Server — full VM provisioning (Ubuntu 22.04)
# Idempotent: safe to re-run. Run as the deploy user (passwordless sudo expected).
set -euo pipefail

DOMAIN="${DOMAIN:-34-180-6-84.nip.io}"
CERT_EMAIL="${CERT_EMAIL:-cortexflowagent@gmail.com}"
DEPLOY_DIR="/opt/cortex-pipecat"
APP_USER="$(whoami)"

echo "==> [1/7] System packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y \
  python3 python3-venv python3-pip python3-dev build-essential \
  nginx certbot python3-certbot-nginx \
  git curl ca-certificates ffmpeg

echo "==> [2/7] Node.js 20 + PM2"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2@latest >/dev/null 2>&1 || sudo npm install -g pm2@latest

echo "==> [3/7] Deploy dir $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo chown -R "$APP_USER":"$APP_USER" "$DEPLOY_DIR"

echo "==> [4/7] nginx site for $DOMAIN"
sudo tee /etc/nginx/sites-available/cortex-pipecat >/dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/cortex-pipecat /etc/nginx/sites-enabled/cortex-pipecat
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> [5/7] TLS cert via certbot for $DOMAIN"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
else
  echo "    cert already exists, skipping"
fi

echo "==> [6/7] Disk-safety hardening (prevents the full-disk crash from recurring)"
# PM2 log rotation: cap logs, rotate daily, keep 7
pm2 install pm2-logrotate >/dev/null 2>&1 || true
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
# Cap systemd journal to 200M
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/size.conf >/dev/null <<'JRNL'
[Journal]
SystemMaxUse=200M
SystemMaxFileSize=50M
JRNL
sudo systemctl restart systemd-journald || true
# Weekly apt cache cleanup
sudo tee /etc/cron.weekly/cortex-cleanup >/dev/null <<'CRON'
#!/bin/sh
apt-get clean
journalctl --vacuum-size=200M
find /opt/cortex_pipecat -name '*.pyc' -delete 2>/dev/null
CRON
sudo chmod +x /etc/cron.weekly/cortex-cleanup

echo "==> [7/7] PM2 startup on boot"
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "$HOME" >/dev/null 2>&1 || true

echo ""
echo "✓ Base provisioning complete for $DOMAIN"
df -h / | tail -1
