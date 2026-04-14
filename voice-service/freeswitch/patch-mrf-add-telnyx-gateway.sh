#!/usr/bin/env bash
#
# Install Telnyx SIP trunk using the OFFICIAL FreeSWITCH pattern (Telnyx "Credentials Trunk" doc):
#   sip_profiles/external.xml  +  sip_profiles/external/*.xml
#
# The Drachtio MRF image only ships drachtio_mrf in mrf.xml. Embedded <gateways> there often show up as
# "0 gateways" in `sofia status gateway` (profile tuned for MRF media, not provider gateways). This script
# adds a separate Sofia profile "external" exactly like vanilla FreeSWITCH + Telnyx docs.
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
GW_XML="${CONF_DIR}/external/telnyx.xml"

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

# --- 2) Vanilla-style external profile (sip-port 5070 — avoids clashing with drachtio_mrf on 5080) ---
cat >"${WORKDIR}/external.xml" <<'XMLEOF'
<?xml version="1.0"?>
<profile name="external">
  <!-- Outbound provider gateways (Telnyx doc: sip_profiles/external/*.xml) -->
  <gateways>
    <X-PRE-PROCESS cmd="include" data="external/*.xml"/>
  </gateways>
  <domains>
    <domain name="all" alias="false" parse="true"/>
  </domains>
  <settings>
    <param name="sip-trace" value="no"/>
    <param name="sip-port" value="5070"/>
    <param name="context" value="public"/>
    <param name="dialplan" value="XML"/>
    <param name="rtp-ip" value="$${local_ip_v4}"/>
    <param name="sip-ip" value="$${local_ip_v4}"/>
    <param name="ext-rtp-ip" value="$${local_ip_v4}"/>
    <param name="ext-sip-ip" value="$${local_ip_v4}"/>
    <param name="auth-calls" value="false"/>
    <param name="rtp-timer-name" value="soft"/>
    <param name="codec-prefs" value="$${global_codec_prefs}"/>
    <param name="inbound-codec-negotiation" value="generous"/>
    <param name="manage-presence" value="false"/>
    <param name="tls" value="false"/>
  </settings>
</profile>
XMLEOF

d exec "${CTR}" mkdir -p "${CONF_DIR}/external"
d cp "${WORKDIR}/external.xml" "${CTR}:${EXT_XML}"

# --- 3) Telnyx gateway fragment (same shape as Telnyx Help Center example) ---
export GW_OUT="${WORKDIR}/telnyx.xml"
export TELNYX_SIP_USERNAME TELNYX_SIP_PASSWORD
python3 <<'PY'
import os
import xml.etree.ElementTree as ET

out = os.environ["GW_OUT"]
user = os.environ["TELNYX_SIP_USERNAME"]
pw = os.environ["TELNYX_SIP_PASSWORD"]

root = ET.Element("include")
gw = ET.SubElement(root, "gateway", {"name": "telnyx"})
params = [
    ("realm", "sip.telnyx.com"),
    ("username", user),
    ("password", pw),
    ("register", "true"),
    ("proxy", "sip.telnyx.com"),
]
for name, val in params:
    ET.SubElement(gw, "param", {"name": name, "value": val})

ET.ElementTree(root).write(out, encoding="utf-8", xml_declaration=True)
print(f"Wrote {out}")
PY

d cp "${WORKDIR}/telnyx.xml" "${CTR}:${GW_XML}"

# --- 4) Load configs ---
echo "=== reloadxml (must not show -ERR) ==="
RX=$(cli "reloadxml" 2>&1 || true)
echo "${RX}"
if echo "${RX}" | grep -qi '\-ERR'; then
  echo "FAIL: reloadxml reported an error." >&2
  exit 1
fi

echo "=== sofia profile external (load Telnyx gateway) ==="
# First time: start. Later runs: start may fail if already up — then restart.
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
