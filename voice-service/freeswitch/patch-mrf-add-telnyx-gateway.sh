#!/usr/bin/env bash
#
# One-shot: add a Telnyx SIP gateway named "telnyx" to drachtio_mrf in mrf.xml (fixes INVALID_GATEWAY
# when you have 0 gateways). Run ON THE VM as a user who can sudo docker.
#
# Usage:
#   export TELNYX_SIP_USERNAME='from Telnyx SIP connection'
#   export TELNYX_SIP_PASSWORD='from Telnyx SIP connection'
#   sudo bash patch-mrf-add-telnyx-gateway.sh
#
# Optional:
#   export FS_CONTAINER=freeswitch
#   export FS_ESL_PASSWORD=ClueCon
#
set -euo pipefail

: "${TELNYX_SIP_USERNAME:?Set TELNYX_SIP_USERNAME}"
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
from xml.sax.saxutils import escape

user = escape(os.environ["TELNYX_SIP_USERNAME"])
pw = escape(os.environ["TELNYX_SIP_PASSWORD"])
path = os.environ["MRF_TMP"]

content = open(path, encoding="utf-8").read()
if 'gateway name="telnyx"' in content:
    print("Already patched: telnyx gateway present in mrf.xml — nothing to do.")
    print("If `sofia status gateway` still does not list telnyx, delete that <gateways>...</gateways> block from mrf.xml and run this script again.")
    sys.exit(0)

# Insert after </settings> for profile drachtio_mrf only (first </settings> in file can be wrong profile).
profile_markers = (
    '<profile name="drachtio_mrf">',
    "<profile name='drachtio_mrf'>",
)
start = -1
for marker in profile_markers:
    start = content.find(marker)
    if start != -1:
        break
if start == -1:
    print("ERROR: no <profile name=\"drachtio_mrf\"> in mrf.xml", file=sys.stderr)
    sys.exit(1)

rest = content[start:]
idx_rel = rest.find("</settings>")
if idx_rel == -1:
    print("ERROR: no </settings> after drachtio_mrf profile in mrf.xml", file=sys.stderr)
    sys.exit(1)

idx = start + idx_rel
idx_end = idx + len("</settings>")

block = f"""    <gateways>
      <gateway name="telnyx">
        <param name="username" value="{user}"/>
        <param name="password" value="{pw}"/>
        <param name="realm" value="sip.telnyx.com"/>
        <param name="proxy" value="sip.telnyx.com"/>
        <param name="register" value="true"/>
      </gateway>
    </gateways>"""

newc = content[:idx_end] + "\n" + block + content[idx_end:]
open(path, "w", encoding="utf-8").write(newc)
print("Patched mrf.xml (inserted gateways after </settings>).")
PY

d cp "${TMP}" "${CTR}:${CONF_IN}"
rm -f "${TMP}"

cli() { d exec "${CTR}" fs_cli -H 127.0.0.1 -P 8021 -p "${ESL_PASS}" -x "$1"; }

cli "reloadxml"
cli "sofia profile drachtio_mrf restart"
echo ""
echo "=== sofia status gateway (all) — look for telnyx under drachtio_mrf ==="
cli "sofia status gateway"

echo ""
echo "Next: ensure voice-service .env has SIP_GATEWAY_NAME=telnyx and SIP_CALLER_ID_E164=+your DID, then: pm2 restart cortex_voice"
