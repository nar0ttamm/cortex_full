#!/usr/bin/env python3
"""Update Telnyx trunk to use the correct SIP port (5090)."""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

LK_URL = os.getenv("LIVEKIT_URL", "http://localhost:7880")
API_KEY = os.getenv("LIVEKIT_API_KEY", "")
API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
TRUNK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".trunk_id")


async def main() -> None:
    from livekit import api

    trunk_id = ""
    if os.path.exists(TRUNK_FILE):
        with open(TRUNK_FILE) as f:
            trunk_id = f.read().strip()

    http_url = LK_URL.replace("ws://", "http://").replace("wss://", "https://")
    lk = api.LiveKitAPI(url=http_url, api_key=API_KEY, api_secret=API_SECRET)

    # Delete old trunk and recreate with transport auto (Telnyx handles port routing)
    if trunk_id:
        try:
            await lk.sip.delete_sip_trunk(api.DeleteSIPTrunkRequest(sip_trunk_id=trunk_id))
            print(f"[update] Deleted old trunk {trunk_id}")
        except Exception as e:
            print(f"[update] Could not delete old trunk: {e}")

    # Create fresh outbound trunk with explicit port
    trunk_info = api.SIPOutboundTrunkInfo(
        name="telnyx-cortex",
        address="sip.telnyx.com:5060",  # Telnyx standard SIP port
        numbers=["+14355009976"],
        auth_username="usercortexflowagent15719",
        auth_password="UQMR_6Rh5n,I",
        transport=api.SIPTransport.SIP_TRANSPORT_UDP,
    )
    trunk = await lk.sip.create_sip_outbound_trunk(
        api.CreateSIPOutboundTrunkRequest(trunk=trunk_info)
    )
    new_trunk_id = trunk.sip_trunk_id
    print(f"[update] Created trunk: {new_trunk_id}")

    with open(TRUNK_FILE, "w") as f:
        f.write(new_trunk_id)
    print(f"[update] Saved to {TRUNK_FILE}")
    print(f"\nUpdate env:\n  LIVEKIT_SIP_TRUNK_ID={new_trunk_id}")

    await lk.aclose()


if __name__ == "__main__":
    asyncio.run(main())
