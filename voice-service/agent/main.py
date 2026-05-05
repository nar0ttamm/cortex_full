#!/usr/bin/env python3
"""
CortexFlow AI Voice Agent — LiveKit Agents 1.x

Supports two modes via AGENT_MODE env var:
  realtime  (default) — OpenAI Realtime API: single WebSocket, ~300ms latency
  groq               — Groq LLM + Deepgram STT/TTS: ~600ms latency, cheaper

Key design:
- book_appointment() function tool → AI calls this directly when lead confirms time
  (bypasses transcript-based summarization, gives exact ISO datetime)
- end_call() function tool → AI calls this to auto-disconnect after goodbye
- Session waits for SIP disconnect OR tool-triggered end, NOT wait_for_inactive()
  (wait_for_inactive resolves after greeting silence = premature exit)
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli, function_tool
from livekit.plugins import deepgram, openai, silero

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("cortex-agent")

AGENT_MODE        = os.getenv("AGENT_MODE", "realtime").lower()   # "realtime" | "groq"
MAX_CALL_S        = int(os.getenv("MAX_CALL_DURATION_S", "300"))
VOICE_SERVICE_URL = os.getenv("VOICE_SERVICE_URL", "http://localhost:5000").rstrip("/")
VOICE_SECRET      = os.getenv("VOICE_SECRET", "")
LK_HTTP_URL       = (os.getenv("LIVEKIT_URL", "ws://localhost:7880")
                     .replace("wss://", "https://").replace("ws://", "http://"))
LK_KEY            = os.getenv("LIVEKIT_API_KEY", "")
LK_SECRET         = os.getenv("LIVEKIT_API_SECRET", "")


# ─── helpers ──────────────────────────────────────────────────────────────────

import base64
import hashlib
import hmac as _hmac


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _lk_token(room: str | None = None) -> str:
    """Minimal HS256 JWT for LiveKit RoomService calls."""
    import json as _json
    header  = _b64url(b'{"alg":"HS256","typ":"JWT"}')
    video   = {"roomCreate": True, "roomAdmin": True, "roomList": True}
    if room:
        video["room"] = room
    payload = _b64url(_json.dumps({
        "exp": int(time.time()) + 600,
        "iss": LK_KEY, "sub": LK_KEY,
        "video": video,
    }).encode())
    sig = _b64url(_hmac.new(LK_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


async def _hang_up_sip(room_name: str, participant_identity: str) -> None:
    """Remove the SIP participant from the LiveKit room → hangs up the phone."""
    if not LK_KEY or not LK_SECRET:
        return
    url = f"{LK_HTTP_URL}/twirp/livekit.RoomService/RemoveParticipant"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {_lk_token(room=room_name)}",
                },
                json={"room": room_name, "identity": participant_identity},
            )
        logger.info(f"[hangup] RemoveParticipant {participant_identity} → {res.status_code}")
    except Exception as exc:
        logger.error(f"[hangup] {exc}")


def get_ist_datetime() -> str:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    return now.strftime("%A, %d %B %Y — %H:%M IST")


def build_kb_section(kb_context: dict | None) -> str:
    """Build a compact KB instructions section from the KB context payload."""
    if not kb_context:
        return ""

    lines = []

    # Tenant-level KB
    tenant = kb_context.get("tenant") or {}
    if tenant.get("calling_rules"):
        lines.append(f"\nCALLING RULES (follow strictly):\n{tenant['calling_rules']}")
    if tenant.get("brand_voice"):
        lines.append(f"\nBRAND VOICE / TONE:\n{tenant['brand_voice']}")
    if tenant.get("company_instructions"):
        lines.append(f"\nCOMPANY INSTRUCTIONS:\n{tenant['company_instructions']}")

    # Project-level KB
    project = kb_context.get("project") or {}
    if project.get("name"):
        lines.append(f"\nPROJECT: {project['name']}")
    if project.get("calling_rules"):
        lines.append(f"Project-specific rules: {project['calling_rules']}")
    if project.get("company_instructions"):
        lines.append(f"Project instructions: {project['company_instructions']}")

    # Products
    products = kb_context.get("products") or []
    if products:
        lines.append("\n━━ PRODUCTS / PROPERTIES TO SELL ━━")
        lines.append("Sirf niche diye gaye products pitch karo. Koi aur product invent mat karo.\n")
        for i, p in enumerate(products, 1):
            parts = [f"{i}. {p.get('name', 'Product')}"]
            if p.get("property_type"):   parts.append(f"   Type: {p['property_type']}")
            if p.get("location"):        parts.append(f"   Location: {p['location']}")
            if p.get("price_range"):     parts.append(f"   Price: {p['price_range']}")
            if p.get("size"):            parts.append(f"   Size: {p['size']}")
            if p.get("possession_status"): parts.append(f"   Possession: {p['possession_status']}")
            if p.get("amenities"):       parts.append(f"   Amenities: {p['amenities']}")
            lines.append("\n".join(parts))
        lines.append("\nIMPORTANT: Do NOT mention any product not listed above.")

    return "\n".join(lines) if lines else ""


def build_instructions(
    lead_name: str = "",
    lead_inquiry: str = "",
    mode: str = "groq",
    tenant_name: str = "",
    kb_context: dict | None = None,
) -> str:
    name_ctx    = f"\nAap {lead_name} ko call kar rahe hain." if lead_name else ""
    inquiry_ctx = (
        f'\nUnhone pehle "{lead_inquiry}" ke baare mein enquiry ki thi. Is context ka use karein.'
        if lead_inquiry
        else ""
    )
    greeting_name = lead_name if lead_name and lead_name.lower() not in ("there", "customer", "") else "aap"
    biz           = tenant_name if tenant_name else "hamaari company"
    opening = (
        f'\nIMPORTANT: Sabse pehle yeh greeting bolein aur RUKO — user ke jawab ka intezaar karo: '
        f'"Namaste {greeting_name} ji, main {biz} se baat kar raha hoon — kya aapke paas ek minute hai?" '
        f'Greeting ke baad BILKUL CHUP raho. User jabtak kuch na bole, aap kuch mat bolo.'
        if mode == "realtime"
        else ""
    )

    kb_section = build_kb_section(kb_context)

    return f"""\
