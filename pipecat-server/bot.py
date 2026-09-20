"""
CortexFlow Pipecat Bot — pipecat 0.0.108
=========================================
Pipeline:  Telnyx WS → STT → OpenAI gpt-4o-mini → ElevenLabs TTS (Sana, Hindi
           female) → Telnyx WS

Turn-taking (controlled by STT_MODE env):
  - STT_MODE=nova  (default): Deepgram nova-3 streaming STT + SileroVAD, with a
    SpeechTimeoutUserTurnStopStrategy. The bot waits for a short, deterministic
    pause after the caller stops speaking — no English-biased Smart Turn model,
    no 8kHz/16kHz sample-rate trap. Reliable on the current deployment.
  - STT_MODE=flux: Deepgram Flux (flux-general-multi, EN+HI) which has *native*
    acoustic+semantic turn detection and broadcasts start/stop-of-turn itself.
    Uses ExternalUserTurnStrategies so we do NOT depend on VAD for turn-taking.
    Requires a Deepgram plan with Flux access + this pipecat version.

Graceful endings:
  - The bot never hard-cancels the pipeline mid-utterance. It speaks a short
    human-like farewell and then queues EndTaskFrame, which drains the audio
    before shutting down — so the caller is never cut off.
"""

import asyncio
import json
import os
import time
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    TTSSpeakFrame,
    EndTaskFrame,
    FunctionCallResultProperties,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.telnyx import TelnyxFrameSerializer
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

load_dotenv(override=True)

BACKEND_URL      = os.getenv("BACKEND_URL", "https://cortex-backend-api.vercel.app").rstrip("/")
VOICE_SECRET     = os.getenv("VOICE_SECRET", "")
MAX_CALL_S       = int(os.getenv("MAX_CALL_DURATION_S", "300"))
# Seconds of caller silence (after the bot stops speaking) before the bot
# re-prompts. After IDLE_MAX_PROMPTS unanswered re-prompts, the call ends.
IDLE_TIMEOUT_S   = float(os.getenv("IDLE_TIMEOUT_S", "8"))
IDLE_MAX_PROMPTS = int(os.getenv("IDLE_MAX_PROMPTS", "2"))

# Turn-detection backend: "nova" (default, VAD + SpeechTimeout) or "flux"
# (Deepgram Flux native turn detection — no VAD dependency for turn-taking).
STT_MODE = os.getenv("STT_MODE", "nova").strip().lower()

# Human-like farewell spoken before the call ends gracefully.
FAREWELL_TEXT = os.getenv(
    "FAREWELL_TEXT",
    "Theek hai, aapka samay dene ke liye shukriya. Aapka din shubh ho!",
)


# ── IST datetime helper ───────────────────────────────────────────────────────

def _get_ist_now() -> str:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    return now.strftime("%A, %d %B %Y — %H:%M IST")


# ── System prompt (ported from LiveKit main.py) ───────────────────────────────

def _format_product_list(products: list) -> str:
    if not products:
        return ""
    lines = ["\n\u2550\u2550 PROPERTIES TO DISCUSS \u2550\u2550"]
    lines.append("Sirf niche diye products pitch karo. Koi product invent mat karo.\n")
    for i, p in enumerate(products[:5], 1):
        parts = [f"{i}. {p.get('name', 'Property')}"]
        if p.get("property_type"): parts.append(f"   Type: {p['property_type']}")
        if p.get("location"):      parts.append(f"   Location: {p['location']}")
        if p.get("price_range"):   parts.append(f"   Price: {p['price_range']}")
        if p.get("size"):          parts.append(f"   Size: {p['size']}")
        if p.get("possession_status"): parts.append(f"   Possession: {p['possession_status']}")
        lines.append("\n".join(parts))
    lines.append("\nIMPORTANT: Do NOT mention products not listed above. Use search_project_products for more.")
    return "\n".join(lines)


def _format_previous_context(call_ctx: dict) -> str:
    if call_ctx.get("call_type") != "follow_up":
        return ""
    parts = []
    if call_ctx.get("last_summary"):       parts.append(f"Pichli baat: {call_ctx['last_summary']}")
    if call_ctx.get("lead_budget"):        parts.append(f"Budget: {call_ctx['lead_budget']}")
    if call_ctx.get("lead_location"):      parts.append(f"Location preference: {call_ctx['lead_location']}")
    if call_ctx.get("lead_property_type"): parts.append(f"Looking for: {call_ctx['lead_property_type']}")
    if call_ctx.get("previous_objections"):
        obj = call_ctx["previous_objections"]
        if obj: parts.append(f"Previous concern: {obj[0]}")
    if not parts:
        return ""
    return "\nPREVIOUS CONTEXT:\n" + "\n".join(parts)


