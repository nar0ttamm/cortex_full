#!/usr/bin/env bash
# Run on the voice VM. Checks: HTTP health, FreeSWITCH ESL, mod_audio_fork / uuid_audio_fork.
# Usage: bash scripts/verify-ai-stack.sh
# Optional: FREESWITCH_ESL_PASSWORD=xxx (default ClueCon)

set -euo pipefail

PASS="${FREESWITCH_ESL_PASSWORD:-ClueCon}"
ESL_PORT="${FREESWITCH_ESL_PORT:-8021}"
HTTP_PORT="${VOICE_HTTP_PORT:-5000}"

echo "=== 1) cortex_voice HTTP /health ==="
if curl -sf "http://127.0.0.1:${HTTP_PORT}/health" 2>/dev/null; then
  echo
else
  echo "FAIL: voice service not on :${HTTP_PORT}"
fi

echo ""
echo "=== 2) Find FreeSWITCH Docker container ==="
FS=""
for name in freeswitch fs_test; do
  if docker ps --format '{{.Names}}' | grep -qx "$name"; then
    FS=$name
    break
  fi
done
if [[ -z "${FS}" ]]; then
  echo "FAIL: no running container named freeswitch or fs_test"
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | head -20
  exit 1
fi
echo "OK: using container: ${FS}"

echo ""
echo "=== 3) ESL status (inside container) ==="
docker exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "status" 2>&1 | head -8

echo ""
echo "=== 4) mod_audio_fork (required for AI audio fork) ==="
MOD_OUT=$(docker exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "module_exists mod_audio_fork" 2>&1 || true)
echo "${MOD_OUT}"
if echo "${MOD_OUT}" | grep -qi 'true'; then
  echo "OK: mod_audio_fork is loaded"
else
  echo "FAIL: mod_audio_fork missing — AI stack cannot stream audio to Deepgram. Use a FreeSWITCH image that includes mod_audio_fork (see MANUAL_SETUP.md)."
  exit 1
fi

echo ""
echo "=== 5) uuid_audio_fork API ==="
docker exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "help uuid_audio_fork" 2>&1 | head -6

echo ""
echo "=== All checks passed (CLI). Place a real test call and: pm2 logs cortex_voice --lines 50 ==="