Aap {biz} ke liye ek friendly aur professional AI sales assistant hain.{name_ctx}{inquiry_ctx}{opening}

Aapka role:
1. Confirm karein ki prospect available hai baat karne ke liye
2. Unki inquiry ka reference dein (agar pata ho) ya briefly explain karein ki business kaise help kar sakta hai
3. 1-2 qualifying questions poochhein unki needs ke baare mein
4. Agar interested hain, formal meeting/appointment book karein — SPECIFIC din aur TIME poochhein
5. Har response 1-2 short sentences mein rakhein — phone conversation ki speed mein
6. Warm aur natural raho — Hindi/Hinglish mein baat karo
7. Jab woh goodbye bolein, gracefully wrap up karo aur end_call() tool call karo

Current date and time: {get_ist_datetime()}

LANGUAGE RULE: Default Hindi/Hinglish mein baat karo. Agar caller English mein baat kare, to English mein jawab do. Caller ki language follow karo.
{kb_section}
━━━ CALLBACK vs APPOINTMENT — BAHUT ZAROORI FARQ ━━━

CALLBACK matlab: Lead ne kaha ki "baad mein call karo", "ek ghante mein call karo", "kal call karna",
"abhi busy hoon", "thodi der baad baat karein" — yani AAPKO UNHE DOBARA CALL KARNA HAI.
→ Ismein book_appointment() BILKUL MAT KARO.
→ Sirf end_call(outcome='callback') karo.
→ Example: "Theek hai, main ek ghante mein dobara call karunga. Aapka din shubh ho!"

APPOINTMENT matlab: Lead ne khud aapke saath ek FORMAL MEETING ya DEMO ke liye SPECIFIC date aur time
confirm kiya hai — aur dono ne agree kiya hai ek scheduled meeting ke liye.
→ Tab hi book_appointment() karo.
→ Example: "Kal subah 10 baje meeting schedule karte hain" — yeh appointment hai.

