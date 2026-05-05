#!/usr/bin/env python3
"""
CortexFlow AI Voice Agent — LiveKit Agents 1.x  |  V3 Calling Stack

Two modes via AGENT_MODE env var:
  realtime (default) — OpenAI Realtime API: single WebSocket, ~300ms latency
  groq               — Groq LLM + Deepgram STT/TTS: ~600ms latency, cheaper

V3 Improvements:
  - Tenant-branded identity (never says "CortexFlow")
  - Compact call_brief context (not full KB dump)
  - Fresh vs follow-up awareness with previous context
  - Runtime product search tool (scoped to project)
  - Lead memory update tool
  - Filler phrases during tool latency
  - Silence handling state machine
  - Tuned VAD / barge-in thresholds
  - Sales playbook + objection handling framework
  - Human pacing (one question at a time)
  - Analytics logging
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Annotated, Optional
from zoneinfo import ZoneInfo
import random

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

AGENT_MODE        = os.getenv("AGENT_MODE", "realtime").lower()
MAX_CALL_S        = int(os.getenv("MAX_CALL_DURATION_S", "300"))
VOICE_SERVICE_URL = os.getenv("VOICE_SERVICE_URL", "http://localhost:5000").rstrip("/")
VOICE_SECRET      = os.getenv("VOICE_SECRET", "")
LK_HTTP_URL       = (os.getenv("LIVEKIT_URL", "ws://localhost:7880")
                     .replace("wss://", "https://").replace("ws://", "http://"))
LK_KEY            = os.getenv("LIVEKIT_API_KEY", "")
LK_SECRET         = os.getenv("LIVEKIT_API_SECRET", "")

# Silence handling thresholds (seconds)
SILENCE_FILLER_S  = float(os.getenv("SILENCE_FILLER_S", "4"))    # say filler
SILENCE_WARN_S    = float(os.getenv("SILENCE_WARN_S", "8"))       # warn and offer callback
SILENCE_HANGUP_S  = float(os.getenv("SILENCE_HANGUP_S", "13"))   # end call

# Filler phrases for tool lookup latency
FILLERS_TOOL = [
    "Ji, ek second...",
    "Main check karta hoon...",
    "Haan, dekhte hain...",
    "Bilkul, abhi batata hoon...",
]

FILLERS_TRANSITION = [
    "Samjha.",
    "Bilkul.",
    "Haan haan.",
    "Theek hai.",
]


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


# ─── instruction builder ──────────────────────────────────────────────────────

def _format_product_list(products: list) -> str:
    """Format product list compactly for the prompt."""
    if not products:
        return ""
    lines = ["\n━━ PROPERTIES TO DISCUSS ━━"]
    lines.append("Sirf niche diye products pitch karo. Koi product invent mat karo.\n")
    for i, p in enumerate(products[:5], 1):
        parts = [f"{i}. {p.get('name', 'Property')}"]
        if p.get("property_type"): parts.append(f"   Type: {p['property_type']}")
        if p.get("location"):      parts.append(f"   Location: {p['location']}")
        if p.get("price_range"):   parts.append(f"   Price: {p['price_range']}")
        if p.get("size"):          parts.append(f"   Size: {p['size']}")
        if p.get("possession_status"): parts.append(f"   Possession: {p['possession_status']}")
        lines.append("\n".join(parts))
    lines.append("\nIMPORTANT: Do NOT mention products not listed above. If asked about more options, use search_project_products tool.")
    return "\n".join(lines)


def _format_previous_context(call_ctx: dict) -> str:
    """Build a natural previous call context hint."""
    if call_ctx.get("call_type") != "follow_up":
        return ""
    parts = []
    if call_ctx.get("last_summary"):
        parts.append(f"Pichli baat: {call_ctx['last_summary']}")
    if call_ctx.get("lead_budget"):
        parts.append(f"Budget: {call_ctx['lead_budget']}")
    if call_ctx.get("lead_location"):
        parts.append(f"Location preference: {call_ctx['lead_location']}")
    if call_ctx.get("lead_property_type"):
        parts.append(f"Looking for: {call_ctx['lead_property_type']}")
    if call_ctx.get("previous_objections"):
        objections = call_ctx["previous_objections"]
        if objections:
            parts.append(f"Previous concern: {objections[0]}")
    if not parts:
        return ""
    return "\nPREVIOUS CONTEXT:\n" + "\n".join(parts)


def build_instructions(
    lead_name: str = "",
    call_brief: dict | None = None,
    mode: str = "groq",
) -> str:
    """
    Build the agent's system prompt from a compact call_brief.
    No huge KB dump — just focused, actionable instructions.
    """
    # ── Extract from call_brief ───────────────────────────────────────────────
    lead      = (call_brief or {}).get("lead") or {}
    tenant    = (call_brief or {}).get("tenant") or {}
    project   = (call_brief or {}).get("project") or {}
    call_ctx  = (call_brief or {}).get("call_context") or {}
    products  = (call_brief or {}).get("initial_products") or []
    rules     = (call_brief or {}).get("rules") or {}

    # Identity — NEVER say CortexFlow; always say tenant company name
    company_name = tenant.get("name") or "hamaari company"
    greeting_name = lead_name if lead_name and lead_name.lower() not in ("there", "customer", "") else "aap"
    project_name  = project.get("name") or ""
    inquiry_text  = lead.get("inquiry") or ""

    # Call type: fresh vs follow-up
    call_type = call_ctx.get("call_type", "fresh")
    is_followup = call_type == "follow_up"

    # Build dynamic opening greeting
    if mode == "realtime":
        if is_followup:
            opening = (
                f'\nIMPORTANT: Start with this EXACT greeting and then WAIT for response: '
                f'"Namaste {greeting_name} ji, main {company_name} se baat kar raha hoon. '
                f'Pichli baar aapne {project_name or "hamare project"} ke baare mein baat ki thi — '
                f'kya abhi ek minute hai?" '
                f'Greeting ke baad BILKUL CHUP raho.'
            )
        else:
            opening = (
                f'\nIMPORTANT: Start with this EXACT greeting and then WAIT for response: '
                f'"Namaste {greeting_name} ji, main {company_name} se baat kar raha hoon. '
                f'Aapne {project_name or "hamare project"} ke liye enquiry ki thi — '
                f'kya abhi ek minute hai?" '
                f'Greeting ke baad BILKUL CHUP raho.'
            )
    else:
        opening = ""

    # Calling rules (keep compact — first 300 chars only)
    calling_rules_text = ""
    rules_src = project.get("calling_rules") or tenant.get("calling_rules") or ""
    if rules_src:
        calling_rules_text = f"\nCALLING RULES:\n{rules_src[:300]}"

    # Brand voice hint
    brand_voice = tenant.get("brand_voice") or ""
    brand_hint  = f"\nTONE: {brand_voice[:150]}" if brand_voice else ""

    # Previous context for follow-ups
    prev_context = _format_previous_context(call_ctx)

    # Product list
    product_section = _format_product_list(products)

    # Max products rule
    max_products = rules.get("max_products_to_pitch", 3)

    return f"""\
