#!/usr/bin/env bash
#
# One-shot: add a Telnyx SIP gateway named "telnyx" to drachtio_mrf in mrf.xml (fixes INVALID_GATEWAY
# when you have 0 gateways). Run ON THE VM as a user who can sudo docker.
#
# Usage (pick one):
#   A) Preserve env through sudo:
#        export TELNYX_SIP_USERNAME='…' TELNYX_SIP_PASSWORD='…'
#        sudo -E bash freeswitch/patch-mrf-add-telnyx-gateway.sh
#   B) Inline (works without -E):
#        sudo TELNYX_SIP_USERNAME='…' TELNYX_SIP_PASSWORD='…' bash freeswitch/patch-mrf-add-telnyx-gateway.sh
#   C) Put exports in /opt/cortex_voice/telnyx-sip.env (chmod 600), then:
#        sudo bash freeswitch/patch-mrf-add-telnyx-gateway.sh
#      (script sources that file when vars are unset — plain sudo clears exports unless -E)
#
# Optional:
#   export FS_CONTAINER=freeswitch
#   export FS_ESL_PASSWORD=ClueCon
#   export TELNYX_ENV_FILE=/path/to/custom.env   # overrides default file path
#
set -euo pipefail

# sudo resets the environment by default, so exports from your shell are not visible unless you use
# sudo -E or pass vars on the command line. If still missing, load a root-readable env file.
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
CONF_IN="/usr/local/freeswitch/conf/sip_profiles/mrf.xml"
TMP="/tmp/mrf.xml.$$"

d() {
  if sudo docker ps >/dev/null 2>&1; then sudo docker "$@"
  else docker "$@"; fi
}

d cp "${CTR}:${CONF_IN}" "${TMP}"

export MRF_TMP="${TMP}"
export TELNYX_SIP_USERNAME TELNYX_SIP_PASSWORD
python3 <<'PY'
import os
import sys
import xml.etree.ElementTree as ET

path = os.environ["MRF_TMP"]
user = os.environ["TELNYX_SIP_USERNAME"]
pw = os.environ["TELNYX_SIP_PASSWORD"]


def local_tag(tag: str) -> str:
    return tag.split("}")[-1]


def find_drachtio_profile(root):
    for el in root.iter():
        if local_tag(el.tag) == "profile" and el.get("name") == "drachtio_mrf":
            return el
    return None


def ensure_gateways(profile: ET.Element) -> ET.Element:
    for child in list(profile):
        if local_tag(child.tag) == "gateways":
            return child
    gw_root = ET.Element("gateways")
    # Insert after <settings> (same sibling order FS expects: domains, settings, gateways, …)
    for i, child in enumerate(list(profile)):
        if local_tag(child.tag) == "settings":
            profile.insert(i + 1, gw_root)
            return gw_root
    profile.append(gw_root)
    return gw_root


def remove_telnyx(gateways_el: ET.Element) -> None:
    for child in list(gateways_el):
        if local_tag(child.tag) == "gateway" and child.get("name") == "telnyx":
            gateways_el.remove(child)


def add_telnyx_gateway(gateways_el: ET.Element) -> None:
    gw = ET.SubElement(gateways_el, "gateway", {"name": "telnyx"})
    params = [
        ("username", user),
        ("password", pw),
        ("realm", "sip.telnyx.com"),
        ("proxy", "sip.telnyx.com"),
        ("register-proxy", "sip.telnyx.com"),
        ("register-transport", "udp"),
        ("register", "true"),
        ("caller-id-in-from", "true"),
    ]
    for name, val in params:
        ET.SubElement(gw, "param", {"name": name, "value": val})


# Do NOT use string find("</settings>"): Drachtio mrf.xml has long <!-- --> blocks; a comment can
# contain the text "</settings>", so naive insertion puts <gateways> inside the comment. FS then
# loads 0 gateways while reloadxml still returns +OK.
try:
    tree = ET.parse(path)
except ET.ParseError as e:
    print(f"ERROR: mrf.xml is not valid XML ({e}). Restore from image or git and retry.", file=sys.stderr)
    sys.exit(1)

root = tree.getroot()
profile = find_drachtio_profile(root)
if profile is None:
    print('ERROR: no <profile name="drachtio_mrf"> in mrf.xml', file=sys.stderr)
    sys.exit(1)

gateways_el = ensure_gateways(profile)
remove_telnyx(gateways_el)
add_telnyx_gateway(gateways_el)

tree.write(path, encoding="utf-8", xml_declaration=True)
print("Patched mrf.xml (ElementTree: <gateways> under drachtio_mrf, not inside comments).")
PY

d cp "${TMP}" "${CTR}:${CONF_IN}"
rm -f "${TMP}"

cli() { d exec "${CTR}" fs_cli -H 127.0.0.1 -P 8021 -p "${ESL_PASS}" -x "$1"; }

echo "=== reloadxml (must not show -ERR) ==="
RX=$(cli "reloadxml" 2>&1 || true)
echo "${RX}"
if echo "${RX}" | grep -qi '\-ERR'; then
  echo "FAIL: reloadxml failed — mrf.xml may be invalid. Check container logs." >&2
  exit 1
fi

cli "sofia profile drachtio_mrf restart"
echo ""
echo "=== sofia status gateway (full list) — you MUST see Gateway telnyx ==="
GW_OUT=$(cli "sofia status gateway" 2>&1 || true)
echo "${GW_OUT}"
if ! echo "${GW_OUT}" | grep -q 'telnyx'; then
  echo ""
  echo "FAIL: gateway 'telnyx' still not listed. ESL dial string sofia/gateway/telnyx/... will return INVALID_GATEWAY." >&2
  echo "Check: docker exec ${CTR} grep -n telnyx ${CONF_IN}" >&2
  exit 1
fi

echo ""
echo "Next: ensure voice-service .env has SIP_GATEWAY_NAME=telnyx and SIP_CALLER_ID_E164=+your DID, then: pm2 restart cortex_voice"