GALTI MAT KARO:
✗ "1 ghante mein call karo" → book_appointment() — WRONG, yeh callback hai
✓ "1 ghante mein call karo" → end_call(outcome='callback') — CORRECT
✗ "Kal baat karein" → book_appointment() — WRONG, yeh bhi callback hai
✓ "Kal 11 baje aapki team se meeting fix karein" → book_appointment() — CORRECT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

APPOINTMENT BOOKING (sirf jab lead formal meeting confirm kare):
- Pehle confirm karo: "To main aapko [din] ko [time] IST ke liye book kar raha hoon — theek hai?"
- Lead ke "haan" kehne par: book_appointment() tool call karo correct ISO datetime ke saath
- Phir: "Perfect, calendar mein note ho gaya" — phir end_call(outcome='appointment_booked') call karo

CALL ENDING:
- Jab bhi conversation complete ho, TURANT end_call() tool call karo
- Max 30 words per response. Sirf spoken words — no markdown, no lists."""


# ─── agent class ──────────────────────────────────────────────────────────────

class CortexFlowAgent(Agent):
    def __init__(
        self,
        lead_name: str,
        instructions: str,
        mode: str = "groq",
        tenant_name: str = "",
        kb_context: dict | None = None,
    ):
        super().__init__(instructions=instructions)
        self._lead_name   = lead_name
        self._tenant_name = tenant_name
        self._mode        = mode
        self._appointment: dict | None  = None
        self._outcome: str              = "unknown"
        self._done        = asyncio.Event()  # set when agent calls end_call()

    async def on_enter(self) -> None:
        if self._mode == "realtime":
            self.session.generate_reply()
        else:
            greeting_name = (
                self._lead_name
                if self._lead_name and self._lead_name.lower() not in ("there", "customer", "")
                else "aap"
            )
            biz = self._tenant_name if self._tenant_name else "hamaari company"
            await self.session.say(
                f"Namaste {greeting_name} ji, main {biz} se baat kar raha hoon — kya aapke paas ek minute hai?",
                allow_interruptions=True,
            )

    @function_tool
    async def book_appointment(
        self,
        appointment_iso: Annotated[
            str,
            "Confirmed appointment date-time in ISO 8601 +05:30 format. "
            "Example: '2026-04-20T19:00:00+05:30'. Calculate from what the lead said.",
        ],
        notes: Annotated[str, "Optional notes about the appointment"] = "",
    ) -> str:
        """Book a FORMAL MEETING/APPOINTMENT for the lead in the CRM calendar.
        ONLY call this when the lead explicitly agrees to a scheduled meeting or demo
        at a specific date and time — e.g. 'Kal subah 10 baje meeting karte hain'.

        DO NOT call this for callbacks. If the lead says 'call me back in 1 hour',
        'call me later', 'ek ghante mein call karo', 'kal call karna', 'abhi busy hoon' —
        these are CALLBACKS, not appointments. Use end_call(outcome='callback') instead."""
        self._appointment = {"iso": appointment_iso, "notes": notes}
        self._outcome     = "appointment_booked"
        logger.info(f"[tool:book_appointment] iso={appointment_iso} notes={notes!r}")
        return "Appointment CRM mein save ho gaya."

    @function_tool
    async def end_call(
        self,
        outcome: Annotated[
            str,
            "Call outcome. Choose one of:\n"
            "  'appointment_booked' — lead confirmed a formal meeting (use only after book_appointment)\n"
            "  'callback'           — lead asked to be called back later (e.g. 'call me in 1 hour', 'kal call karo', 'abhi busy hoon')\n"
            "  'interested'         — lead is interested but no specific next step set\n"
            "  'not_interested'     — lead is not interested\n"
            "  'unknown'            — conversation ended without clear outcome\n"
            "IMPORTANT: Use 'callback' when lead says call back, not appointment_booked.",
        ] = "unknown",
    ) -> str:
        """End the call and signal the outcome. Call this when:
        - Lead asked for a callback ('call me in 1 hour', 'kal call karo', 'baad mein baat karein') → outcome='callback'
        - Appointment was formally booked and confirmed → outcome='appointment_booked'
        - Lead said goodbye or is not interested → outcome='not_interested'
        - Conversation completed naturally → outcome='interested' or 'unknown'

        IMPORTANT: Call this ONLY after you have fully spoken your farewell sentence."""
        if self._outcome == "unknown":
            self._outcome = outcome
        logger.info(f"[tool:end_call] outcome={self._outcome}")

        # Delay before signalling done so the AI can finish speaking the farewell.
        # The tool return value ("Theek hai...") is spoken first, then after
        # HANGUP_DELAY_S seconds the call is disconnected.
        async def _schedule_hangup() -> None:
            await asyncio.sleep(4)  # 4 s: enough for TTS + 2-s buffer
            self._done.set()

        asyncio.create_task(_schedule_hangup())
        return "Theek hai, aapka samay dene ke liye shukriya. Aapka din shubh ho!"


# ─── call result helpers ───────────────────────────────────────────────────────

async def summarize_call(transcript: str, call_id: str) -> dict:
    """Fallback summarizer for non-appointment calls or when tools weren't used."""
    if not transcript.strip():
        return {
            "summary": "",
            "outcome": "unknown",
            "appointment_requested": False,
            "proposed_appointment_iso": None,
        }
    try:
        from openai import AsyncOpenAI  # noqa: PLC0415
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        now_ist = get_ist_datetime()
        prompt = f"""Analyze this sales call transcript and respond ONLY with a JSON object:
{{
  "summary": "2-3 sentence summary",
  "outcome": "interested|not_interested|callback|appointment_booked|unknown",
  "appointment_requested": true|false,
  "proposed_appointment_iso": null
}}

Call time: {now_ist}

CRITICAL — Callback vs Appointment distinction:
- outcome='callback' → Lead asked to be called back later. Examples: "call me in 1 hour",
  "call me back", "ek ghante mein call karo", "kal call karna", "abhi busy hoon", "thodi der baad".
  These mean the AGENT must call the lead again. Do NOT classify these as appointment_booked.
- outcome='appointment_booked' → Lead explicitly agreed to a formal scheduled meeting/demo
  at a specific day and time. Both parties agreed to meet.

Rules for proposed_appointment_iso:
- Only set if customer confirmed a FORMAL MEETING at a SPECIFIC day AND time (calculate ISO 8601 +05:30)
- For callbacks ("call me in 1 hour"), set proposed_appointment_iso to null — it is NOT an appointment
- "aaj shaam 7 baje" when today is {now_ist} → calculate the correct ISO datetime
- Set null if no formal appointment was scheduled

Transcript:
{transcript}"""

        resp = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=300,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error(f"[summarize:{call_id}] {exc}")
        return {
            "summary": "",
            "outcome": "unknown",
            "appointment_requested": False,
            "proposed_appointment_iso": None,
        }


