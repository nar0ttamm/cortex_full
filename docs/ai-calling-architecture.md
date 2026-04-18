# CortexFlow — Phase D AI Calling Architecture

Production-oriented overview of the real-time voice pipeline (Telnyx SIP → FreeSWITCH → Node → Deepgram / OpenAI / ElevenLabs → CRM).

---

## 1. High-level architecture (text diagram)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    CRM + Backend                         │
                    │  (Next.js CRM, Vercel API, Supabase Postgres)            │
                    └───────────────────────────┬─────────────────────────────┘
                                                │ REST: start call, call result
                                                ▼
┌──────────────┐   SIP/RTP   ┌──────────────────────────────────────────────────┐
│   Telnyx     │◄───────────►│  GCP VM — cortex_voice                            │
│  (trunk)     │             │  ┌─────────────┐    ESL (8021)    ┌───────────┐  │
└──────────────┘             │  │ voice-svc   │◄────────────────►│FreeSWITCH │  │
                             │  │ Node :5000  │                  │ + Sofia   │  │
                             │  └──────┬──────┘                  └─────┬─────┘  │
                             │         │ WebSocket /audio-in/:uuid      │ RTP    │
                             │         │ (PCM16 mono 16k from           │        │
                             │         │  mod_audio_fork)               │        │
                             │         ▼                               │        │
                             │  ┌──────────────┐  ┌─────────┐  ┌──────────────┐  │
                             │  │ Deepgram STT │  │ OpenAI  │  │ ElevenLabs   │  │
                             │  │ (stream)     │  │ (stream)│  │ TTS (stream) │  │
                             │  └──────────────┘  └─────────┘  └──────────────┘  │
                             │         │                               │        │
                             │         └─────────── playback ────────────┘        │
                             │                    (injected into FS leg)         │
                             └──────────────────────────────────────────────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Redis (session state)  │
                                    │ call_id, VAD, barge-in │
                                    └───────────────────────┘
```

---

## 2. Data flow (step-by-step)

1. **Call creation** — Backend calls `POST /voice/start-call` on `cortex_voice` with tenant, lead, phone. Service returns `call_id` immediately; outbound originate runs asynchronously.
2. **Telephony** — FreeSWITCH originates via ESL (`originate` … `&park()` or equivalent), using configured Telnyx SIP gateway.
3. **Media tap (Step 1)** — When the channel is active, FreeSWITCH `uuid_audio_fork` streams **raw PCM** (target: **16 kHz mono PCM16**) to `ws://…/audio-in/:call_id?token=…`.
4. **STT (Step 2)** — Node forwards audio chunks to **Deepgram** streaming; partial and final transcripts drive turn-taking.
5. **LLM (Step 3)** — On endpoint (pause / sentence), Node sends context to **OpenAI**; short Hinglish-style replies (5–12 words) for latency.
6. **TTS (Step 4)** — Reply text streams to **ElevenLabs**; audio chunks are buffered for playback.
7. **Playback (Step 5)** — Synthesized audio is injected back into the call leg (FreeSWITCH playback API / channel write — implementation follows media direction chosen on VM).
8. **Barge-in (Step 6)** — While AI speaks, STT/VAD detects user speech; Node cancels TTS and playback, resumes capture.
9. **State (Step 7)** — **Redis** holds per-`call_id` session: transcript tail, speaking/listening flags, lead snapshot, timestamps.
10. **CRM logging (Step 8)** — On completion, transcript, AI turns, outcome, and timestamps are persisted via existing `callStorage` / backend notify paths.

---

## 3. Services and responsibilities

| Component | Role |
|-----------|------|
| **Telnyx** | PSTN/SIP trunk; carrier audio to FreeSWITCH. |
| **FreeSWITCH** | SIP, RTP, ESL control, `uuid_audio_fork` egress, future playback ingress. |
| **cortex_voice (Node)** | HTTP API, WebSocket ingress, orchestration, provider SDKs. |
| **Deepgram** | Streaming STT. |
| **OpenAI** | Streaming / fast-turn LLM. |
| **ElevenLabs** | Streaming TTS (Indian English / neutral voice selection in config). |
| **Redis** | Ephemeral call session and coordination (barge-in, pipeline state). |
| **Supabase / backend** | Durable calls, transcripts, lead updates. |

---

## 4. How streaming is wired

- **Audio from FS → Node**: WebSocket **binary** frames; each frame is a slice of **linear PCM**, 16-bit little-endian, mono, **16 kHz** (configured via `uuid_audio_fork` mix, e.g. `mono@16000h`). This matches common STT expectations and keeps resampling explicit.
- **STT**: Node opens a Deepgram live connection; audio chunks are forwarded as they arrive; transcripts are asynchronous events (partial vs final).
- **LLM**: Batching by endpointing avoids sending every partial word; streaming output can still be sentence-chunked for TTS.
- **TTS**: Prefer provider streaming APIs so first audible audio starts before the full sentence is generated.

