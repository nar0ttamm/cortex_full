#!/usr/bin/env bash
# Idempotent first-boot for cortex-pipecat on the new GCP VM.
set -euo pipefail

DOMAIN="${DOMAIN:-34-180-6-84.nip.io}"
CERT_EMAIL="${CERT_EMAIL:-cortexflowagent@gmail.com}"
DEPLOY_DIR="/opt/cortex-pipecat"

echo "==> [1/6] Packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y \
  python3 python3-venv python3-pip python3-dev build-essential \
  nginx certbot python3-certbot-nginx ffmpeg curl ca-certificates

echo "==> [2/6] nginx for $DOMAIN"
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

echo "==> [3/6] TLS"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect
else
  echo "    cert already exists"
fi

echo "==> [4/6] Python venv + deps (this takes a while)"
cd "$DEPLOY_DIR"
chmod 600 .env 2>/dev/null || true
python3 -m venv venv
./venv/bin/pip install --upgrade pip setuptools wheel
./venv/bin/pip install -r requirements.txt

echo "==> [5/6] PM2"
pm2 delete cortex-pipecat 2>/dev/null || true
pm2 start "$DEPLOY_DIR/venv/bin/python" \
  --name cortex-pipecat \
  --cwd "$DEPLOY_DIR" \
  -- server.py
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u cortexflowagent --hp /home/cortexflowagent >/dev/null 2>&1 || true

echo "==> [6/6] Health"
sleep 5
curl -sS http://127.0.0.1:5000/health || true
echo
pm2 ls
df -h / | tail -1
echo "PROVISION_DONE"