async def notify_backend(
    call_id: str,
    lead_id: str,
    tenant_id: str,
    transcript: str,
    duration_s: int,
    summary_data: dict,
) -> None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{VOICE_SERVICE_URL}/voice/call-result",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json={
                    "tenant_id":               tenant_id,
                    "lead_id":                 lead_id,
                    "call_id":                 call_id,
                    "transcript":              transcript,
                    "summary":                 summary_data.get("summary", ""),
                    "outcome":                 summary_data.get("outcome", "unknown"),
                    "duration_seconds":        duration_s,
                    "appointment_requested":   bool(summary_data.get("appointment_requested", False)),
                    "proposed_appointment_iso": summary_data.get("proposed_appointment_iso"),
                },
            )
        logger.info(f"[notify:{call_id}] backend {res.status_code}")
    except Exception as exc:
        logger.error(f"[notify:{call_id}] {exc}")


def _has_non_latin(text: str) -> bool:
    """Return True if text contains non-Latin script characters (Urdu, Devanagari, Arabic, etc.)."""
    import unicodedata
    for ch in text:
        cat = unicodedata.category(ch)
        name = unicodedata.name(ch, "")
        # Check for common non-Latin scripts: Devanagari, Arabic, Urdu, etc.
        if any(script in name for script in ("DEVANAGARI", "ARABIC", "URDU", "BENGALI", "GUJARATI", "GURMUKHI", "TAMIL", "TELUGU", "KANNADA", "MALAYALAM")):
            return True
    return False


