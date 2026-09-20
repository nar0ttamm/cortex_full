#!/usr/bin/env bash
set -euo pipefail

echo "=== [1/8] System packages ==="
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq \
  build-essential git curl wget unzip \
  python3 python3-pip python3-venv \
  nginx certbot python3-certbot-nginx \
  jq htop logrotate

echo "=== [2/8] Node.js 20 LTS ==="
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "Node: $(node -v) | npm: $(npm -v)"

echo "=== [3/8] PM2 ==="
if ! command -v pm2 &>/dev/null; then
  sudo npm install -g pm2
fi
pm2 --version

echo "=== [4/8] Deploy directory ==="
sudo mkdir -p /opt/cortex-pipecat
sudo chown cortexflowagent:cortexflowagent /opt/cortex-pipecat

echo "=== [5/8] Swap (1GB) ==="
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
echo "Swap: $(free -h | grep Swap)"

echo "=== [6/8] Disk-safety: journal + logrotate ==="
sudo mkdir -p /etc/systemd/journald.conf.d
cat <<'JCONF' | sudo tee /etc/systemd/journald.conf.d/size-cap.conf
[Journal]
SystemMaxUse=200M
SystemKeepFree=2G
JCONF
sudo systemctl restart systemd-journald

cat <<'LROT' | sudo tee /etc/logrotate.d/cortex-pipecat
/opt/cortex-pipecat/logs/*.log {
    daily
    missingok
    rotate 3
    compress
    delaycompress
    notifempty
    copytruncate
    maxsize 50M
}
LROT

echo "=== [7/8] Nginx base config ==="
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== [8/8] PM2 startup ==="
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u cortexflowagent --hp /home/cortexflowagent 2>/dev/null || true

echo ""
echo "=== PROVISION COMPLETE ==="
echo "Python: $(python3 --version)"
echo "Node:   $(node -v)"
echo "npm:    $(npm -v)"
echo "PM2:    $(pm2 --version)"
echo "Nginx:  $(nginx -v 2>&1)"
echo "Disk:   $(df -h / | tail -1)"
