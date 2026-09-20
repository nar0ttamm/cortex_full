#!/usr/bin/env bash
# Update the Telnyx Call Control Application webhook to the new domain.
set -euo pipefail
set -a; . /opt/cortex-pipecat/.env; set +a

NEW_WEBHOOK="https://${SERVER_DOMAIN}/telnyx-webhook"
echo "CC_APP_ID=${TELNYX_CC_APP_ID}"
echo "NEW_WEBHOOK=${NEW_WEBHOOK}"

echo "--- BEFORE ---"
curl -s "https://api.telnyx.com/v2/call_control_applications/${TELNYX_CC_APP_ID}" \
  -H "Authorization: Bearer ${TELNYX_API_KEY}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d.get("data",{});print("name=",a.get("application_name"));print("webhook=",a.get("webhook_event_url"))' 2>/dev/null \
  || echo "GET failed / not a call_control_application"

echo "--- PATCH ---"
curl -s -X PATCH "https://api.telnyx.com/v2/call_control_applications/${TELNYX_CC_APP_ID}" \
  -H "Authorization: Bearer ${TELNYX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"webhook_event_url\":\"${NEW_WEBHOOK}\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);a=d.get("data",{});e=d.get("errors");print("OK webhook=",a.get("webhook_event_url")) if a else print("ERROR:",e)' 2>/dev/null \
  || echo "PATCH failed"