def build_greeting(lead_name: str = "", call_brief: dict | None = None) -> str:
    """The exact opening line the bot speaks. Spoken directly via TTS (no LLM
    round-trip) so the caller hears it ~1-2s after answering."""
    brief    = call_brief or {}
    tenant   = brief.get("tenant") or {}
    project  = brief.get("project") or {}
    call_ctx = brief.get("call_context") or {}
    company_name  = tenant.get("name") or "hamaari company"
    greeting_name = lead_name if lead_name and lead_name.lower() not in ("there", "customer", "") else "aap"
    project_name  = project.get("name") or "hamare project"
    if call_ctx.get("call_type") == "follow_up":
        return (f"Namaste {greeting_name} ji, main {company_name} se baat kar rahi hoon. "
                f"Yeh call quality ke liye record ho sakti hai. "
                f"Pichli baar aapne {project_name} ke baare mein baat ki thi — kya abhi ek minute hai?")
    return (f"Namaste {greeting_name} ji, main {company_name} se baat kar rahi hoon. "
            f"Yeh call quality ke liye record ho sakti hai. "
            f"Aapne {project_name} ke liye enquiry ki thi — kya abhi ek minute hai?")


def build_system_prompt(lead_name: str = "", call_brief: dict | None = None) -> str:
    brief      = call_brief or {}
    tenant     = brief.get("tenant") or {}
    project    = brief.get("project") or {}
    call_ctx   = brief.get("call_context") or {}
    products   = brief.get("initial_products") or []
    rules      = brief.get("rules") or {}

    company_name  = tenant.get("name") or "hamaari company"
    max_products  = rules.get("max_products_to_pitch", 3)

    opening = (
        'NOTE: You have ALREADY spoken this greeting to the caller:\n'
        f'"{build_greeting(lead_name, call_brief)}"\n'
        'Do NOT repeat it. Continue the conversation from the caller\'s response.'
    )

    calling_rules_text = ""
    rules_src = project.get("calling_rules") or tenant.get("calling_rules") or ""
    if rules_src:
        calling_rules_text = f"\nCALLING RULES:\n{rules_src[:300]}"

    brand_voice = tenant.get("brand_voice") or ""
    brand_hint  = f"\nTONE: {brand_voice[:150]}" if brand_voice else ""

    prev_context    = _format_previous_context(call_ctx)
    product_section = _format_product_list(products)

    return f"""\
Aap {company_name} ke liye ek friendly aur professional female sales representative hain.
Aap {company_name} ki taraf se call kar rahi hain.

{opening}

IDENTITY RULE:
- Kabhi mat kaho ki aap koi AI tool ya CortexFlow se hain.
- Aap sirf {company_name} se hain — yahi batao.

Current date/time: {_get_ist_now()}
{prev_context}

SALES FLOW (ek ek step follow karo):
1. Greeting bol kar confirm karo ki woh available hain
2. Inquiry ya follow-up context naturally mention karo
3. Unki requirement poochho (location, type, budget, timeline) — EK sawaal at a time
4. 1-2 best matching products suggest karo (max {max_products} products)
5. Objection handle karo: acknowledge -> clarify -> reframe -> push action
6. Site visit / appointment / callback goal confirm karo
7. Call politely wrap karo aur end_call() tool call karo

QUALIFICATION QUESTIONS (ek ek poochho):
- "Aap kaun sa area prefer karte hain?"
- "Kaun sa property type chahiye - 2BHK, 3BHK, ya kuch aur?"
- "Budget kya hai approximate?"
- "Possession timeline kya hai?"

OBJECTION HANDLING:
- "Price high hai" -> "Samajh sakti hoon. Aapka comfortable range kya hai?"
- "Sochna hai" -> "Bilkul. Kya main kal callback dun, ya site visit karenge?"
- "Interested nahi" -> "Theek hai. Kya koi specific reason hai? Shayad better option bataa sakti hoon."
- "Busy hoon" -> "No problem. Kab convenient rahega - subah ya shaam?"

LANGUAGE: Default Hindi/Hinglish. Caller English mein bole toh English mein jawab do.

PACING (CRITICAL):
- Ek baar mein SIRF ek chhota sentence bolo (1 line, max 12-15 shabd).
- Ek sawaal ek baar - multiple sawaal ek saath nahi.
- Caller ne jo kaha use REPEAT ya confirm-back MAT karo. Jaise "aap 1BHK chahte
  hain" ya "Chembur area mein property chahiye" — aisa dohraao mat. Sidha aage
  badho: agla sawaal poochho ya seedha jawab do.
- Agar caller ki baat samajh na aaye toh halke se poochho "Maaf kijiye, dobara
  bata sakte hain?" — galat guess karke aage mat badho.
- User bole toh sunti raho - beech mein mat bolo.
- ALWAYS use FEMALE forms: "rahi hoon", "karti hoon", "sakti hoon", "deti hoon".
  NEVER say "raha hoon", "karta hoon", "sakta hoon".
{calling_rules_text}{brand_hint}{product_section}

CALLBACK vs APPOINTMENT:
- CALLBACK = "baad mein call karo", "busy hoon" -> end_call(outcome='callback')
- APPOINTMENT = specific date+time confirmed -> book_appointment() then end_call()

CALL ENDING: Jab bhi baat khatam ho (kisi bhi reason se), TURANT end_call() call karo."""


