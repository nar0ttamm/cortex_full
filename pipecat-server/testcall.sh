#!/usr/bin/env bash
# Fire a test outbound call and stream the logs while it runs.
set -euo pipefail
echo "--- INITIATING CALL ---"
curl -s -X POST http://localhost:5000/voice/start-call \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+917021433461","name":"Narottam","lead_id":"test-lead","tenant_id":"test-tenant","call_brief":{}}'
echo ""
echo "--- STREAMING LOGS (40s) ---"
timeout 40 pm2 logs cortex-pipecat --raw --lines 0 || true
