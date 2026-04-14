#!/usr/bin/env bash
#
# Telnyx trunk: sip_profiles/external.xml with INLINE <gateway name="telnyx"> (no X-PRE-PROCESS include).
# Root element is <profile> (vanilla FreeSWITCH external.xml shape). Drachtio mrf.xml uses <include><profile>;
# for "external", <profile> root matches stock SignalWire external.xml and avoids Invalid Profile on some builds.
#
# Usage: sudo -E bash …  OR  telnyx-sip.env + sudo bash …  (see env vars at top of script)
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

: "${TELNYX_SIP_USERNAME:?Set TELNYX_SIP_USERNAME}"
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

# --- 1) Strip <gateways> from drachtio_mrf (avoid duplicate gateway name) ---
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
    print("WARN: no drachtio_mrf in mrf.xml — skipping mrf cleanup", file=sys.stderr)
else:
    for child in list(profile):
        if local_tag(child.tag) == "gateways":
            profile.remove(child)
            print("Removed <gateways> from drachtio_mrf.")

tree.write(path, encoding="utf-8", xml_declaration=True)
PY

d cp "${WORKDIR}/mrf.xml" "${CTR}:${MRF_XML}"

# --- 2) external.xml: <profile> root + vanilla-style params (NOT "codec-prefs" — that rejects the profile) ---
export EXT_OUT="${WORKDIR}/external.xml"
export TELNYX_SIP_USERNAME TELNYX_SIP_PASSWORD
python3 <<'PY'
import os
import xml.etree.ElementTree as ET

user = os.environ["TELNYX_SIP_USERNAME"]
pw = os.environ["TELNYX_SIP_PASSWORD"]
out = os.environ["EXT_OUT"]

# Root = <profile> like conf/vanilla/sip_profiles/external.xml (NOT wrapped in <include>).
profile = ET.Element("profile", {"name": "external"})

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

ET.SubElement(profile, "aliases")
domains = ET.SubElement(profile, "domains")
ET.SubElement(domains, "domain", {"name": "all", "alias": "false", "parse": "true"})

settings = ET.SubElement(profile, "settings")
# Match vanilla external.xml param names (codec-prefs alone is NOT valid for a Sofia profile).
params = [
    ("debug", "0"),
    ("sip-trace", "no"),
    ("sip-port", "5070"),
    ("dialplan", "XML"),
    ("context", "public"),
    ("dtmf-duration", "2000"),
    ("inbound-codec-prefs", "$${global_codec_prefs}"),
    ("outbound-codec-prefs", "$${global_codec_prefs}"),
    ("rtp-timer-name", "soft"),
    ("local-network-acl", "localnet.auto"),
    ("manage-presence", "false"),
    ("nonce-ttl", "60"),
    ("auth-calls", "false"),
    ("inbound-late-negotiation", "true"),
    ("inbound-codec-negotiation", "generous"),
    ("rtp-ip", "$${local_ip_v4}"),
    ("sip-ip", "$${local_ip_v4}"),
    ("ext-rtp-ip", "$${local_ip_v4}"),
    ("ext-sip-ip", "$${local_ip_v4}"),
    ("rtp-timeout-sec", "300"),
    ("rtp-hold-timeout-sec", "1800"),
    ("tls", "false"),
]
for name, val in params:
    ET.SubElement(settings, "param", {"name": name, "value": val})

ET.ElementTree(profile).write(out, encoding="utf-8", xml_declaration=True)
print(f"Wrote {out}")
PY

d exec "${CTR}" rm -f "${CONF_DIR}/external/telnyx.xml" 2>/dev/null || true
d cp "${WORKDIR}/external.xml" "${CTR}:${EXT_XML}"

echo "=== reloadxml ==="
RX=$(cli "reloadxml" 2>&1 || true)
echo "${RX}"
if echo "${RX}" | grep -qi '\-ERR'; then
  echo "FAIL: reloadxml" >&2
  exit 1
fi

# Do NOT "reload mod_sofia" here — it resets all profiles and triggers drachtio_mrf timing guards.
sleep 2

echo "=== sofia profile external (stop if any, then start) ==="
cli "sofia profile external stop" 2>&1 || true
sleep 1
if ! cli "sofia profile external start" 2>&1; then
  echo "start failed, trying restart…"
  cli "sofia profile external restart" 2>&1 || true
fi
cli "sofia profile external rescan reload" 2>&1 || true

# Do NOT restart drachtio_mrf in this script — it caused "must be up 10 seconds" and can mark external invalid.

echo ""
echo "=== sofia status profile ==="
cli "sofia status profile" 2>&1 | head -45

echo ""
echo "=== sofia status gateway (expect telnyx) ==="
GW_OUT=$(cli "sofia status gateway" 2>&1 || true)
echo "${GW_OUT}"
if ! echo "${GW_OUT}" | grep -qi 'telnyx'; then
  echo "" >&2
  echo "FAIL: gateway telnyx not listed." >&2
  echo "If outbound_codec_prefs is unset, set in vars.xml or use:" >&2
  echo "  fs_cli -x 'global_setvar outbound_codec_prefs PCMU,PCMA'" >&2
  exit 1
fi

echo ""
echo "OK. Set SIP_GATEWAY_NAME=telnyx and SIP_CALLER_ID_E164 in .env, then: pm2 restart cortex_voice"