async def _normalize_transcript(transcript: str) -> str:
    """
    Phase 11: Normalize transcript to English Latin script.
    If non-Latin characters are detected, use OpenAI to transliterate/translate.
    """
    if not transcript.strip():
        return transcript

    if not _has_non_latin(transcript):
        return transcript  # Already Latin script — no action needed

    logger.info("[transcript] Non-Latin script detected, normalizing to English Latin script...")

    try:
        from openai import AsyncOpenAI  # noqa: PLC0415
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        resp = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a transliteration assistant. Convert the following call transcript "
                        "to English Latin script only. For Hindi/Hinglish speech, write it in Roman/Latin "
                        "script (Hinglish). For English speech, keep it as-is. "
                        "Do NOT translate — just convert script. Keep speaker labels like 'Customer:' and 'AI:'. "
                        "Output only the converted transcript, nothing else."
                    ),
                },
                {"role": "user", "content": transcript},
            ],
            max_tokens=2000,
            temperature=0,
        )
        normalized = resp.choices[0].message.content or transcript
        logger.info("[transcript] Normalization complete")
        return normalized
    except Exception as exc:
        logger.warning(f"[transcript] Normalization failed: {exc}. Using raw transcript.")
        return transcript


def _build_transcript(session: AgentSession, extra_lines: list[str] | None = None) -> str:
    lines: list[str] = []
    for msg in session.history.messages():
        role_label = None
        if msg.role == "user":
            role_label = "Customer"
        elif msg.role == "assistant":
            role_label = "AI"
        if role_label and msg.content:
            content = (
                msg.content
                if isinstance(msg.content, str)
                else " ".join(
                    c.text if hasattr(c, "text") else str(c)
                    for c in msg.content
                    if c
                )
            )
            if content.strip():
                lines.append(f"{role_label}: {content.strip()}")
    if extra_lines:
        lines.extend(extra_lines)
    return "\n".join(lines)


# ─── session factory ───────────────────────────────────────────────────────────

def _make_session(call_id: str) -> AgentSession:
    if AGENT_MODE == "realtime":
        logger.info(f"[agent:{call_id}] mode=realtime (OpenAI Realtime API)")
        from livekit.plugins.openai import realtime as lk_realtime  # noqa: PLC0415
        return AgentSession(
            llm=lk_realtime.RealtimeModel(
                model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview"),
                voice=os.getenv("OPENAI_REALTIME_VOICE", "shimmer"),
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=0.8,
            )
        )

    logger.info(f"[agent:{call_id}] mode=groq (Groq LLM + Deepgram)")
    return AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_MODEL", "nova-2"),
            language=os.getenv("DEEPGRAM_LANGUAGE", "hi"),       # Hindi-first
            interim_results=True,
            endpointing_ms=int(os.getenv("DEEPGRAM_ENDPOINTING_MS", "250")),
            no_delay=True,
        ),
        llm=openai.LLM(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
        ),
        tts=deepgram.TTS(
            model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-harmonia-en"),
        ),
        allow_interruptions=True,
        min_endpointing_delay=0.25,
        max_endpointing_delay=1.2,
    )