Aap {company_name} ke liye ek friendly aur professional sales representative hain.
Aap {company_name} ki taraf se call kar rahe hain.{opening}

IMPORTANT IDENTITY RULE:
- Kabhi mat kaho ki aap koi AI tool ya CortexFlow se hain.
- Aap {company_name} se baat kar rahe hain — yahi batao.

Current date/time: {get_ist_datetime()}
{prev_context}
SALES FLOW (ek ek step follow karo):
1. Greet karo, confirm karo ki woh available hain (if yes, aage badho)
2. Inquiry ya follow-up context naturally mention karo
3. Unki requirement poochho (location, type, budget, timeline) — ek sawaal at a time
4. 1-2 best matching products suggest karo (max {max_products} products pitch karo)
5. Objection handle karo with: acknowledge → clarify → reframe → push action
6. Site visit / appointment / callback goal: specific time confirm karo
7. Call politely wrap up karo aur end_call() tool call karo

QUALIFICATION QUESTIONS (ek ek poochho, sab ek saath nahi):
- "Aap kaun sa area prefer karte hain?"
- "Kaun sa property type chahiye — 2BHK, 3BHK, ya kuch aur?"
- "Budget kya hai approximate?"
- "Possession timeline kya hai — ready to move chahiye ya 2025-26 mein?"

