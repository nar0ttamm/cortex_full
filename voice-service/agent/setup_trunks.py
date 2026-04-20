#!/usr/bin/env python3
"""
One-time setup: Create the Telnyx SIP outbound trunk in LiveKit SIP server.
Run after livekit-server + livekit-sip are both healthy.
Saves the trunk ID to /opt/cortex/agent/.trunk_id for use by the call API.
"""
import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

LK_URL = os.getenv("LIVEKIT_URL", "http://localhost:7880")
API_KEY = os.getenv("LIVEKIT_API_KEY", "")
API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")


async def main() -> None:
    from livekit import api  # livekit-api package

    http_url = LK_URL.replace("ws://", "http://").replace("wss://", "https://")
    lk = api.LiveKitAPI(url=http_url, api_key=API_KEY, api_secret=API_SECRET)

    # List existing outbound trunks
    list_req = api.ListSIPOutboundTrunkRequest()
    trunks_resp = await lk.sip.list_sip_outbound_trunk(list_req)
    trunks = list(trunks_resp.items) if hasattr(trunks_resp, "items") else []

    existing = [t for t in trunks if t.name == "telnyx-cortex"]

    if existing:
        trunk_id = existing[0].sip_trunk_id
        print(f"[setup] Existing Telnyx trunk found: {trunk_id}")
    else:
        trunk_info = api.SIPOutboundTrunkInfo(
            name="telnyx-cortex",
            address="sip.telnyx.com",
            numbers=["+14355009976"],
            auth_username="usercortexflowagent15719",
            auth_password="UQMR_6Rh5n,I",
        )
        create_req = api.CreateSIPOutboundTrunkRequest(trunk=trunk_info)
        trunk = await lk.sip.create_sip_outbound_trunk(create_req)
        trunk_id = trunk.sip_trunk_id
        print(f"[setup] Created Telnyx outbound trunk: {trunk_id}")

    # Persist trunk ID
    trunk_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".trunk_id")
    with open(trunk_file, "w") as f:
        f.write(trunk_id)
    print(f"[setup] Trunk ID saved to {trunk_file}")
    print(f"\nSet this environment variable:\n  LIVEKIT_SIP_TRUNK_ID={trunk_id}")

    await lk.aclose()


if __name__ == "__main__":
    asyncio.run(main())
