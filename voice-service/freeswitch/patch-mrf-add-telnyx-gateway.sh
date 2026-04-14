#!/usr/bin/env bash
#
# Install Telnyx SIP trunk: adds sip_profiles/external.xml with profile "external" and an INLINE <gateway>.
#
# Why not sip_profiles/external/*.xml like Telnyx’s doc? On many installs, X-PRE-PROCESS data="external/*.xml"
# resolves from conf/ (→ conf/external/) NOT sip_profiles/external/, so includes silently add zero gateways.
# Inlining avoids include path bugs entirely.
#
# Drachtio ships only drachtio_mrf in mrf.xml; we strip any <gateways> from mrf to avoid duplicate name "telnyx".
#
# Usage (pick one):
#   A) sudo -E bash freeswitch/patch-mrf-add-telnyx-gateway.sh
#   B) sudo TELNYX_SIP_USERNAME='…' TELNYX_SIP_PASSWORD='…' bash freeswitch/patch-mrf-add-telnyx-gateway.sh
#   C) Credentials in /opt/cortex_voice/telnyx-sip.env (chmod 600), then: sudo bash …
#
# Optional: FS_CONTAINER=freeswitch  FS_ESL_PASSWORD=ClueCon  TELNYX_ENV_FILE=…
#
set -euo pipefail