OBJECTION HANDLING FRAMEWORK:
- "Price high hai" → "Samajh sakta hoon sir. Aapka comfortable range kya hai? Main best option suggest karta hoon."
- "Sochna hai" → "Bilkul sir. Kya main kal aapko callback dun, ya aap site visit karenge?"
- "Interested nahi" → "Theek hai sir. Kya koi specific reason hai? Shayad main koi better option bataa sakta hoon."
- "Busy hoon" → "No problem sir. Kab convenient rahega — subah ya shaam?"
- "Already dekh raha hoon" → "Great sir! Humara project bhi dekh lijiye — comparison mein helpful rahega."

LANGUAGE RULE: Always respond in English only. Do NOT switch to Hindi, Urdu, or any other language even if the caller speaks in Hindi or another language. Stay professional and clear in English throughout the entire call.

PACING RULES:
- Ek sawaal ek baar — ek saath multiple sawaal mat poochho.
- Short replies: max 2-3 sentences per turn.
- User bole toh sunoo — beech mein mat bolo.
- Tool call ke time: filler phrase pehle bolne ke baad tool call karo.
{calling_rules_text}{brand_hint}{product_section}

━━━ CALLBACK vs APPOINTMENT — IMPORTANT ━━━

CALLBACK = Lead ne kaha "baad mein call karo", "ek ghante mein", "busy hoon" → end_call(outcome='callback')
APPOINTMENT = Lead ne specific date/time confirm ki formal meeting ke liye → book_appointment() phir end_call()