# ─── entrypoint ───────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    logger.info(f"[cortex-agent] job received room={ctx.room.name}")

    # Connect first — room.metadata is populated after the WebSocket handshake
    await ctx.connect()

    def _parse_meta(s: str | None) -> dict:
        try:
            return json.loads(s or "{}") if s else {}
        except Exception:
            return {}

    room_meta = _parse_meta(ctx.room.metadata)
    job_meta  = _parse_meta(ctx.job.metadata if hasattr(ctx, "job") and ctx.job else None)
    metadata  = {**job_meta, **room_meta}

    lead_name: str    = metadata.get("name", "")
    lead_id: str      = metadata.get("lead_id", "")
    tenant_id: str    = metadata.get("tenant_id", "")
    tenant_name: str  = metadata.get("tenant_name", "")
    lead_inquiry: str = metadata.get("inquiry", "")
    kb_context: dict | None = metadata.get("kb_context") or None
    raw_room          = ctx.room.name
    call_id: str      = metadata.get(
        "call_id",
        raw_room.removeprefix("call-") if raw_room.startswith("call-") else raw_room,
    )
    sip_identity      = f"sip-{call_id}"   # matches livekitBridge.ts participant_identity

    logger.info(f"[agent:{call_id}] lead_id={lead_id} name={lead_name!r} tenant={tenant_name!r} has_kb={kb_context is not None}")

    session = _make_session(call_id)
    agent   = CortexFlowAgent(
        lead_name=lead_name,
        instructions=build_instructions(
            lead_name, lead_inquiry,
            mode=AGENT_MODE,
            tenant_name=tenant_name,
            kb_context=kb_context,
        ),
        mode=AGENT_MODE,
        tenant_name=tenant_name,
        kb_context=kb_context,
    )

    started_at = time.monotonic()
    await session.start(agent, room=ctx.room)
    logger.info(f"[agent:{call_id}] session started")

    # ── Wait for SIP participant disconnect (user hangs up) ──────────────────
    # Using wait_for_inactive() causes premature exit after the greeting silence.
    # Instead we watch for the SIP participant to leave OR the agent to call end_call().
    sip_disconnected = asyncio.Event()

    def _on_participant_disconnect(participant: any) -> None:
        if participant.identity.startswith("sip-"):
            logger.info(f"[agent:{call_id}] SIP participant disconnected")
            sip_disconnected.set()

    ctx.room.on("participant_disconnected", _on_participant_disconnect)

    try:
        done_tasks, pending = await asyncio.wait(
            [
                asyncio.create_task(agent._done.wait()),        # agent said goodbye
                asyncio.create_task(sip_disconnected.wait()),   # user hung up
            ],
            timeout=MAX_CALL_S,
            return_when=asyncio.FIRST_COMPLETED,
        )
    except Exception:
        done_tasks, pending = set(), set()

    for t in pending:
        t.cancel()

    duration_s = int(time.monotonic() - started_at)
    logger.info(f"[agent:{call_id}] ended duration={duration_s}s outcome={agent._outcome}")

    # If agent triggered end_call(), remove SIP participant to hang up the phone.
    # session.aclose() is NOT called here — the Realtime session stays alive
    # long enough for the AI to finish speaking its farewell (4-s delay is
    # baked into end_call() before _done is set).
    if agent._done.is_set():
        await _hang_up_sip(raw_room, sip_identity)

    # ── Build summary from tool results (reliable) + transcript fallback ─────
    if agent._appointment:
        # book_appointment() was called — use exact ISO, no summarizer needed
        summary_data: dict = {
            "summary": (
                f"Appointment booked: {agent._appointment['iso']}"
                + (f" — {agent._appointment['notes']}" if agent._appointment.get("notes") else "")
            ),
            "outcome":                 "appointment_booked",
            "appointment_requested":   True,
            "proposed_appointment_iso": agent._appointment["iso"],
        }
    else:
        transcript   = _build_transcript(session)
        summary_data = await summarize_call(transcript, call_id)
        if agent._outcome != "unknown":
            summary_data["outcome"] = agent._outcome

    raw_transcript = _build_transcript(session)
    # Phase 11: Normalize non-Latin script to English Latin
    transcript = await _normalize_transcript(raw_transcript)
    await notify_backend(call_id, lead_id, tenant_id, transcript, duration_s, summary_data)


# ─── worker ───────────────────────────────────────────────────────────────────

def prewarm(proc) -> None:
    if AGENT_MODE != "realtime":
        silero.VAD.load()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="cortex-agent",
        )
    )
