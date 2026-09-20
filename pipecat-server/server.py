"""
CortexFlow Pipecat Server — Telnyx + Deepgram + OpenAI + ElevenLabs
====================================================================
Replaces: voice-service (Node.js) + LiveKit agent (Python) + FreeSWITCH (Docker)

Routes:
  POST /voice/start-call   — CRM backend calls this (backward compat with old voice-service)
  POST /telnyx-webhook     — Telnyx Call Control events (call.answered → start streaming)
  WS   /ws                 — Telnyx streams audio here; Pipecat bot runs here
  GET  /health             — Health check

Flow:
  CRM → POST /voice/start-call
      → Telnyx v2 Calls API (Call Control App) → dials recipient
      → call.answered webhook hits POST /telnyx-webhook
      → we call streaming_start → Telnyx opens WSS /ws
      → Pipecat bot runs conversation
      → Call ends → bot summarises + notifies backend
"""

import asyncio
import base64
import hmac
import json
import os
import time
import urllib.parse
import uuid
from contextlib import asynccontextmanager

import aiohttp
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

load_dotenv(override=True)

# ── Config ────────────────────────────────────────────────────────────────────
TELNYX_API_KEY     = os.getenv("TELNYX_API_KEY", "")
TELNYX_PHONE_NUMBER = os.getenv("TELNYX_PHONE_NUMBER", "+14355009976")

# Call Control App ID (for outbound calls via v2 API)
TELNYX_CC_APP_ID   = os.getenv("TELNYX_CC_APP_ID", "2977430545744528899")

# Public domain — nginx terminates TLS and proxies to port 5000
SERVER_DOMAIN      = os.getenv("SERVER_DOMAIN", "34-180-6-84.nip.io")
SERVER_PORT        = int(os.getenv("PORT", "5000"))

# Shared secret — the CRM backend sends this as the `x-voice-secret` header on
# every /voice/start-call request. Without it, anyone who finds this endpoint
# could make us place Telnyx calls (toll fraud). Must match VOICE_SECRET on the
# Vercel backend.
VOICE_SECRET       = os.getenv("VOICE_SECRET", "")

# Telnyx signs every webhook with Ed25519. We verify the signature so nobody can
# spoof call events (e.g. fake call.answered to trigger streams). Public key is
# fetched from Telnyx (GET /v2/public_key) and stored in TELNYX_PUBLIC_KEY.
TELNYX_PUBLIC_KEY  = os.getenv("TELNYX_PUBLIC_KEY", "")
# Kill-switch: set to "false" to log signature results without rejecting (use
# only if a deploy unexpectedly starts 403-ing valid Telnyx webhooks).
TELNYX_WEBHOOK_ENFORCE = os.getenv("TELNYX_WEBHOOK_ENFORCE", "true").lower() != "false"
# Reject webhooks whose signed timestamp is older than this (replay protection).
WEBHOOK_TOLERANCE_S = 300

_telnyx_verify_key: VerifyKey | None = None
if TELNYX_PUBLIC_KEY:
    try:
        _telnyx_verify_key = VerifyKey(base64.b64decode(TELNYX_PUBLIC_KEY))
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[server] invalid TELNYX_PUBLIC_KEY — webhook verification disabled: {exc}")

# In-memory store: call_control_id → call body dict
_pending_calls: dict[str, dict] = {}

# call_control_ids whose media stream has already been started — guards
# _begin_stream against being run twice for the same call.
_streaming_started: set[str] = set()

# Hard cap on simultaneous in-progress calls. On this VM the CPU-bound VAD /
# turn-detection inference per call is the bottleneck — exceeding the cap
# degrades audio for ALL active calls (cascading failure), so we refuse new
# calls past the cap instead. Tune to VM size and your TTS/STT plan concurrency.
MAX_CONCURRENT_CALLS = int(os.getenv("MAX_CONCURRENT_CALLS", "4"))
# Number of live media-stream (WebSocket) sessions currently running.
_active_calls = 0

# Pre-load the Pipecat bot + heavy deps at IMPORT time (server startup), not
# lazily on the first WebSocket. Importing pipecat (transformers/onnx) takes
# several seconds and, if done inside the call path, blocks the asyncio event
# loop long enough for Telnyx media streaming to time out (error 90046).
from bot import bot as run_pipecat_bot                       # noqa: E402
from pipecat.runner.types import WebSocketRunnerArguments    # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────

def _encode_body(data: dict) -> str:
    raw = json.dumps(data, separators=(",", ":"))
    b64 = base64.b64encode(raw.encode()).decode()
    return urllib.parse.quote(b64, safe="")