━━━ CALL ENDING RULE ━━━
Jab bhi baat khatam ho (kisi bhi reason se), TURANT end_call() call karo."""


# ─── agent class ──────────────────────────────────────────────────────────────

class CortexFlowAgent(Agent):
    def __init__(
        self,
        lead_name: str,
        instructions: str,
        mode: str = "groq",
        call_brief: dict | None = None,
    ):
        super().__init__(instructions=instructions)
        self._lead_name   = lead_name
        self._mode        = mode
        self._call_brief  = call_brief or {}
        self._tenant_name = (self._call_brief.get("tenant") or {}).get("name") or "hamaari company"
        self._project_id  = ((self._call_brief.get("project") or {}).get("id") or
                              (self._call_brief.get("_meta") or {}).get("lead_project_id") or "")
        self._tenant_id   = (self._call_brief.get("tenant") or {}).get("id") or ""
        self._lead_id     = (self._call_brief.get("lead") or {}).get("id") or ""

        self._appointment: dict | None = None
        self._outcome: str             = "unknown"
        self._done        = asyncio.Event()

        # Analytics counters
        self._tool_call_count    = 0
        self._filler_count       = 0
        self._silence_count      = 0

        # Silence tracking
        self._last_user_speech_at: float = time.monotonic()
        self._silence_task: asyncio.Task | None = None

    async def on_enter(self) -> None:
        self._last_user_speech_at = time.monotonic()

        # Start silence monitor
        self._silence_task = asyncio.create_task(self._silence_monitor())

        if self._mode == "realtime":
            self.session.generate_reply()
        else:
            greeting_name = (
                self._lead_name
                if self._lead_name and self._lead_name.lower() not in ("there", "customer", "")
                else "aap"
            )
            call_ctx = self._call_brief.get("call_context") or {}
            project  = self._call_brief.get("project") or {}
            project_name = project.get("name") or "hamare project"
            is_followup  = call_ctx.get("call_type") == "follow_up"

            if is_followup:
                greeting = (
                    f"Namaste {greeting_name} ji, main {self._tenant_name} se baat kar raha hoon. "
                    f"Pichli baar {project_name} ke baare mein baat hui thi — kya abhi ek minute hai?"
                )
            else:
                greeting = (
                    f"Namaste {greeting_name} ji, main {self._tenant_name} se baat kar raha hoon. "
                    f"Aapne {project_name} ke liye enquiry ki thi — kya abhi ek minute hai?"
                )

            await self.session.say(greeting, allow_interruptions=True)

    # ── Silence monitor (Phase 15) ─────────────────────────────────────────────
    async def _silence_monitor(self) -> None:
        """Monitor for silence and respond appropriately."""
        try:
            while not self._done.is_set():
                await asyncio.sleep(1.0)
                elapsed = time.monotonic() - self._last_user_speech_at

                if elapsed >= SILENCE_HANGUP_S:
                    self._silence_count += 1
                    logger.info(f"[silence] {elapsed:.0f}s — hanging up (no_response)")
                    self._outcome = "no_response"
                    asyncio.create_task(self._end_with_silence())
                    break
                elif elapsed >= SILENCE_WARN_S:
                    self._silence_count += 1
                    logger.info(f"[silence] {elapsed:.0f}s — warning user")
                    try:
                        await self.session.say(
                            "Main baad mein call kar deta hoon. Aapka din shubh ho!",
                            allow_interruptions=True,
                        )
                        await asyncio.sleep(3)
                        self._outcome = "no_response"
                        self._done.set()
                    except Exception:
                        pass
                    break
                elif elapsed >= SILENCE_FILLER_S:
                    self._silence_count += 1
                    logger.info(f"[silence] {elapsed:.0f}s — sending filler")
                    try:
                        await self.session.say(
                            "Hello sir, meri awaaz aa rahi hai?",
                            allow_interruptions=True,
                        )
                        # Reset after filler so we don't spam
                        self._last_user_speech_at = time.monotonic()
                    except Exception:
                        pass
        except asyncio.CancelledError:
            pass

    async def _end_with_silence(self) -> None:
        try:
            await self.session.say(
                "Lagta hai line silent hai. Main baad mein call karta hoon. Dhanyavaad!",
                allow_interruptions=False,
            )
        except Exception:
            pass
        await asyncio.sleep(3)
        self._done.set()

    def _reset_silence_timer(self) -> None:
        self._last_user_speech_at = time.monotonic()

    # ── Tools (Phase 6) ────────────────────────────────────────────────────────

    @function_tool
    async def search_project_products(
        self,
        query: Annotated[
            str,
            "Natural language search query or filter description. "
            "Examples: '2BHK ready possession Thane', 'under 80 lakh budget', 'villa with garden'.",
        ] = "",
        location: Annotated[str, "Preferred location filter (optional)"] = "",
        property_type: Annotated[str, "Property type filter e.g. 2BHK, Villa, Plot (optional)"] = "",
        possession: Annotated[str, "Possession filter e.g. ready_to_move, under_construction (optional)"] = "",
    ) -> str:
        """Search for project products/properties matching the lead's requirements.
        Use this tool when:
        - Lead asks for more options
        - Lead specifies a requirement you don't have in your initial list
        - Lead asks about specific location, price, size, or possession timeline
        DO NOT call this for every message — only when you need new product info."""
        self._tool_call_count += 1
        self._filler_count += 1

        if not self._project_id or not self._tenant_id:
            return "Sorry, project information is not available right now."

        filters: dict = {}
        if location:     filters["location"]     = location
        if property_type: filters["property_type"] = property_type
        if possession:   filters["possession_status"] = possession

        try:
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.post(
                    f"{VOICE_SERVICE_URL}/voice/tools/search-products",
                    headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                    json={
                        "project_id": self._project_id,
                        "tenant_id": self._tenant_id,
                        "filters": filters,
                        "query": query,
                    },
                )
            data = res.json()
            products = data.get("products", [])
        except Exception as exc:
            logger.error(f"[tool:search_products] {exc}")
            return "Abhi product details fetch nahi ho pa rahi. Main manually check karke aapko batata hoon."

        if not products:
            return "Is filter ke saath koi matching property nahi mili. Kya aap requirement thodi flexible kar sakte hain?"

        lines = [f"Yeh options available hain (aapke requirement ke hisaab se):"]
        for i, p in enumerate(products[:3], 1):
            parts = [f"{i}. {p.get('name', 'Property')}"]
            if p.get("type"):       parts.append(f"Type: {p['type']}")
            if p.get("location"):   parts.append(f"Location: {p['location']}")
            if p.get("price"):      parts.append(f"Price: {p['price']}")
            if p.get("possession"): parts.append(f"Possession: {p['possession']}")
            lines.append(" | ".join(parts))
        return "\n".join(lines)

    @function_tool
    async def get_product_details(
        self,
        product_name: Annotated[str, "Name of the product/property to get details for"],
    ) -> str:
        """Get detailed information about a specific product/property.
        Use when lead asks for specific details: exact price, amenities, floor plan, etc."""
        self._tool_call_count += 1

        if not self._project_id or not self._tenant_id:
            return "Product details abhi available nahi hain."

        # Search products to find the matching one
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.post(
                    f"{VOICE_SERVICE_URL}/voice/tools/search-products",
                    headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                    json={
                        "project_id": self._project_id,
                        "tenant_id": self._tenant_id,
                        "filters": {},
                        "query": product_name,
                    },
                )
            data = res.json()
            products = data.get("products", [])
        except Exception as exc:
            logger.error(f"[tool:get_product_details] {exc}")
            return "Details abhi fetch nahi ho pa rahi."

        if not products:
            return f"'{product_name}' ke baare mein details nahi mili."

        p = products[0]
        parts = [f"{p.get('name', product_name)} ke details:"]
        if p.get("type"):       parts.append(f"Type: {p['type']}")
        if p.get("location"):   parts.append(f"Location: {p['location']}")
        if p.get("price"):      parts.append(f"Price: {p['price']}")
        if p.get("size"):       parts.append(f"Size: {p['size']}")
        if p.get("possession"): parts.append(f"Possession: {p['possession']}")
        if p.get("amenities"):  parts.append(f"Amenities: {p['amenities'][:200]}")
        return "\n".join(parts)

    @function_tool
    async def update_lead_memory(
        self,
        budget: Annotated[str, "Lead's stated budget (optional)"] = "",
        preferred_location: Annotated[str, "Lead's preferred location (optional)"] = "",
        property_type: Annotated[str, "Property type lead wants e.g. 2BHK, Villa (optional)"] = "",
        timeline: Annotated[str, "Purchase timeline (optional)"] = "",
        interest_level: Annotated[str, "Interest level: high, medium, low, not_interested"] = "",
        objection: Annotated[str, "Main objection raised by lead (optional)"] = "",
        callback_time: Annotated[str, "Time when lead wants to be called back (optional)"] = "",
    ) -> str:
        """Save what you learned about the lead during this call.
        Call this during or just before ending the call to capture key information.
        This memory will be used in future follow-up calls."""
        self._tool_call_count += 1

        if not self._lead_id or not self._tenant_id:
            return "Memory saved."

        try:
            async with httpx.AsyncClient(timeout=8) as client:
                await client.post(
                    f"{VOICE_SERVICE_URL}/voice/tools/update-lead-memory",
                    headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                    json={
                        "lead_id":           self._lead_id,
                        "tenant_id":         self._tenant_id,
                        "project_id":        self._project_id or None,
                        "budget":            budget or None,
                        "preferred_location": preferred_location or None,
                        "property_type":     property_type or None,
                        "timeline":          timeline or None,
                        "interest_level":    interest_level or None,
                        "objection":         objection or None,
                        "callback_time":     callback_time or None,
                    },
                )
        except Exception as exc:
            logger.warning(f"[tool:update_lead_memory] {exc}")

        return "Notes saved."

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
        """Book a FORMAL MEETING/APPOINTMENT for the lead.
        ONLY call when lead explicitly agrees to a scheduled meeting at a specific date AND time.
        Examples: 'Kal subah 10 baje meeting karte hain' ✓
        Do NOT call for callbacks ('call me later', 'ek ghante mein call karo') ✗"""
        self._appointment = {"iso": appointment_iso, "notes": notes}
        self._outcome     = "appointment_booked"
        logger.info(f"[tool:book_appointment] iso={appointment_iso}")

        # Save memory: appointment interest
        asyncio.create_task(self._save_appointment_memory())
        return "Appointment CRM mein save ho gaya."

    async def _save_appointment_memory(self) -> None:
        """Background: save appointment interest to lead memory."""
        try:
            if self._lead_id and self._tenant_id:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(
                        f"{VOICE_SERVICE_URL}/voice/tools/update-lead-memory",
                        headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                        json={
                            "lead_id":              self._lead_id,
                            "tenant_id":            self._tenant_id,
                            "interest_level":       "high",
                            "appointment_interest": True,
                        },
                    )
        except Exception:
            pass

    @function_tool
    async def end_call(
        self,
        outcome: Annotated[
            str,
            "Call outcome. One of:\n"
            "  'appointment_booked' — after book_appointment was called\n"
            "  'callback'           — lead asked to be called back later\n"
            "  'interested'         — interested but no next step set\n"
            "  'not_interested'     — not interested\n"
            "  'unknown'            — unclear outcome",
        ] = "unknown",
        interest_level: Annotated[
            str,
            "Lead interest level: high, medium, low, not_interested",
        ] = "",
        budget_mentioned: Annotated[str, "Budget if mentioned during call"] = "",
        location_mentioned: Annotated[str, "Location preference if mentioned"] = "",
        objection: Annotated[str, "Main objection if any"] = "",
    ) -> str:
        """End the call and signal the outcome.
        Always call this at the end — even if user hangs up naturally.
        IMPORTANT: Call ONLY after you have spoken your farewell sentence."""
        if self._outcome == "unknown":
            self._outcome = outcome
        logger.info(f"[tool:end_call] outcome={self._outcome}")

        # Save memory before hanging up
        if any([interest_level, budget_mentioned, location_mentioned, objection]):
            asyncio.create_task(self._final_memory_save(
                interest_level=interest_level,
                budget=budget_mentioned,
                location=location_mentioned,
                objection=objection,
                last_outcome=self._outcome,
            ))

        async def _schedule_hangup() -> None:
            await asyncio.sleep(4)
            self._done.set()

        asyncio.create_task(_schedule_hangup())
        return "Theek hai, aapka samay dene ke liye shukriya. Aapka din shubh ho!"

    async def _final_memory_save(self, **kwargs) -> None:
        """Background: final memory save on end_call."""
        try:
            if self._lead_id and self._tenant_id:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(
                        f"{VOICE_SERVICE_URL}/voice/tools/update-lead-memory",
                        headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                        json={
                            "lead_id":           self._lead_id,
                            "tenant_id":         self._tenant_id,
                            "project_id":        self._project_id or None,
                            "interest_level":    kwargs.get("interest_level") or None,
                            "budget":            kwargs.get("budget") or None,
                            "preferred_location": kwargs.get("location") or None,
                            "objection":         kwargs.get("objection") or None,
                            "last_outcome":      kwargs.get("last_outcome") or None,
                        },
                    )
        except Exception:
            pass


# ─── call result helpers ──────────────────────────────────────────────────────

async def summarize_call(transcript: str, call_id: str) -> dict:
    """Fallback summarizer when agent tools weren't used."""
    if not transcript.strip():
        return {"summary": "", "outcome": "unknown", "appointment_requested": False, "proposed_appointment_iso": None}
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        now_ist = get_ist_datetime()
        prompt = f"""Analyze this sales call transcript and respond ONLY with JSON:
{{
  "summary": "2-3 sentence summary in English",
  "outcome": "interested|not_interested|callback|appointment_booked|no_response|unknown",
  "appointment_requested": true|false,
  "proposed_appointment_iso": null
}}

Call time: {now_ist}

Callback = lead said "call me back", "ek ghante mein", "baad mein", "busy hoon" → outcome=callback
Appointment = lead confirmed specific meeting date+time → outcome=appointment_booked

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
        return {"summary": "", "outcome": "unknown", "appointment_requested": False, "proposed_appointment_iso": None}


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


async def log_analytics(agent: "CortexFlowAgent", call_id: str, duration_s: int, outcome: str) -> None:
    """Log call analytics (Phase 18)."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(
                f"{VOICE_SERVICE_URL}/voice/tools/log-analytics",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json={
                    "call_id":             call_id,
                    "tenant_id":           agent._tenant_id,
                    "project_id":          agent._project_id or None,
                    "lead_id":             agent._lead_id or None,
                    "talk_duration_seconds": duration_s,
                    "tool_call_count":     agent._tool_call_count,
                    "silence_count":       agent._silence_count,
                    "filler_phrase_count": agent._filler_count,
                    "appointment_booked":  agent._outcome == "appointment_booked",
                    "callback_scheduled":  agent._outcome == "callback",
                    "outcome":             outcome,
                },
            )
    except Exception as exc:
        logger.warning(f"[analytics:{call_id}] {exc}")


