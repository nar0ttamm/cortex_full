#!/usr/bin/env bash
# CortexFlow Pipecat Server — GCP deploy script
# Usage: bash deploy.sh
set -euo pipefail

REMOTE="cortexflowagent@34.180.6.84"
DEPLOY_DIR="/opt/cortex-pipecat"
SSH_KEY="$HOME/.ssh/id_ed25519"

echo "==> Syncing pipecat-server files to $REMOTE:$DEPLOY_DIR"
ssh -i "$SSH_KEY" "$REMOTE" "mkdir -p $DEPLOY_DIR"

rsync -avz --exclude='.env' --exclude='__pycache__' --exclude='*.pyc' \
  -e "ssh -i $SSH_KEY" \
  . "$REMOTE:$DEPLOY_DIR/"

echo "==> Installing Python dependencies on server"
ssh -i "$SSH_KEY" "$REMOTE" "
  cd $DEPLOY_DIR
  python3 -m venv venv 2>/dev/null || true
  source venv/bin/activate
  pip install --upgrade pip -q
  pip install -r requirements.txt -q
  echo 'Dependencies installed.'
"

echo "==> Checking .env exists"
ssh -i "$SSH_KEY" "$REMOTE" "
  if [ ! -f $DEPLOY_DIR/.env ]; then
    echo 'WARNING: $DEPLOY_DIR/.env does not exist! Copy .env.example and fill in values.'
    exit 1
  fi
  echo '.env found.'
"

echo "==> Stopping old voice-service PM2 process (if running)"
ssh -i "$SSH_KEY" "$REMOTE" "pm2 stop cortex-voice 2>/dev/null || true"

echo "==> Starting/restarting pipecat-server with PM2"
ssh -i "$SSH_KEY" "$REMOTE" "
  cd $DEPLOY_DIR
  source venv/bin/activate
  pm2 stop cortex-pipecat 2>/dev/null || true
  pm2 delete cortex-pipecat 2>/dev/null || true
  pm2 start 'venv/bin/python server.py' \
    --name cortex-pipecat \
    --cwd $DEPLOY_DIR \
    --no-autorestart \
    --max-restarts 5 \
    --restart-delay 3000
  pm2 save
"

echo "==> Checking health"
sleep 3
ssh -i "$SSH_KEY" "$REMOTE" "curl -s http://localhost:5000/health | python3 -m json.tool"

echo ""
echo "✓ Pipecat server deployed and running."
echo ""
echo "NEXT STEPS — Get these from your Telnyx portal:"
echo "  1. TELNYX_API_KEY        → Telnyx Portal → API Keys"
echo "  2. TELNYX_ACCOUNT_SID    → Telnyx Portal → Account Dashboard"
echo "  3. TELNYX_APPLICATION_SID → Call Control webhook https://34-180-6-84.nip.io/telnyx-webhook"
echo "  4. Fill in /opt/cortex_pipecat/.env and restart: pm2 restart cortex-pipecat"