def _decode_body(encoded: str) -> dict:
    try:
        url_decoded = urllib.parse.unquote(encoded)
        return json.loads(base64.b64decode(url_decoded).decode())
    except Exception as exc:
        logger.warning(f"[server] Failed to decode body param: {exc}")
        return {}


def _verify_telnyx_webhook(raw_body: bytes, signature_b64: str, timestamp: str) -> bool:
    """Verify a Telnyx webhook's Ed25519 signature over `timestamp|raw_body`."""
    if _telnyx_verify_key is None:
        logger.warning("[server] TELNYX_PUBLIC_KEY not set — webhook signature NOT verified")
        return True
    if not signature_b64 or not timestamp:
        logger.warning("[server] webhook missing signature/timestamp header")
        return False
    try:
        if abs(time.time() - int(timestamp)) > WEBHOOK_TOLERANCE_S:
            logger.warning("[server] webhook timestamp outside tolerance — possible replay")
            return False
        signed = timestamp.encode() + b"|" + raw_body
        _telnyx_verify_key.verify(signed, base64.b64decode(signature_b64))
        return True
    except (BadSignatureError, ValueError) as exc:
        logger.warning(f"[server] webhook signature INVALID: {exc}")
        return False


async def _make_telnyx_call(
    session: aiohttp.ClientSession,
    to_number: str,
    from_number: str,
    webhook_url: str,
) -> dict:
    """Initiate outbound call via Telnyx v2 Calls API using Call Control App."""
    if not TELNYX_API_KEY:
        raise ValueError("TELNYX_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {TELNYX_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    data = {
        "connection_id": TELNYX_CC_APP_ID,
        "to":            to_number,
        "from":          from_number,
        "webhook_url":   webhook_url,
        # AMD intentionally disabled: premium AMD holds/analyzes the media for the
        # first few seconds, which conflicts with starting the bidirectional media
        # stream immediately on answer and breaks the inbound (caller) audio track.
        # Instant greeting + working two-way audio matters more than voicemail
        # detection here.
        "answering_machine_detection": "disabled",
    }

    async with session.post(
        "https://api.telnyx.com/v2/calls",
        headers=headers,
        json=data,
    ) as resp:
        text = await resp.text()
        if resp.status not in (200, 201):
            raise Exception(f"Telnyx API error ({resp.status}): {text}")
        try:
            return await resp.json()
        except Exception:
            return {"raw": text}


async def _start_streaming(
    session: aiohttp.ClientSession,
    call_control_id: str,
    stream_url: str,
) -> None:
    """Tell Telnyx to start bidirectional media streaming to our WebSocket."""
    headers = {
        "Authorization": f"Bearer {TELNYX_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "stream_url":                       stream_url,
        "stream_track":                     "inbound_track",
        "stream_bidirectional_mode":        "rtp",
        "stream_bidirectional_codec":       "PCMU",
        # CRITICAL: default is "opposite", which on a single outbound call routes
        # our bot audio to a non-existent second leg → caller hears silence.
        # "self" plays the bot audio back to the customer's own leg.
        "stream_bidirectional_target_legs": "self",
    }
    url = f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/streaming_start"
    logger.info(f"[server] calling streaming_start: {url} stream_url={stream_url}")
    async with session.post(url, headers=headers, json=data) as resp:
        text = await resp.text()
        if resp.status not in (200, 201):
            logger.error(f"[server] streaming_start failed ({resp.status}): {text}")
        else:
            logger.info(f"[server] streaming_start OK for {call_control_id}")


async def _begin_stream(session: aiohttp.ClientSession, cc_id: str) -> None:
    """Start the media stream for a call exactly once (idempotent)."""
    if cc_id in _streaming_started:
        return
    _streaming_started.add(cc_id)
    body = _pending_calls.get(cc_id, {})
    encoded = _encode_body(body) if body else ""
    ws_url = f"wss://{SERVER_DOMAIN}/ws"
    if encoded:
        ws_url = f"{ws_url}?body={encoded}"
    logger.info(f"[webhook] starting stream to {ws_url}")
    await _start_streaming(session, cc_id, ws_url)