def _has_non_latin(text: str) -> bool:
    """Return True if text contains non-Latin script characters."""
    import unicodedata
    for ch in text:
        name = unicodedata.name(ch, "")
        if any(script in name for script in (
            "DEVANAGARI", "ARABIC", "URDU", "BENGALI", "GUJARATI",
            "GURMUKHI", "TAMIL", "TELUGU", "KANNADA", "MALAYALAM"
        )):
            return True
    return False


async def _normalize_transcript(transcript: str) -> str:
    """Phase 19: Normalize non-Latin transcript to English Latin script."""
    if not transcript.strip() or not _has_non_latin(transcript):
        return transcript

    logger.info("[transcript] Non-Latin script detected, normalizing...")
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        resp = await client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Translate the following call transcript fully into English. "
                        "All Hindi, Urdu, Hinglish, or any other language must be translated to natural English. "
                        "Keep speaker labels like 'Customer:' and 'AI:'. "
                        "Output only the translated transcript in English."
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
        from livekit.plugins.openai import realtime as lk_realtime
        return AgentSession(
            llm=lk_realtime.RealtimeModel(
                model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview"),
                voice=os.getenv("OPENAI_REALTIME_VOICE", "shimmer"),
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=0.7,
                # Phase 13: Tune turn detection to reduce false barge-ins from background noise
                turn_detection={
                    "type": "server_vad",
                    "threshold": float(os.getenv("VAD_THRESHOLD", "0.65")),
                    "prefix_padding_ms": int(os.getenv("VAD_PREFIX_PADDING_MS", "300")),
                    "silence_duration_ms": int(os.getenv("VAD_SILENCE_DURATION_MS", "700")),
                },
            )
        )

    logger.info(f"[agent:{call_id}] mode=groq (Groq LLM + Deepgram)")
    # Phase 13: Load Silero VAD with tuned threshold.
    # min_speech_duration / min_silence_duration may not exist in all plugin versions —
    # try with extra params first, fall back gracefully.
    vad_threshold = float(os.getenv("SILERO_VAD_THRESHOLD", "0.6"))
    try:
        vad = silero.VAD.load(
            threshold=vad_threshold,
            min_speech_duration=float(os.getenv("SILERO_MIN_SPEECH_MS", "200")) / 1000.0,
            min_silence_duration=float(os.getenv("SILERO_MIN_SILENCE_MS", "600")) / 1000.0,
        )
    except TypeError:
        # Older plugin version doesn't expose these params — threshold alone is sufficient
        logger.info("[agent] Silero VAD: using threshold-only mode (plugin version compat)")
        vad = silero.VAD.load(threshold=vad_threshold)
    return AgentSession(
        vad=vad,
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_MODEL", "nova-2"),
            language=os.getenv("DEEPGRAM_LANGUAGE", "hi"),
            interim_results=True,
            # Phase 13: Longer endpointing = wait for user to finish (not cut them off)
            endpointing_ms=int(os.getenv("DEEPGRAM_ENDPOINTING_MS", "600")),
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
        # Phase 13/14: Larger min_endpointing = agent waits longer before assuming user is done
        min_endpointing_delay=float(os.getenv("MIN_ENDPOINTING_DELAY", "0.5")),
        max_endpointing_delay=float(os.getenv("MAX_ENDPOINTING_DELAY", "1.5")),
    )


