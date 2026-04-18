#!/usr/bin/env bash
# Run ON THE GCP VM. Stops safarov/freeswitch, starts drachtio/drachtio-freeswitch-mrf with external+Telnyx + mod_audio_fork.
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/cortex_voice/voice-service}"
VOICE_ENV="${VOICE_ENV:-$REPO_ROOT/.env}"
TELNYX_XML="${TELNYX_XML:-$HOME/freeswitch-config/telnyx.xml}"
EXTERNAL_SRC="${EXTERNAL_SRC:-$REPO_ROOT/freeswitch/drachtio/external.xml}"
DRACHTIO_EXT_DIR="${DRACHTIO_EXT_DIR:-$HOME/freeswitch-drachtio}"
EXTERNAL_XML="$DRACHTIO_EXT_DIR/external.xml"
IMAGE="${DRACHTIO_FS_IMAGE:-drachtio/drachtio-freeswitch-mrf:v1.10.1-full}"

if [[ ! -f "$EXTERNAL_SRC" ]]; then
  echo "Missing $EXTERNAL_SRC — git pull voice-service?" >&2
  exit 1
fi
if [[ ! -f "$TELNYX_XML" ]]; then
  echo "Missing $TELNYX_XML — run scripts/vm-apply-telnyx-gateway.sh first." >&2
  exit 1
fi

ESL_PASS="$(grep '^FREESWITCH_ESL_PASSWORD=' "$VOICE_ENV" 2>/dev/null | cut -d= -f2- || true)"
ESL_PASS="${ESL_PASS:-ClueCon}"

mkdir -p "$DRACHTIO_EXT_DIR"
cp -f "$EXTERNAL_SRC" "$EXTERNAL_XML"
chmod 644 "$EXTERNAL_XML"

echo "Stopping old FreeSWITCH container (if any)..."
docker stop freeswitch 2>/dev/null || true
docker rm freeswitch 2>/dev/null || true

echo "Starting $IMAGE (host network, external profile + Telnyx + shared TTS)..."
docker run -d --name freeswitch --restart unless-stopped --network host \
  -v "$EXTERNAL_XML:/usr/local/freeswitch/conf/sip_profiles/external.xml:ro" \
  -v "$TELNYX_XML:/usr/local/freeswitch/conf/sip_profiles/external/telnyx.xml:ro" \
  -v /opt/cortexflow/shared-tts:/opt/cortexflow/shared-tts \
  -e ESL_PASSWORD="$ESL_PASS" \
  "$IMAGE"

echo "Waiting for FreeSWITCH + ESL (can take 20–40s on first boot)..."
for _ in $(seq 1 45); do
  if docker exec freeswitch fs_cli -H 127.0.0.1 -P 8021 -p "$ESL_PASS" -x 'status' 2>/dev/null | grep -q 'FreeSWITCH.*is ready'; then
    break
  fi
  sleep 1
done

docker exec freeswitch fs_cli -H 127.0.0.1 -P 8021 -p "$ESL_PASS" -x 'reloadxml'
docker exec freeswitch fs_cli -H 127.0.0.1 -P 8021 -p "$ESL_PASS" -x 'sofia profile external rescan reload'
docker exec freeswitch fs_cli -H 127.0.0.1 -P 8021 -p "$ESL_PASS" -x 'module_exists mod_audio_fork'
echo "--- gateway telnyx ---"
docker exec freeswitch fs_cli -H 127.0.0.1 -P 8021 -p "$ESL_PASS" -x 'sofia status gateway telnyx'

echo "Done. Set AUDIO_INGRESS_WS_BASE=ws://127.0.0.1:5000 (host network). Restart: cd $REPO_ROOT && npm run build && pm2 restart cortex_voice --update-env"