async def _hangup_call(session: aiohttp.ClientSession, cc_id: str, reason: str) -> None:
    """Hang up a Telnyx call (e.g. when AMD detects voicemail)."""
    logger.info(f"[server] hanging up {cc_id} — {reason}")
    headers = {
        "Authorization": f"Bearer {TELNYX_API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"https://api.telnyx.com/v2/calls/{cc_id}/actions/hangup"
    try:
        async with session.post(url, headers=headers, json={}) as resp:
            if resp.status not in (200, 201):
                logger.error(f"[server] hangup failed ({resp.status}): {await resp.text()}")
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[server] hangup error: {exc}")


BACKEND_URL = os.getenv("BACKEND_URL", "https://cortex-backend-api.vercel.app").rstrip("/")


async def _queue_poller(session: aiohttp.ClientSession) -> None:
    """Poll the Vercel queue worker so auto-dial works without a 1-minute Vercel cron."""
    secret = os.getenv("CRON_SECRET") or VOICE_SECRET
    if not BACKEND_URL:
        logger.warning("[poller] BACKEND_URL missing — queue poller disabled")
        return
    logger.info("[poller] queue worker poller started (every 60s)")
    while True:
        try:
            headers = {"Authorization": f"Bearer {secret}", "x-voice-secret": VOICE_SECRET}
            async with session.get(
                f"{BACKEND_URL}/v1/internal/queue-worker",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=40),
            ) as resp:
                body = await resp.text()
                if resp.status >= 400:
                    logger.warning(f"[poller] queue-worker HTTP {resp.status}: {body[:300]}")
                else:
                    logger.info(f"[poller] queue-worker {resp.status}: {body[:200]}")
            async with session.get(
                f"{BACKEND_URL}/v1/internal/process-reminders",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                if resp.status >= 400:
                    logger.warning(f"[poller] reminders HTTP {resp.status}")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[poller] queue-worker failed: {exc}")
        await asyncio.sleep(60)


# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = aiohttp.ClientSession()
    logger.info(f"[server] CortexFlow Pipecat server starting on port {SERVER_PORT}")
    logger.info(f"[server] Public domain: https://{SERVER_DOMAIN}")
    poller = asyncio.create_task(_queue_poller(app.state.http))
    yield
    poller.cancel()
    await app.state.http.close()


app = FastAPI(title="CortexFlow Pipecat Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── POST /voice/start-call  (backward-compat with old voice-service) ──────────
@app.post("/voice/start-call")
async def voice_start_call(request: Request) -> JSONResponse:
    """Called by the Vercel CRM backend — same contract as old voice-service."""
    # ── Auth: require matching x-voice-secret (prevents toll fraud) ────────────
    if VOICE_SECRET:
        provided = request.headers.get("x-voice-secret", "")
        if not hmac.compare_digest(provided, VOICE_SECRET):
            logger.warning("[server] /voice/start-call rejected — bad/missing x-voice-secret")
            raise HTTPException(401, "Unauthorized")
    else:
        logger.error("[server] VOICE_SECRET not set — refusing /voice/start-call")
        raise HTTPException(503, "VOICE_SECRET is not configured")

    data = await request.json()
    phone     = data.get("phone", "")
    name      = data.get("name", "")
    lead_id   = data.get("lead_id", "")
    tenant_id = data.get("tenant_id", "")
    call_brief = data.get("call_brief") or {}

    if not phone:
        raise HTTPException(400, "Missing 'phone'")

    # ── Admission control: refuse new calls when at capacity ──────────────────
    # Count both live sessions and dialed-but-not-yet-answered calls so a burst
    # of dials can't blow past the cap.
    in_flight = _active_calls + len(_pending_calls)
    if in_flight >= MAX_CONCURRENT_CALLS:
        logger.warning(
            f"[server] /voice/start-call refused — at capacity "
            f"({in_flight}/{MAX_CONCURRENT_CALLS})"
        )
        raise HTTPException(429, "At call capacity, retry shortly")

    # Normalise to E.164
    e164 = phone.strip()
    if not e164.startswith("+"):
        digits = "".join(c for c in e164 if c.isdigit())
        e164 = f"+91{digits}" if len(digits) == 10 else f"+{digits}"

    call_id = data.get("call_id") or str(uuid.uuid4())
    body = {
        "call_id":   call_id,
        "lead_id":   lead_id,
        "tenant_id": tenant_id,
        "lead_name": name,
        "call_brief": call_brief,
    }

    webhook_url = f"https://{SERVER_DOMAIN}/telnyx-webhook"

    logger.info(f"[server] Initiating call call_id={call_id} to={e164} lead={lead_id}")

    try:
        resp_data = await _make_telnyx_call(
            session=request.app.state.http,
            to_number=e164,
            from_number=TELNYX_PHONE_NUMBER,
            webhook_url=webhook_url,
        )
        # Store body keyed by call_control_id returned from Telnyx
        cc_id = resp_data.get("data", {}).get("call_control_id", "")
        if cc_id:
            _pending_calls[cc_id] = body
            logger.info(f"[server] Stored body for call_control_id={cc_id}")
        else:
            logger.warning(f"[server] No call_control_id in response: {resp_data}")
    except Exception as exc:
        logger.error(f"[server] Telnyx call failed: {exc}")
        raise HTTPException(502, f"Telnyx error: {exc}")

    return JSONResponse({"call_id": call_id, "status": "initiated"})


# ── POST /telnyx-webhook  (Call Control events from Telnyx) ──────────────────
@app.post("/telnyx-webhook")
async def telnyx_webhook(request: Request) -> JSONResponse:
    """Handle Telnyx Call Control webhooks (Ed25519 signature verified)."""
    raw = await request.body()
    sig = request.headers.get("telnyx-signature-ed25519", "")
    ts  = request.headers.get("telnyx-timestamp", "")

    if not _verify_telnyx_webhook(raw, sig, ts):
        if TELNYX_WEBHOOK_ENFORCE:
            raise HTTPException(403, "Invalid webhook signature")
        logger.warning("[server] webhook signature failed but ENFORCE=false — processing anyway")

    try:
        event = json.loads(raw)
    except Exception:
        return JSONResponse({"received": True})

    event_type = event.get("data", {}).get("event_type", "")
    payload    = event.get("data", {}).get("payload", {})
    cc_id      = payload.get("call_control_id", "")

    logger.info(f"[webhook] event_type={event_type} call_control_id={cc_id}")

    http = request.app.state.http

    if event_type == "call.answered" and cc_id:
        # Greet INSTANTLY — start the bidirectional media stream the moment the
        # call is answered. No AMD gating: AMD is disabled because it conflicts
        # with starting the stream this early and breaks inbound audio.
        logger.info(f"[webhook] call.answered — starting stream immediately for {cc_id}")
        asyncio.create_task(_begin_stream(http, cc_id))

    elif "streaming" in event_type:
        logger.warning(f"[webhook] STREAMING EVENT {event_type} payload={json.dumps(payload)}")

    elif event_type in ("call.hangup", "call.failed"):
        _pending_calls.pop(cc_id, None)
        _streaming_started.discard(cc_id)
        logger.info(f"[webhook] call ended ({event_type}) — cleaned up {cc_id}")

    return JSONResponse({"received": True})


# ── WS /ws  (Telnyx audio stream → Pipecat bot) ──────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    body: str = Query(None),
):
    """Telnyx connects here; we hand off to the Pipecat bot."""
    global _active_calls
    await websocket.accept()

    # Hard safety cap (defense-in-depth behind /voice/start-call admission control).
    if _active_calls >= MAX_CONCURRENT_CALLS:
        logger.warning(
            f"[server] WS refused — at capacity ({_active_calls}/{MAX_CONCURRENT_CALLS})"
        )
        try:
            await websocket.close()
        except Exception:
            pass
        return

    _active_calls += 1
    logger.info(f"[server] WebSocket accepted (active={_active_calls}/{MAX_CONCURRENT_CALLS})")

    body_data = _decode_body(body) if body else {}
    logger.info(f"[server] call_id={body_data.get('call_id')} lead={body_data.get('lead_id')}")

    try:
        runner_args = WebSocketRunnerArguments(
            websocket=websocket,
            body=body_data,
        )
        await run_pipecat_bot(runner_args)
    except Exception as exc:
        logger.exception(f"[server] Bot error: {exc}")
    finally:
        _active_calls -= 1
        logger.info(f"[server] WebSocket closed (active={_active_calls}/{MAX_CONCURRENT_CALLS})")
        try:
            await websocket.close()
        except Exception:
            pass


# ── Health check ──────────────────────────────────────────────────────────────
def _env_filled(name: str) -> bool:
    return bool((os.getenv(name) or "").strip())


@app.get("/health")
async def health():
    eleven_key = (os.getenv("ELEVENLABS_API_KEY") or "").strip()
    waiting_on = []
    if not TELNYX_API_KEY:
        waiting_on.append("TELNYX_API_KEY")
    if not eleven_key.startswith("sk_"):
        waiting_on.append("ELEVENLABS_API_KEY")
    return {
        "status": "ok",
        "telnyx_configured": bool(TELNYX_API_KEY and TELNYX_CC_APP_ID),
        "elevenlabs_configured": eleven_key.startswith("sk_"),
        "deepgram_configured": _env_filled("DEEPGRAM_API_KEY"),
        "openai_configured": _env_filled("OPENAI_API_KEY"),
        "voice_secret_configured": bool(VOICE_SECRET),
        "phone_number": TELNYX_PHONE_NUMBER,
        "domain": SERVER_DOMAIN,
        "waiting_on": waiting_on or None,
    }


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=SERVER_PORT,
        reload=False,
        log_level="info",
    )
