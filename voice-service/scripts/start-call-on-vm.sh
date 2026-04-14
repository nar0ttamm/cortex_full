#!/usr/bin/env bash
# POST /voice/start-call on localhost:5000. Run on the GCP VM.
# Example:
#   export TENANT_ID=... LEAD_ID=... PHONE='+1...'
#   cd /opt/cortex_voice/voice-service && bash scripts/start-call-on-vm.sh
set -euo pipefail
ROOT="${ROOT:-/opt/cortex_voice/voice-service}"
if [[ -z "${VOICE_SECRET:-}" && -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT}/.env"
  set +a
fi
: "${VOICE_SECRET:?export VOICE_SECRET or add to ${ROOT}/.env}"
: "${TENANT_ID:?}"
: "${LEAD_ID:?}"
: "${PHONE:?}"
NAME="${NAME:-Lead}"

curl -sS -X POST "http://127.0.0.1:5000/voice/start-call" \
  -H "Content-Type: application/json" \
  -H "x-voice-secret: ${VOICE_SECRET}" \
  -d "{\"tenant_id\":\"${TENANT_ID}\",\"lead_id\":\"${LEAD_ID}\",\"phone\":\"${PHONE}\",\"name\":\"${NAME}\"}"
echo