if [[ -z "${TELNYX_SIP_USERNAME:-}" || -z "${TELNYX_SIP_PASSWORD:-}" ]]; then
  ENV_FILE="${TELNYX_ENV_FILE:-/opt/cortex_voice/telnyx-sip.env}"
  if [[ -f "${ENV_FILE}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    set +a
  fi
fi

: "${TELNYX_SIP_USERNAME:?Set TELNYX_SIP_USERNAME (or use sudo -E, or ${TELNYX_ENV_FILE:-/opt/cortex_voice/telnyx-sip.env})}"
: "${TELNYX_SIP_PASSWORD:?Set TELNYX_SIP_PASSWORD}"

CTR="${FS_CONTAINER:-freeswitch}"
ESL_PASS="${FS_ESL_PASSWORD:-ClueCon}"
CONF_DIR="/usr/local/freeswitch/conf/sip_profiles"
MRF_XML="${CONF_DIR}/mrf.xml"
EXT_XML="${CONF_DIR}/external.xml"

d() {
  if sudo docker ps >/dev/null 2>&1; then sudo docker "$@"
  else docker "$@"; fi
}

cli() { d exec "${CTR}" fs_cli -H 127.0.0.1 -P 8021 -p "${ESL_PASS}" -x "$1"; }

WORKDIR="/tmp/telnyx-fs-$$"
mkdir -p "${WORKDIR}"
trap 'rm -rf "${WORKDIR}"' EXIT

# --- 1) Remove any <gateways> block from drachtio_mrf in mrf.xml (avoid duplicate gateway name "telnyx") ---
d cp "${CTR}:${MRF_XML}" "${WORKDIR}/mrf.xml"

export MRF_CLEAN="${WORKDIR}/mrf.xml"

python3 <<'PY'
import os
import sys
import xml.etree.ElementTree as ET

path = os.environ["MRF_CLEAN"]

def local_tag(tag):
    return tag.split("}")[-1]

def find_profile(root):
    for el in root.iter():
        if local_tag(el.tag) == "profile" and el.get("name") == "drachtio_mrf":
            return el
    return None

try:
    tree = ET.parse(path)
except ET.ParseError as e:
    print(f"ERROR: mrf.xml invalid XML ({e})", file=sys.stderr)
    sys.exit(1)

root = tree.getroot()
profile = find_profile(root)
if profile is None:
    print("WARN: no drachtio_mrf profile in mrf.xml — skipping mrf cleanup", file=sys.stderr)
else:
    for child in list(profile):
        if local_tag(child.tag) == "gateways":
            profile.remove(child)
            print("Removed <gateways> from drachtio_mrf (use external profile for Telnyx).")

tree.write(path, encoding="utf-8", xml_declaration=True)
PY

d cp "${WORKDIR}/mrf.xml" "${CTR}:${MRF_XML}"

# --- 2) external.xml: <include><profile>…</profile></include> (same root pattern as mrf.xml) + INLINE gateway ---
export EXT_OUT="${WORKDIR}/external.xml"
export TELNYX_SIP_USERNAME TELNYX_SIP_PASSWORD
python3 <<'PY'
import os
import xml.etree.ElementTree as ET

user = os.environ["TELNYX_SIP_USERNAME"]
pw = os.environ["TELNYX_SIP_PASSWORD"]
out = os.environ["EXT_OUT"]

root = ET.Element("include")
profile = ET.SubElement(root, "profile", {"name": "external"})

gateways = ET.SubElement(profile, "gateways")
gw = ET.SubElement(gateways, "gateway", {"name": "telnyx"})
for name, val in [
    ("realm", "sip.telnyx.com"),
    ("username", user),
    ("password", pw),
    ("register", "true"),
    ("proxy", "sip.telnyx.com"),
    ("register-proxy", "sip.telnyx.com"),
    ("register-transport", "udp"),
    ("caller-id-in-from", "true"),
]:
    ET.SubElement(gw, "param", {"name": name, "value": val})

domains = ET.SubElement(profile, "domains")
ET.SubElement(domains, "domain", {"name": "all", "alias": "false", "parse": "true"})

settings = ET.SubElement(profile, "settings")
for name, val in [
    ("sip-trace", "no"),
    ("sip-port", "5070"),
    ("context", "public"),
    ("dialplan", "XML"),
    ("rtp-ip", "$${local_ip_v4}"),
    ("sip-ip", "$${local_ip_v4}"),
    ("ext-rtp-ip", "$${local_ip_v4}"),
    ("ext-sip-ip", "$${local_ip_v4}"),
    ("auth-calls", "false"),
    ("rtp-timer-name", "soft"),
    ("codec-prefs", "$${global_codec_prefs}"),
    ("inbound-codec-negotiation", "generous"),
    ("manage-presence", "false"),
    ("tls", "false"),
]:
    ET.SubElement(settings, "param", {"name": name, "value": val})

ET.ElementTree(root).write(out, encoding="utf-8", xml_declaration=True)
print(f"Wrote {out} (inline telnyx gateway, no X-PRE-PROCESS include)")
PY

# Remove stale split-file layout so old includes cannot confuse anyone
d exec "${CTR}" rm -f "${CONF_DIR}/external/telnyx.xml" 2>/dev/null || true
d cp "${WORKDIR}/external.xml" "${CTR}:${EXT_XML}"

# --- 3) Load configs ---
echo "=== reloadxml (must not show -ERR) ==="
RX=$(cli "reloadxml" 2>&1 || true)
echo "${RX}"
if echo "${RX}" | grep -qi '\-ERR'; then
  echo "FAIL: reloadxml reported an error." >&2
  exit 1
fi

echo "=== reload mod_sofia (pick up sip_profiles/*.xml) ==="
cli "reload mod_sofia" 2>&1 || true

echo "=== sofia profile external (load Telnyx gateway) ==="
cli "sofia profile external stop" 2>&1 || true
if ! cli "sofia profile external start" 2>&1; then
  cli "sofia profile external restart" 2>&1 || true
fi
cli "sofia profile drachtio_mrf restart" 2>&1 || true
cli "sofia profile external rescan reload" 2>&1 || true

echo ""
echo "=== sofia status profile (expect external + drachtio_mrf) ==="
cli "sofia status profile" 2>&1 | head -40

echo ""
echo "=== sofia status gateway — must list Gateway telnyx ==="
GW_OUT=$(cli "sofia status gateway" 2>&1 || true)
echo "${GW_OUT}"
if ! echo "${GW_OUT}" | grep -qi 'telnyx'; then
  echo "" >&2
  echo "FAIL: gateway 'telnyx' not loaded. Check:" >&2
  echo "  sudo docker exec ${CTR} grep -R telnyx ${CONF_DIR}" >&2
  echo "  sudo docker exec ${CTR} fs_cli -x 'console loglevel debug'" >&2
  echo "  sudo docker logs ${CTR} 2>&1 | tail -80" >&2
  exit 1
fi

echo ""
echo "OK: Telnyx gateway is registered with Sofia. Set SIP_GATEWAY_NAME=telnyx and SIP_CALLER_ID_E164=+your DID in voice-service .env, then: pm2 restart cortex_voice"