---

## 5. Voice service implementation (reference)

### Audio ingress (Step 1)

- **WebSocket path**: `/audio-in/:callId` with optional `?token=` (uses `AUDIO_INGRESS_SECRET` or `VOICE_SECRET`).
- **Consumers**: `registerAudioConsumer(callId, fn)` forwards PCM chunks to Deepgram (see `audioIngressServer.ts`).
- **Manual fork** (debug):
  - `POST /voice/audio-fork/start` — body `{ "call_id": "<uuid>", "mix": "mono@16000h" }` + `x-voice-secret`.
  - `POST /voice/audio-fork/stop` — body `{ "call_id": "<uuid>" }`.
- **Env**: `AUDIO_INGRESS_WS_BASE` if FreeSWITCH must use a non-loopback URL (e.g. `wss://…` behind nginx with `Upgrade`).

### End-to-end loop (Steps 2–8)

- **ESL events**: On startup, `initEslVoiceHooks()` subscribes to `CHANNEL_ANSWER` / `CHANNEL_HANGUP_COMPLETE` on the shared inbound ESL socket (`eslVoiceHooks.ts`).
- **After answer**: `beginEslCallPipeline` — `uuid_audio_fork` → WebSocket → Deepgram (`DEEPGRAM_SAMPLE_RATE=16000`) → OpenAI (Hinglish, short turns) → ElevenLabs (default `TTS_PROVIDER=elevenlabs`, PCM16 → downsample to 8 kHz WAV) → `uuid_broadcast` to the leg.
- **Barge-in**: Deepgram `SpeechStarted` + `uuid_break` stops playback; generation counter drops stale TTS chunks.
- **Redis**: `REDIS_URL` optional; `sessionStore` mirrors tail state to Redis or in-memory (`sessionStore.ts`).
- **CRM**: `call_events` rows for `call_answered`, `stt_final`, `ai_reply`, `pipeline_stopped`; `saveCallResult` + `notifyBackendCallResult` on teardown (`callMediaPipeline.ts`, `freeswitchBridge.ts`).
- **Flags**: `VOICE_REALTIME_PIPELINE=false` to originate/park only; `VOICE_ESL_EVENTS=false` to skip ESL subscriptions.

---

## 6. Debugging

| Symptom | Checks |
|---------|--------|
| No WebSocket connection | `fs_cli` → `module_exists mod_audio_fork` (or your distro’s fork/stream module). Confirm URL reachable from FS (firewall, `127.0.0.1` vs public host). |
| 401 on upgrade | Token mismatch: `VOICE_SECRET` / `AUDIO_INGRESS_SECRET` must match query `token` on the fork URL. |
| Connect then no bytes | Channel not bridged / not answered; fork only after answer. Wrong UUID (must match `origination_uuid` / live leg). |
| Low or zero “% of nominal” logs | Wrong mix rate (`mono@8000h` vs `mono@16000h`), or mono/stereo mismatch. |
| ESL errors | `FREESWITCH_ESL_PASSWORD`, port `8021`, and FS `event_socket` config aligned. |

**Useful commands (on VM)**

```bash
# Logs
pm2 logs cortex_voice

# See if fork module responds
fs_cli -x "uuid_audio_fork"

# Manual fork (replace UUID and URL)
fs_cli -x 'uuid_audio_fork <UUID> start ws://127.0.0.1:5000/audio-in/<UUID>?token=SECRET mono@16000h'
```

---

## 7. Future improvements — LiveKit (or similar SFU)

Today, media is **point-to-point** between carrier RTP and FreeSWITCH, with forked PCM to Node. Migrating to **LiveKit** (or another WebRTC SFU) would:

- Normalize browser and phone participants in one room.
- Simplify multi-party, agent handoff, and recording.
- Move echo cancellation / jitter handling into the SFU where appropriate.

A pragmatic path is: keep **TelnyX + FreeSWITCH** for PSTN, add a **SIP↔WebRTC bridge** or secondary trunk into LiveKit only when product requirements (e.g. web copilot on same call) justify the operational cost.

---

## 8. Related code paths

- `voice-service/src/audioIngressServer.ts` — WebSocket ingress + logging.
- `voice-service/src/eslClient.ts` — `uuid_audio_fork` ESL helpers.
- `voice-service/src/freeswitchBridge.ts` — Outbound originate / future full pipeline.
- `voice-service/src/index.ts` — HTTP + WebSocket upgrade on shared `http.Server`.

---

*Document version: Phase D — Step 1 baseline. Update as STT/LLM/TTS and playback paths land.*
