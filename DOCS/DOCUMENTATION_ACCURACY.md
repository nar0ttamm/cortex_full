# Documentation accuracy

Read-only comparison. These three files were not edited.

## DOCS/PRODUCT.md

Header says "Last updated: April 2026" and "current live production state".

| Claim in the file | Code and Vercel today |
|---|---|
| AI calls use a LiveKit pipeline | False. `pipecat-server/server.py` documents itself as the replacement for `voice-service`, a LiveKit agent, and FreeSWITCH. No LiveKit import exists under `backend/` |
| `cortex_voice` creates a LiveKit room and LiveKit SIP dials via Telnyx | False. `server.py` calls Telnyx `POST /v2/calls` and streams with `streaming_start` |
| OpenAI Realtime, or Groq plus Deepgram TTS | False for the current bot. `bot.py` uses `OpenAILLMService` default `gpt-4o-mini`, Deepgram STT, ElevenLabs TTS |
| WhatsApp and email on every new lead | The functions exist in `notificationService.js`. `credentials` has 0 rows. WhatsApp is AiSensy, not a guaranteed send |

The lead-source list (Meta, Google Lead Forms, IndiaMART, Justdial, Zapier, Typeform, Tally, generic) matches `integration_sources` keys. That part is still a fair description of the webhook catalog, not of live ad-account connections.

## DOCS/TECHNICAL_MANUAL.md

The system map still shows:

- `PM2 process: cortex_voice (voice-service/src/index.ts)`
- LiveKit room dispatch
- `VOICE_SERVICE_URL = http://<VM_IP>:5000` without the TLS reverse proxy the nginx file now describes
- `notificationService.js` as Twilio WhatsApp plus Resend

`voice-service/` is not in this workspace. Notifications are Resend plus AiSensy. The VM entrypoint in repo is `pipecat-server/server.py`. Production API cron is daily in `backend/vercel.json`. The manual's picture of a minutely Vercel cron is not what `vercel.json` contains. The minutely loop that does exist is `_queue_poller` in `server.py`.

Do not debug from this manual. It will send you to files that are gone.

## DOCS/AI_CONTEXT.md

Written as a paste-in prompt for other agents. It still says:

- Pilot-ready and "working in production"
- Notifications are Twilio WhatsApp plus Resend, both in sandbox
- A pilot tenant name is given as if it were the current operating state

That prompt will cause the next agent to preserve or "repair" LiveKit. The accurate paste-in starting point is `DOCS/CORTEXFLOW_SYSTEM.md` (20 September 2026) plus `DOCS/CURRENT_ARCHITECTURE.md`, with two corrections to the September file: WhatsApp in code is AiSensy, and the call table after June 2026 is a failure loop, not a live dialer.

`DOCS/AI_CONTEXT.md` is right about one gap it names: there is still no recording-consent prompt. `bot.py` goes further and instructs the model not to disclose that it is an AI.

## Files that are closer to the code

| File | Use |
|---|---|
| `DOCS/CORTEXFLOW_SYSTEM.md` | Best older map of JWT, Pipecat, and Telnyx. Wrong provider name for WhatsApp |
| `DOCS/TECHNICAL_AUDIT.md` | 10 November handover. Superseded in structure by the reference set from this audit, still valid on the call counts and RLS finding |
| `DOCS/PROJECT_STATUS.md` | Checklist from May 2026. Treat checked "pilot ready" boxes as historical |

## Not verified against these docs

- Whether a human still runs the old `voice-service` PM2 process beside Pipecat. The repo and the Vercel `VOICE_SERVICE_URL` comment point at the Pipecat host. The process list on the VM was not inspected.
- Whether Twilio credentials still exist in a dashboard outside this repo. They are not what `notificationService.js` calls.
