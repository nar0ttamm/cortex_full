#!/usr/bin/env bash
# Run ON the GCP VM (browser SSH). Hits cortex_voice on localhost:5000.
#
#   cd /opt/cortex_voice/voice-service && bash scripts/start-call-on-vm.sh
#
# Optional env overrides: TENANT_ID LEAD_ID PHONE NAME VOICE_SECRET
# If VOICE_SECRET is unset, sources .env from ROOT below.
#
set -euo pipefail
ROOT="${ROOT:-/opt/cortex_voice/voice-service}"
if [[ -z "${VOICE_SECRET:-}" && -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT}/.env"
  set +a
fi
: "${VOICE_SECRET:?export VOICE_SECRET or add to ${ROOT}/.env}"

TENANT_ID="${TENANT_ID:-b50750c7-0a91-4cd4-80fa-8921f974a8ec}"
LEAD_ID="${LEAD_ID:-d1b541c0-1340-468b-9197-d51d023d913b}"
PHONE="${PHONE:-+918450998830}"
NAME="${NAME:-Test}"

curl -sS -X POST "http://127.0.0.1:5000/voice/start-call" \
  -H "Content-Type: application/json" \
  -H "x-voice-secret: ${VOICE_SECRET}" \
  -d "{\"tenant_id\":\"${TENANT_ID}\",\"lead_id\":\"${LEAD_ID}\",\"phone\":\"${PHONE}\",\"name\":\"${NAME}\"}"
echo
