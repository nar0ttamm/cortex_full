# Manual setup — AI voice stack (what you configure outside code)

Use this checklist on your **GCP VM** (`voice-service/.env`) and in each vendor dashboard. The app wires these together; nothing here is automatic except where noted.

---

## 1. Supabase (Postgres)

1. Create a project (region close to users).
2. **Database → Connect** → copy the **Session pooler** URI (IPv4-friendly), not the direct `db.*` host, for `DATABASE_URL` on the VM.
3. URL-encode special characters in the password (`@` → `%40`).
4. Same DB is used by the Vercel backend — RLS/policies should match your security model.

---

## 2. Google AI (Gemini) — LLM

- **Not OpenAI** in this repo: conversation + summarization use **Google Generative AI**.
1. [Google AI Studio](https://aistudio.google.com/) or Cloud Console → create an **API key**.
2. Set on the VM: `GEMINI_API_KEY=...`
3. Model defaults to `gemini-1.5-flash` in code (fast/cheap). Change in `conversationEngine.ts` if you need another.

---

## 3. Deepgram — streaming STT

1. [Deepgram Console](https://console.deepgram.com/) → create a project → **API key**.
2. Set: `DEEPGRAM_API_KEY=...`
3. Optional tuning (env):

| Variable | Purpose |
|----------|---------|
| `DEEPGRAM_MODEL` | Default `nova-2` |
| `DEEPGRAM_LANGUAGE` | Default `en-IN` (India English); adjust for your callers |
| `DEEPGRAM_SAMPLE_RATE` | Must match fork PCM (default `16000`) |
| `DEEPGRAM_ENDPOINTING_MS` | Silence before a “final” transcript (default `260`) — lower = snappier, more cuts |
| `DEEPGRAM_UTTERANCE_END_MS` | Longer pause = utterance end (default `900`) |

---

## 4. ElevenLabs — TTS (default)

1. [ElevenLabs](https://elevenlabs.io/) → **API key** + pick a **Voice ID** (Indian/neutral English as you prefer).
2. Set:

```env
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL=eleven_turbo_v2_5
ELEVENLABS_OUTPUT_FORMAT=pcm_16000
```

3. Optional “more human” / stable voice (0–1):

```env
ELEVENLABS_STABILITY=0.45
ELEVENLABS_SIMILARITY=0.8
ELEVENLABS_STYLE=0.35
ELEVENLABS_SPEAKER_BOOST=1
ELEVENLABS_STREAM_LATENCY=3
```

4. If ElevenLabs is missing but Deepgram is set, the code can fall back to **Deepgram Aura** for telephony PCM (see `voiceSynthesis.ts`).

---

## 5. FreeSWITCH + SIP trunk (e.g. Telnyx)

1. Install FreeSWITCH on the same VM (or reachable host).
2. Configure **Sofia gateway** to your provider (credentials, proxy, registration if required).
3. Env:

```env
FREESWITCH_HOST=127.0.0.1
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=...   # must match event_socket config
SIP_GATEWAY_NAME=telnyx       # gateway name in XML
SIP_CALLER_ID_E164=+1...      # your verified DID in E.164
USE_ESL_ORIGINATE=true
```

4. **Post-answer app (park vs active leg)**  
   - Default in code: `playback(silence_stream://-1)` so the answered channel stays in a normal media state; we `uuid_break` before the first greeting, then `uuid_broadcast` for AI speech.  
   - Legacy: `FREESWITCH_ORIGINATE_APP=park()` if your FS build prefers park.  
   - Extra chan vars: `FREESWITCH_ORIGINATE_EXTRA_VARS=ignore_early_media=true,...`

5. **mod_audio_fork** must be loaded for `uuid_audio_fork` → WebSocket → Deepgram path.

### Minimal Docker images (e.g. `safarov/freeswitch`) — often **broken for AI**

If `uuid_audio_fork` returns **Command not found** in `cortex_voice` logs, the image has **no** `mod_audio_fork.so`. **Node cannot fix that.** Use an image that ships the module (example: `drachtio/drachtio-freeswitch-mrf:v1.10.1-full` — verify with `find … mod_audio_fork.so` inside the image).

**One clear migration path on the VM:**

1. **Backup** SIP gateway XML from the old container (path is often under `/etc/freeswitch/sip_profiles/external/` or similar):
   `docker cp freeswitch:/etc/freeswitch/sip_profiles ./fs-sip-backup` (adjust source path if different).
2. **Stop and remove** the old container: `docker stop freeswitch && docker rm freeswitch` (frees port **8021**).
3. **Run** the Drachtio image with the **same** ports your trunk needs, e.g. `-p 8021:8021 -p 5060:5060/tcp -p 5060:5060/udp` and mount or `docker cp` your gateway files back into `/etc/freeswitch/...`.
4. Match **`FREESWITCH_ESL_PASSWORD`** in `voice-service/.env` to **`event_socket.conf.xml`** inside the container (often `ClueCon` on stock configs).
5. **`pm2 restart cortex_voice`**, then run **`bash scripts/verify-ai-stack.sh`** from `voice-service` on the VM.

---

## 6. Cortex backend (Vercel) → voice VM

1. `VOICE_SERVICE_URL=http://<VM_PUBLIC_IP>:5000` (no trailing slash).
2. `VOICE_SECRET` must match `VOICE_SECRET` on the VM (and optional `AUDIO_INGRESS_SECRET`).
3. GCP firewall: allow **inbound TCP 5000** from the internet (Vercel has no fixed egress IPs).

---

## 7. Redis (optional)

`REDIS_URL=redis://127.0.0.1:6379` — session store / coordination; pipeline works without it with in-memory fallback where implemented.

---

## 8. Latency metrics (logs)

After deploy, tail:

`pm2 logs cortex_voice | grep '\[metrics\]'`

Events include `answer_to_audio_fork`, `answer_to_greeting_done`, `turn_user_to_ai_done`, etc., in milliseconds.

---

## 9. OpenAI

This stack does **not** use OpenAI by default. To use OpenAI instead of Gemini you would swap `conversationEngine.ts` (and summarization) to the OpenAI SDK — not included in the default path.