# ── Tool schemas (OpenAI function format) ────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_project_products",
            "description": (
                "Search for project products/properties matching the lead's requirements. "
                "Use when lead specifies a requirement not in initial list or asks for more options. "
                "DO NOT call for every message."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query":         {"type": "string"},
                    "location":      {"type": "string"},
                    "property_type": {"type": "string"},
                    "possession":    {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_lead_memory",
            "description": "Save what you learned about the lead. Call during or just before ending the call.",
            "parameters": {
                "type": "object",
                "properties": {
                    "budget":             {"type": "string"},
                    "preferred_location": {"type": "string"},
                    "property_type":      {"type": "string"},
                    "timeline":           {"type": "string"},
                    "interest_level":     {"type": "string"},
                    "objection":          {"type": "string"},
                    "callback_time":      {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": (
                "Book a formal meeting. ONLY call when lead explicitly agrees to specific date AND time. "
                "Do NOT call for callbacks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_iso": {"type": "string", "description": "ISO 8601 +05:30 format"},
                    "notes":           {"type": "string"},
                },
                "required": ["appointment_iso"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "end_call",
            "description": (
                "End the call. ALWAYS call at end of conversation. "
                "Call ONLY after speaking your farewell sentence."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "outcome": {
                        "type": "string",
                        "enum": ["appointment_booked", "callback", "interested", "not_interested", "unknown"],
                    },
                    "interest_level":     {"type": "string"},
                    "budget_mentioned":   {"type": "string"},
                    "location_mentioned": {"type": "string"},
                    "objection":          {"type": "string"},
                },
                "required": ["outcome"],
            },
        },
    },
]


# ── Backend API helpers ───────────────────────────────────────────────────────

async def _call_backend(path: str, payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{BACKEND_URL}/v1/calls/tools/{path}",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json=payload,
            )
            return res.json()
    except Exception as exc:
        logger.warning(f"[bot] backend /tools/{path} failed: {exc}")
        return {}


async def notify_backend(
    call_id: str, lead_id: str, tenant_id: str,
    transcript: str, duration_s: int,
    summary: str, outcome: str,
    appointment_requested: bool, proposed_appointment_iso: str | None,
) -> None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{BACKEND_URL}/v1/calls/result",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json={
                    "tenant_id":               tenant_id,
                    "lead_id":                 lead_id,
                    "call_id":                 call_id,
                    "transcript":              transcript,
                    "summary":                 summary,
                    "outcome":                 outcome,
                    "duration_seconds":        duration_s,
                    "appointment_requested":   appointment_requested,
                    "proposed_appointment_iso": proposed_appointment_iso,
                },
            )
        logger.info(f"[bot] notify_backend call_id={call_id} http={res.status_code}")
    except Exception as exc:
        logger.error(f"[bot] notify_backend failed: {exc}")


# ── Transcript helpers ────────────────────────────────────────────────────────

_HINDI_STOPWORDS = frozenset([
    "main", "hoon", "aap", "kya", "hai", "nahi", "mujhe", "humara",
    "theek", "bilkul", "shukriya", "lekin", "bahut", "abhi", "ji",
    "haan", "agar", "toh", "bhi", "aur", "samajh",
])


def _needs_translation(text: str) -> bool:
    for ch in text:
        name = unicodedata.name(ch, "")
        if any(s in name for s in ("DEVANAGARI", "ARABIC", "BENGALI", "GUJARATI", "GURMUKHI")):
            return True
    return len(set(text.lower().split()) & _HINDI_STOPWORDS) >= 3


async def _normalize_transcript(transcript: str) -> str:
    if not transcript.strip() or not _needs_translation(transcript):
        return transcript
    try:
        import openai as _openai
        client = _openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        resp = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": (
                    "Translate this sales call transcript entirely into English. "
                    "Keep speaker labels (Customer:, AI:) as-is. Output only the translated transcript."
                )},
                {"role": "user", "content": transcript},
            ],
            max_tokens=2000, temperature=0,
        )
        return resp.choices[0].message.content or transcript
    except Exception as exc:
        logger.warning(f"[bot] transcript translation failed: {exc}")
        return transcript


async def _summarize_call(transcript: str, call_id: str) -> dict:
    if not transcript.strip():
        return {"summary": "", "outcome": "unknown", "appointment_requested": False, "proposed_appointment_iso": None}
    try:
        import openai as _openai
        client = _openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        resp = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "user", "content": (
                'Analyze this sales call transcript and respond ONLY with JSON:\n'
                '{"summary":"2-3 sentences","outcome":"interested|not_interested|callback|appointment_booked|no_response|unknown","appointment_requested":true|false,"proposed_appointment_iso":null}\n\n'
                f"Transcript:\n{transcript}"
            )}],
            response_format={"type": "json_object"},
            max_tokens=300,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.error(f"[bot] summarize failed: {exc}")
        return {"summary": "", "outcome": "unknown", "appointment_requested": False, "proposed_appointment_iso": None}


def _build_transcript(context: LLMContext, skip_trigger: str = ".") -> str:
    lines = []
    for msg in context.get_messages():
        role    = msg.get("role", "")
        content = msg.get("content", "") or ""
        if isinstance(content, list):
            continue  # Skip tool call results
        content = content.strip()
        if not content or role == "system":
            continue
        if role == "user" and content == skip_trigger:
            continue  # Skip the silent greeting trigger
        if role == "user":
            lines.append(f"Customer: {content}")
        elif role == "assistant":
            lines.append(f"AI: {content}")
    return "\n".join(lines)


# ── STT + turn-taking builder ─────────────────────────────────────────────────

def _build_stt_and_turn():
    """Return (stt_service, user_turn_strategies, audio_in_sample_rate).

    Two modes, selected via STT_MODE:

      nova  → Deepgram nova-3 streaming STT + a VAD-driven
              SpeechTimeoutUserTurnStopStrategy. No Smart Turn model (which is
              English-biased and needs 16kHz), so it's reliable for Hinglish
              telephony at native 8kHz.

      flux  → Deepgram Flux (flux-general-multi, auto-detect language). Flux
              detects turns itself and broadcasts UserStarted/StoppedSpeaking,
              so we use ExternalUserTurnStrategies. Runs at 16kHz.
    """
    api_key = os.getenv("DEEPGRAM_API_KEY", "")

    if STT_MODE == "flux":
        from pipecat.services.deepgram.flux.stt import DeepgramFluxSTTService
        from pipecat.turns.user_turn_strategies import ExternalUserTurnStrategies

        stt = DeepgramFluxSTTService(
            api_key=api_key,
            settings=DeepgramFluxSTTService.Settings(
                model="flux-general-multi",
                eot_threshold=0.7,
            ),
        )
        return stt, ExternalUserTurnStrategies(), 16000

    # Default: nova-3 + VAD SpeechTimeout (Option B).
    from pipecat.turns.user_turn_strategies import UserTurnStrategies
    from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy

    stt = DeepgramSTTService(
        api_key=api_key,
        live_options=LiveOptions(
            model="nova-3-general",
            language="multi",
            encoding="linear16",
            sample_rate=8000,
            channels=1,
            interim_results=True,
            smart_format=True,
            punctuate=True,
            endpointing=100,   # ms of silence Deepgram waits before finalizing
        ),
    )
    turn_strategies = UserTurnStrategies(
        stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.6)],
    )
    return stt, turn_strategies, 8000


