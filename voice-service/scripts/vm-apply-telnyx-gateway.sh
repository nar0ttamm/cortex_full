#!/usr/bin/env bash
# Run ON THE GCP VM (as cortexflowagent). Sources telnyx-sip.env, writes gateway XML, recreates safarov/freeswitch.
set -euo pipefail

ENV_FILE="${TELNYX_ENV_FILE:-/opt/cortex_voice/telnyx-sip.env}"
VOICE_ENV="${VOICE_ENV:-/opt/cortex_voice/voice-service/.env}"
OUT_XML="${OUT_XML:-$HOME/freeswitch-config/telnyx.xml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

ESL_PASS="$(grep '^FREESWITCH_ESL_PASSWORD=' "$VOICE_ENV" 2>/dev/null | cut -d= -f2- || true)"
ESL_PASS="${ESL_PASS:-ClueCon}"

mkdir -p "$(dirname "$OUT_XML")"
cat >"$OUT_XML" <<EOF
<include>
  <gateway name="telnyx">
    <param name="username" value="${TELNYX_SIP_USERNAME}"/>
    <param name="password" value="${TELNYX_SIP_PASSWORD}"/>
    <param name="realm" value="sip.telnyx.com"/>
    <param name="proxy" value="sip.telnyx.com"/>
    <param name="register" value="true"/>
    <param name="register-transport" value="udp"/>
    <param name="caller-id-in-from" value="true"/>
  </gateway>
</include>
EOF
chmod 600 "$OUT_XML"

echo "Wrote $OUT_XML (mode 600)"

docker stop freeswitch 2>/dev/null || true
docker rm freeswitch 2>/dev/null || true

docker run -d --name freeswitch --restart unless-stopped --network host \
  -v "$OUT_XML:/etc/freeswitch/sip_profiles/external/telnyx.xml:ro" \
  -v /opt/cortexflow/shared-tts:/opt/cortexflow/shared-tts \
  -e ESL_PASSWORD="$ESL_PASS" \
  safarov/freeswitch

echo "Waiting for FreeSWITCH..."
sleep 10

docker exec freeswitch fs_cli -x 'reloadxml'
docker exec freeswitch fs_cli -x 'sofia profile external rescan reload'
docker exec freeswitch fs_cli -x 'sofia status gateway telnyx'