# ─── entrypoint ───────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    logger.info(f"[cortex-agent] job received room={ctx.room.name}")

    await ctx.connect()

    def _parse_meta(s: str | None) -> dict:
        try:
            return json.loads(s or "{}") if s else {}
        except Exception:
            return {}

    room_meta = _parse_meta(ctx.room.metadata)
    job_meta  = _parse_meta(ctx.job.metadata if hasattr(ctx, "job") and ctx.job else None)
    metadata  = {**job_meta, **room_meta}

    lead_name: str   = metadata.get("name", "")
    lead_id: str     = metadata.get("lead_id", "")
    tenant_id: str   = metadata.get("tenant_id", "")
    # V3: prefer call_brief; fallback to reconstructed kb_context for backward compatibility
    call_brief: dict | None = metadata.get("call_brief") or None
    kb_context: dict | None = metadata.get("kb_context") or None
    raw_room          = ctx.room.name
    call_id: str      = metadata.get(
        "call_id",
        raw_room.removeprefix("call-") if raw_room.startswith("call-") else raw_room,
    )
    sip_identity      = f"sip-{call_id}"

    # If no call_brief (legacy or fallback), reconstruct from kb_context for backward compat
    if not call_brief and kb_context:
        tenant_name = metadata.get("tenant_name", "")
        inquiry     = metadata.get("inquiry", "")
        call_brief = {
            "lead":    {"id": lead_id, "name": lead_name, "inquiry": inquiry},
            "tenant":  {"id": tenant_id, "name": tenant_name, **(kb_context.get("tenant") or {})},
            "project": kb_context.get("project") or None,
            "call_context": {"call_type": "fresh"},
            "initial_products": kb_context.get("products") or [],
            "rules": {"max_products_to_pitch": 3},
            "_meta":  {"lead_project_id": None, "tenant_id": tenant_id, "builder_version": "v2_legacy"},
        }
    elif not call_brief:
        # Minimal fallback
        tenant_name = metadata.get("tenant_name", "")
        call_brief = {
            "lead":    {"id": lead_id, "name": lead_name},
            "tenant":  {"id": tenant_id, "name": tenant_name},
            "call_context": {"call_type": "fresh"},
            "initial_products": [],
            "rules": {"max_products_to_pitch": 3},
        }

    logger.info(
        f"[agent:{call_id}] lead={lead_name!r} tenant={call_brief.get('tenant', {}).get('name')!r} "
        f"call_type={call_brief.get('call_context', {}).get('call_type')} "
        f"products={len(call_brief.get('initial_products') or [])}"
    )

    session = _make_session(call_id)
    agent   = CortexFlowAgent(
        lead_name=lead_name,
        instructions=build_instructions(
            lead_name=lead_name,
            call_brief=call_brief,
            mode=AGENT_MODE,
        ),
        mode=AGENT_MODE,
        call_brief=call_brief,
    )

    started_at = time.monotonic()
    await session.start(agent, room=ctx.room)
    logger.info(f"[agent:{call_id}] session started")

    # ── Wait for SIP disconnect OR agent end_call ────────────────────────────
    sip_disconnected = asyncio.Event()

    def _on_participant_disconnect(participant: any) -> None:
        if participant.identity.startswith("sip-"):
            logger.info(f"[agent:{call_id}] SIP participant disconnected")
            sip_disconnected.set()
            # Reset silence timer so monitor knows user hung up
            agent._reset_silence_timer()

    def _on_data_received(data: any, *args: any) -> None:
        """Track user speech events to reset silence timer."""
        agent._reset_silence_timer()

    ctx.room.on("participant_disconnected", _on_participant_disconnect)

    try:
        done_tasks, pending = await asyncio.wait(
            [
                asyncio.create_task(agent._done.wait()),
                asyncio.create_task(sip_disconnected.wait()),
            ],
            timeout=MAX_CALL_S,
            return_when=asyncio.FIRST_COMPLETED,
        )
    except Exception:
        done_tasks, pending = set(), set()

    for t in pending:
        t.cancel()

    # Cancel silence monitor
    if agent._silence_task and not agent._silence_task.done():
        agent._silence_task.cancel()

    duration_s = int(time.monotonic() - started_at)
    logger.info(f"[agent:{call_id}] ended duration={duration_s}s outcome={agent._outcome}")

    if agent._done.is_set():
        await _hang_up_sip(raw_room, sip_identity)

    # ── Build summary ─────────────────────────────────────────────────────────
    if agent._appointment:
        summary_data: dict = {
            "summary": (
                f"Appointment booked: {agent._appointment['iso']}"
                + (f" — {agent._appointment['notes']}" if agent._appointment.get("notes") else "")
            ),
            "outcome":                  "appointment_booked",
            "appointment_requested":    True,
            "proposed_appointment_iso": agent._appointment["iso"],
        }
    else:
        raw_transcript = _build_transcript(session)
        summary_data   = await summarize_call(raw_transcript, call_id)
        if agent._outcome != "unknown":
            summary_data["outcome"] = agent._outcome

    raw_transcript = _build_transcript(session)
    # Phase 19: Normalize non-Latin script
    transcript = await _normalize_transcript(raw_transcript)

    await notify_backend(call_id, lead_id, tenant_id, transcript, duration_s, summary_data)

    # Phase 18: Log analytics (fire-and-forget)
    asyncio.create_task(log_analytics(agent, call_id, duration_s, summary_data.get("outcome", "unknown")))


# ─── voice-service proxy routes for agent tools ───────────────────────────────
# The agent calls VOICE_SERVICE_URL/voice/tools/* which this service exposes.
# These proxy to the backend's /v1/calls/tools/* endpoints.

async def _proxy_to_backend(path: str, payload: dict) -> dict:
    """Forward a tool request to the Vercel backend."""
    backend_url = os.getenv("BACKEND_URL", "").rstrip("/")
    if not backend_url:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{backend_url}/v1/calls/tools/{path}",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json=payload,
            )
        return res.json()
    except Exception as exc:
        logger.error(f"[proxy_to_backend:{path}] {exc}")
        return {}


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