# ── Bot entry point ───────────────────────────────────────────────────────────

async def bot(runner_args: RunnerArguments) -> None:
    """Main Pipecat bot — Telnyx Call Control bidirectional media streaming.

    Uses Pipecat's built-in TelnyxFrameSerializer, which speaks Telnyx's JSON
    `media` event protocol (base64 µ-law) in both directions. This pairs with
    streaming_start configured as stream_bidirectional_mode="rtp" in server.py.
    """
    ws   = runner_args.websocket
    body: dict = runner_args.body or {}

    call_id         = body.get("call_id", "unknown")
    lead_id         = body.get("lead_id", "")
    tenant_id       = body.get("tenant_id", "")
    lead_name       = body.get("lead_name", "")
    call_brief      = body.get("call_brief") or {}

    # ── Telnyx handshake: read "connected" + "start" events from the WS ────────
    try:
        _transport_type, call_data = await parse_telephony_websocket(ws)
    except Exception as exc:
        logger.warning(f"[bot] handshake parse failed: {exc}")
        return

    stream_id         = call_data.get("stream_id", "")
    call_control_id   = body.get("call_control_id") or call_data.get("call_control_id", "")
    outbound_encoding = call_data.get("outbound_encoding", "PCMU")

    logger.info(
        f"[bot] call_id={call_id} lead={lead_name!r} stream_id={stream_id} "
        f"cc_id={call_control_id[:24]}... "
        f"products={len(call_brief.get('initial_products') or [])}"
    )

    # ── Serializer: Pipecat-native Telnyx protocol (JSON base64 µ-law media) ────
    # auto_hang_up=True (default) hangs up the Telnyx call on End/Cancel frames.
    serializer = TelnyxFrameSerializer(
        stream_id=stream_id,
        call_control_id=call_control_id,
        outbound_encoding=outbound_encoding,
        inbound_encoding="PCMU",
        api_key=os.getenv("TELNYX_API_KEY", ""),
    )

    # ── WebSocket transport ────────────────────────────────────────────────────
    transport = FastAPIWebsocketTransport(
        websocket=ws,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    # ── AI services ───────────────────────────────────────────────────────────
    # STT + turn-taking strategy (see _build_stt_and_turn / STT_MODE).
    stt, user_turn_strategies, audio_in_rate = _build_stt_and_turn()
    logger.info(f"[bot] STT_MODE={STT_MODE} audio_in_rate={audio_in_rate}")

    llm = OpenAILLMService(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    )

    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY", ""),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "Ukfq9vQ0QNLZ4MGK0Uxc"),
        model=os.getenv("ELEVENLABS_MODEL", "eleven_turbo_v2_5"),
    )

    # ── LLM context ───────────────────────────────────────────────────────────
    system_prompt = build_system_prompt(lead_name=lead_name, call_brief=call_brief)
    context = LLMContext()
    context.add_message({"role": "system", "content": system_prompt})
    context.set_tools(ToolsSchema(standard_tools=[
        FunctionSchema(
            name=t["function"]["name"],
            description=t["function"]["description"],
            properties=t["function"]["parameters"].get("properties", {}),
            required=t["function"]["parameters"].get("required", []),
        ) for t in TOOLS
    ]))

    # ── Call state ─────────────────────────────────────────────────────────────
    state = {
        "started_at":        time.monotonic(),
        "outcome":           "unknown",
        "appointment_iso":   None,
        "appointment_notes": "",
        "idle_prompts":      0,
        "done":              asyncio.Event(),
    }

    # Silero VAD is kept in both modes for interruption (barge-in) handling and
    # STT metrics. Turn-taking itself is driven by user_turn_strategies:
    #   nova → SpeechTimeoutUserTurnStopStrategy (VAD silence + 0.6s timeout)
    #   flux → ExternalUserTurnStrategies (Deepgram Flux signals end-of-turn)
    # user_idle_timeout drives built-in idle detection → escalating re-prompts.
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            user_turn_strategies=user_turn_strategies,
            vad_analyzer=SileroVADAnalyzer(
                params=VADParams(
                    confidence=0.7,
                    start_secs=0.2,
                    stop_secs=0.2,
                    min_volume=0.5,
                ),
            ),
            user_idle_timeout=IDLE_TIMEOUT_S,
        ),
    )

    # ── Pipeline ───────────────────────────────────────────────────────────────
    pipeline = Pipeline([
        transport.input(),
        stt,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=audio_in_rate,
            audio_out_sample_rate=8000,
            enable_metrics=True,
        ),
    )

    # ── Project / tenant helpers ───────────────────────────────────────────────
    project_id = (
        (call_brief.get("project") or {}).get("id") or
        (call_brief.get("_meta") or {}).get("lead_project_id") or ""
    )

    # ── Graceful call ending ───────────────────────────────────────────────────
    # Speak a short, human-like farewell and THEN queue EndTaskFrame. Frames flow
    # in order, so the pipeline drains the farewell audio before shutting down —
    # the caller is never cut off mid-sentence (no hard task.cancel()).

    async def _graceful_end(farewell: str):
        if state["done"].is_set():
            return
        state["done"].set()
        try:
            await task.queue_frames([TTSSpeakFrame(farewell), EndTaskFrame()])
        except Exception as exc:
            logger.warning(f"[bot] graceful end failed, forcing cancel: {exc}")
            try:
                await task.cancel()
            except Exception:
                pass

    # ── Tool handlers ──────────────────────────────────────────────────────────

    async def handle_search_products(fn_name, tool_call_id, args, llm_svc, ctx, result_cb):
        filters = {}
        if args.get("location"):      filters["location"]         = args["location"]
        if args.get("property_type"): filters["property_type"]    = args["property_type"]
        if args.get("possession"):    filters["possession_status"] = args["possession"]

        result   = await _call_backend("search-products", {
            "project_id": project_id,
            "tenant_id":  tenant_id,
            "filters":    filters,
            "query":      args.get("query", ""),
        })
        products = result.get("products", [])
        if not products:
            await result_cb("Is filter ke saath koi matching property nahi mili.")
            return
        lines = ["Yeh options available hain:"]
        for i, p in enumerate(products[:3], 1):
            parts = [f"{i}. {p.get('name', 'Property')}"]
            if p.get("type"):       parts.append(f"Type: {p['type']}")
            if p.get("location"):   parts.append(f"Location: {p['location']}")
            if p.get("price"):      parts.append(f"Price: {p['price']}")
            if p.get("possession"): parts.append(f"Possession: {p['possession']}")
            lines.append(" | ".join(parts))
        await result_cb("\n".join(lines))

    async def handle_update_lead_memory(fn_name, tool_call_id, args, llm_svc, ctx, result_cb):
        await _call_backend("update-lead-memory", {
            "lead_id":            lead_id,
            "tenant_id":          tenant_id,
            "project_id":         project_id or None,
            "budget":             args.get("budget") or None,
            "preferred_location": args.get("preferred_location") or None,
            "property_type":      args.get("property_type") or None,
            "timeline":           args.get("timeline") or None,
            "interest_level":     args.get("interest_level") or None,
            "objection":          args.get("objection") or None,
            "callback_time":      args.get("callback_time") or None,
        })
        await result_cb("Notes saved.")

    async def handle_book_appointment(fn_name, tool_call_id, args, llm_svc, ctx, result_cb):
        state["appointment_iso"]   = args.get("appointment_iso")
        state["appointment_notes"] = args.get("notes", "")
        state["outcome"]           = "appointment_booked"
        logger.info(f"[bot] appointment booked iso={state['appointment_iso']}")
        await result_cb("Appointment CRM mein save ho gaya.")

    async def handle_end_call(fn_name, tool_call_id, args, llm_svc, ctx, result_cb):
        if state["outcome"] == "unknown":
            state["outcome"] = args.get("outcome", "unknown")

        asyncio.create_task(_call_backend("update-lead-memory", {
            "lead_id":            lead_id,
            "tenant_id":          tenant_id,
            "interest_level":     args.get("interest_level") or None,
            "budget":             args.get("budget_mentioned") or None,
            "preferred_location": args.get("location_mentioned") or None,
            "objection":          args.get("objection") or None,
            "last_outcome":       state["outcome"],
        }))

        logger.info(f"[bot] end_call outcome={state['outcome']}")

        # Don't let the LLM generate another turn after this tool result — we
        # speak a controlled farewell and end gracefully ourselves.
        await result_cb(
            {"ended": True},
            properties=FunctionCallResultProperties(run_llm=False),
        )
        await _graceful_end(FAREWELL_TEXT)

    llm.register_function("search_project_products", handle_search_products)
    llm.register_function("update_lead_memory",      handle_update_lead_memory)
    llm.register_function("book_appointment",        handle_book_appointment)
    llm.register_function("end_call",               handle_end_call)

    # ── Idle / silence handling ─────────────────────────────────────────────────
    # Pipecat's built-in idle detection (user_idle_timeout) fires on_user_turn_idle
    # after the caller is silent. Instead of silently hanging up, we re-engage with
    # escalating prompts, then end gracefully — matching how production voice agents
    # (Vapi idle-messages, etc.) handle unwanted silence.

    TRIGGER_MSG = "."

    IDLE_PROMPTS = [
        "Hello, kya aap mujhe sun paa rahe hain?",
        "Koi baat nahi, main yahin hoon — jab aap ready hon toh bata dijiye.",
    ]

    @user_aggregator.event_handler("on_user_turn_started")
    async def on_user_turn_started(aggregator, strategy):
        # Caller spoke — reset the idle re-prompt counter.
        state["idle_prompts"] = 0

    @user_aggregator.event_handler("on_user_turn_idle")
    async def on_user_turn_idle(aggregator):
        n = state["idle_prompts"]
        if n < len(IDLE_PROMPTS):
            state["idle_prompts"] = n + 1
            logger.info(f"[bot] caller idle — re-prompt #{n + 1}")
            await task.queue_frames([TTSSpeakFrame(IDLE_PROMPTS[n])])
            return
        # Out of re-prompts — end the call gracefully (farewell then drain).
        logger.info("[bot] caller idle after re-prompts — ending (no_response)")
        if state["outcome"] == "unknown":
            state["outcome"] = "no_response"
        await _graceful_end("Theek hai, main baad mein call karti hoon. Dhanyavaad!")

    # ── Transport events ───────────────────────────────────────────────────────

    greeting_text = build_greeting(lead_name=lead_name, call_brief=call_brief)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"[bot] Client connected — speaking greeting instantly call_id={call_id}")
        # Speak the fixed greeting straight through TTS — no LLM round-trip, so
        # first audio reaches the caller ~1-2s after answer instead of ~4s.
        await task.queue_frames([TTSSpeakFrame(greeting_text)])
        # Seed context so the LLM knows it already greeted and continues naturally.
        context.add_message({"role": "assistant", "content": greeting_text})

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"[bot] Client disconnected call_id={call_id}")
        state["done"].set()
        try:
            await task.cancel()
        except Exception:
            pass

    # ── Max duration guard ─────────────────────────────────────────────────────

    async def _max_duration_guard():
        await asyncio.sleep(MAX_CALL_S)
        if state["done"].is_set():
            return
        logger.info(f"[bot] Max duration {MAX_CALL_S}s — ending")
        state["outcome"] = "timeout"
        await _graceful_end("Maaf kijiye, ab mujhe call samaapt karni hogi. Aapka din shubh ho!")
        # Hard backstop in case the graceful drain stalls.
        await asyncio.sleep(10)
        try:
            await task.cancel()
        except Exception:
            pass

    asyncio.create_task(_max_duration_guard())

    # ── Run pipeline ───────────────────────────────────────────────────────────

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(task)
    except Exception as exc:
        logger.warning(f"[bot] pipeline ended: {exc}")

    # ── Post-call: transcript + notify backend ────────────────────────────────

    duration_s     = int(time.monotonic() - state["started_at"])
    raw_transcript = _build_transcript(context, skip_trigger=TRIGGER_MSG)
    transcript     = await _normalize_transcript(raw_transcript)

    logger.info(f"[bot] call_id={call_id} duration={duration_s}s outcome={state['outcome']}")

    if state["appointment_iso"]:
        summary_data = {
            "summary":                f"Appointment booked: {state['appointment_iso']}",
            "outcome":                "appointment_booked",
            "appointment_requested":  True,
            "proposed_appointment_iso": state["appointment_iso"],
        }
    else:
        summary_data = await _summarize_call(transcript, call_id)
        if state["outcome"] != "unknown":
            summary_data["outcome"] = state["outcome"]

    await notify_backend(
        call_id=call_id,
        lead_id=lead_id,
        tenant_id=tenant_id,
        transcript=transcript,
        duration_s=duration_s,
        summary=summary_data.get("summary", ""),
        outcome=summary_data.get("outcome", "unknown"),
        appointment_requested=bool(summary_data.get("appointment_requested", False)),
        proposed_appointment_iso=summary_data.get("proposed_appointment_iso"),
    )
