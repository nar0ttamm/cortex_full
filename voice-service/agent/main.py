#!/usr/bin/env python3
"""
CortexFlow AI Voice Agent — LiveKit Agents 1.x pipeline.
Replaces cortex_voice (FreeSWITCH/ESL) with:
  Silero VAD → Deepgram STT → OpenAI LLM → Deepgram TTS
"""

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
    llm,
)
from livekit.plugins import deepgram, openai, silero

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("cortex-agent")

MAX_CALL_S = int(os.getenv("MAX_CALL_DURATION_S", "300"))
BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
VOICE_SECRET = os.getenv("VOICE_SECRET", "")


# ─── helpers ──────────────────────────────────────────────────────────────────

def get_ist_datetime() -> str:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    return now.strftime("%A, %d %B %Y — %H:%M IST")


def build_instructions(lead_name: str = "", lead_inquiry: str = "") -> str:
    name_ctx = f"\nYou are calling {lead_name}." if lead_name else ""
    inquiry_ctx = (
        f'\nThey previously enquired about: "{lead_inquiry}". Use this as context.'
        if lead_inquiry
        else ""
    )
    return f"""\
You are a friendly, professional AI sales assistant calling on behalf of a business using CortexFlow CRM.{name_ctx}{inquiry_ctx}

Your role:
1. Confirm the prospect is available to talk
2. Reference their inquiry (if known) or briefly explain how the business can help
3. Ask 1-2 qualifying questions about their needs
4. If interested, book an appointment — get a SPECIFIC day AND time from them
5. Keep each response to 1-2 short sentences — phone-conversation pace
6. Be warm and natural. Mix Hinglish if they do.
7. Wrap up graciously when they say goodbye

Current date and time: {get_ist_datetime()}

Scheduling rules (CRITICAL):
- When booking: ask for day AND clock time. Confirm back: "So I'll book you for [day] at [time] IST — does that work?"
- Once confirmed: say "Perfect, I've noted it — you'll see it on the calendar" then close
- Max 30 words per response. Spoken words only — no markdown, no lists."""


# ─── agent class ──────────────────────────────────────────────────────────────

class CortexFlowAgent(Agent):
    def __init__(self, lead_name: str, instructions: str):
        super().__init__(
            instructions=instructions,
            allow_interruptions=True,
            min_endpointing_delay=0.25,
            max_endpointing_delay=1.2,
        )
        self._lead_name = lead_name
        self._greeting = (
            f"Hi {lead_name}, CortexFlow here — got a minute?"
            if lead_name and lead_name.lower() not in ("there", "customer", "")
            else "Hi there, CortexFlow here — got a minute?"
        )

    async def on_enter(self) -> None:
        await self.session.say(self._greeting, allow_interruptions=True)


# ─── call result ──────────────────────────────────────────────────────────────

async def summarize_call(transcript: str, call_id: str) -> dict:
    if not transcript.strip():
        return {"summary": "", "outcome": "unknown", "appointment_requested": False, "proposed_appointment_iso": None}
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
Rules for proposed_appointment_iso:
- If the customer confirmed a SPECIFIC day AND time, calculate the ISO 8601 +05:30 datetime
- "tomorrow at 1 PM" when today is Monday 20 Apr 2026 → "2026-04-21T13:00:00+05:30"
- Set null if no concrete appointment was confirmed

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
    if not BACKEND_URL:
        logger.warning("[notify] BACKEND_URL not set — skipping")
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{BACKEND_URL}/v1/calls/result",
                headers={"Content-Type": "application/json", "x-voice-secret": VOICE_SECRET},
                json={
                    "tenant_id": tenant_id,
                    "lead_id": lead_id,
                    "call_id": call_id,
                    "transcript": transcript,
                    "summary": summary_data.get("summary", ""),
                    "outcome": summary_data.get("outcome", "unknown"),
                    "duration_seconds": duration_s,
                    "appointment_requested": bool(summary_data.get("appointment_requested", False)),
                    "proposed_appointment_iso": summary_data.get("proposed_appointment_iso"),
                },
            )
        logger.info(f"[notify:{call_id}] backend {res.status_code}")
    except Exception as exc:
        logger.error(f"[notify:{call_id}] {exc}")


# ─── entrypoint ───────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    logger.info(f"[cortex-agent] job received room={ctx.room.name}")

    metadata: dict = {}
    try:
        metadata = json.loads(ctx.room.metadata or "{}")
    except Exception:
        pass

    lead_name: str = metadata.get("name", "")
    lead_id: str = metadata.get("lead_id", "")
    tenant_id: str = metadata.get("tenant_id", "")
    lead_inquiry: str = metadata.get("inquiry", "")
    call_id: str = metadata.get("call_id", ctx.room.name)

    logger.info(f"[agent:{call_id}] lead_id={lead_id} name={lead_name!r}")

    await ctx.connect()

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_MODEL", "nova-2"),
            language=os.getenv("DEEPGRAM_LANGUAGE", "en-IN"),
            interim_results=True,
            endpointing_ms=int(os.getenv("DEEPGRAM_ENDPOINTING_MS", "250")),
            no_delay=True,
        ),
        llm=openai.LLM(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        ),
        tts=deepgram.TTS(
            model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-harmonia-en"),
        ),
        allow_interruptions=True,
        min_endpointing_delay=0.25,
        max_endpointing_delay=1.2,
    )

    agent = CortexFlowAgent(
        lead_name=lead_name,
        instructions=build_instructions(lead_name, lead_inquiry),
    )

    started_at = time.monotonic()

    # Start session — agent.on_enter() fires, greeting goes out
    await session.start(agent, room=ctx.room)
    logger.info(f"[agent:{call_id}] session started")

    # Wait until call ends or timeout
    try:
        await asyncio.wait_for(session.wait_for_inactive(), timeout=MAX_CALL_S)
    except asyncio.TimeoutError:
        logger.info(f"[agent:{call_id}] max duration reached, closing")
        await session.aclose()

    duration_s = int(time.monotonic() - started_at)
    logger.info(f"[agent:{call_id}] ended duration={duration_s}s")

    # Build transcript from chat history
    transcript_lines: list[str] = []
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
                transcript_lines.append(f"{role_label}: {content.strip()}")

    transcript = "\n".join(transcript_lines)
    summary_data = await summarize_call(transcript, call_id)
    await notify_backend(call_id, lead_id, tenant_id, transcript, duration_s, summary_data)


# ─── worker ───────────────────────────────────────────────────────────────────

def prewarm(proc) -> None:
    silero.VAD.load()


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )
