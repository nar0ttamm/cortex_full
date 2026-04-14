#!/usr/bin/env bash
# Run on the voice VM. Checks: HTTP health, FreeSWITCH ESL, mod_audio_fork / uuid_audio_fork.
# Usage: bash scripts/verify-ai-stack.sh
# Docker: if you see "permission denied" on docker.sock, either:
#   sudo usermod -aG docker "$USER" && newgrp docker
#   or:  sudo bash scripts/verify-ai-stack.sh

set -uo pipefail

PASS="${FREESWITCH_ESL_PASSWORD:-ClueCon}"
ESL_PORT="${FREESWITCH_ESL_PORT:-8021}"
HTTP_PORT="${VOICE_HTTP_PORT:-5000}"

d() {
  if docker ps >/dev/null 2>&1; then
    docker "$@"
  elif sudo docker ps >/dev/null 2>&1; then
    sudo docker "$@"
  else
    echo "FAIL: cannot use docker or sudo docker" >&2
    exit 1
  fi
}

echo "=== 1) cortex_voice HTTP /health (port ${HTTP_PORT}) ==="
OK=0
for _ in {1..15}; do
  if curl -sf "http://127.0.0.1:${HTTP_PORT}/health" >/dev/null; then
    curl -sf "http://127.0.0.1:${HTTP_PORT}/health"
    echo
    OK=1
    break
  fi
  sleep 1
done
if [[ "${OK}" -ne 1 ]]; then
  echo "FAIL: no HTTP response on :${HTTP_PORT}"
  echo "Hint: ss -tlnp | grep ${HTTP_PORT}  ;  pm2 logs cortex_voice --lines 40"
  exit 1
fi

echo ""
echo "=== 2) Find FreeSWITCH Docker container ==="
FS=""
for name in freeswitch fs_test; do
  if d ps --format '{{.Names}}' 2>/dev/null | grep -qx "$name"; then
    FS=$name
    break
  fi
done
if [[ -z "${FS}" ]]; then
  echo "FAIL: no running container named freeswitch or fs_test"
  d ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>/dev/null | head -20 || true
  exit 1
fi
echo "OK: using container: ${FS}"

echo ""
echo "=== 3) ESL status (inside container) ==="
d exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "status" 2>&1 | head -8

echo ""
echo "=== 4) mod_audio_fork (required for AI audio fork) ==="
MOD_OUT=$(d exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "module_exists mod_audio_fork" 2>&1 || true)
echo "${MOD_OUT}"
if echo "${MOD_OUT}" | grep -qi 'true'; then
  echo "OK: mod_audio_fork is loaded"
else
  echo "FAIL: mod_audio_fork missing — AI stack cannot stream audio to Deepgram. See MANUAL_SETUP.md (Docker image)."
  exit 1
fi

echo ""
echo "=== 5) uuid_audio_fork API ==="
d exec "${FS}" fs_cli -H 127.0.0.1 -P "${ESL_PORT}" -p "${PASS}" -x "help uuid_audio_fork" 2>&1 | head -6

echo ""
echo "=== All checks passed (CLI). Place a real test call, then: pm2 logs cortex_voice --lines 50 ==="
