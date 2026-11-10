# Integrations reference

No provider was called. No secret value is recorded. "Configured on Vercel" means the **name** exists on that project. Values were not decrypted.

## Telnyx

| | |
|---|---|
| Files | `pipecat-server/server.py`, `pipecat-server/bot.py`, `pipecat-server/.env.example` |
| Auth | `TELNYX_API_KEY` bearer to `https://api.telnyx.com/v2/calls` |
| Other names | `TELNYX_PHONE_NUMBER`, `TELNYX_CC_APP_ID`, `TELNYX_PUBLIC_KEY`, `TELNYX_WEBHOOK_ENFORCE` |
| DB | No Telnyx id column. Attempt rows are `calls` and `call_queue` |
| Metering | `tenant_usage.calls_attempted` increments before the VM responds. Minutes increment only from a result with duration ≥ 10s |
| Webhook | `POST /telnyx-webhook` on the VM |
| Retry | VM does not retry a failed Telnyx POST. The backend queue can create another attempt. See `VOICE_PIPELINE_AUDIT.md` |
| Verified in production | 11 `calls.status = completed`, last 7 June 2026. Later rows are HTTP 502 from the voice HTTP call. Not proof of current origination |

## Deepgram

| | |
|---|---|
| Files | `pipecat-server/bot.py` |
| Auth | `DEEPGRAM_API_KEY` |
| Config | Default STT mode uses model `nova-3-general`, `language=multi`, 8 kHz, endpointing 100 ms. Optional `STT_MODE=flux` uses `flux-general-multi` |
| DB | None. `call_analytics` can store barge-in and silence counts if the bot posts them |
| Metering | None specific to Deepgram |
| Webhook | None. Streaming inside the websocket |
| Verified | Not by this audit. Implied only if a completed call used this file, which current `bot.py` does |

## OpenAI

| | |
|---|---|
| Files | `pipecat-server/bot.py` (`OpenAILLMService`), summary helper in the same file, `backend/config/index.js` |
| Auth | `OPENAI_API_KEY`. Also set on the **backend** Vercel project |
| Model name | `OPENAI_MODEL`, default `gpt-4o-mini` |
| DB | `tenant_usage.ai_input_tokens_estimated`, `ai_output_tokens_estimated` |
| Metering | Those counters. Not a hard cap |
| Verified | Key name exists on the backend. Live completion of a model call was not tested |

## ElevenLabs

| | |
|---|---|
| Files | `pipecat-server/bot.py` |
| Auth | `ELEVENLABS_API_KEY` |
| Names | `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` default `eleven_turbo_v2_5` |
| DB | None |
| Metering | None |
| Verified | Not live-tested. Health endpoint reports whether the key looks non-empty. That endpoint was not requested |

## AiSensy (WhatsApp)

| | |
|---|---|
| Files | `backend/services/notificationService.js` |
| Auth | API key inside decrypted `credentials` service `aisensy`, or env `AISENSY_API_KEY` plus `AISENSY_CAMPAIGNS` |
| Endpoint | `POST https://backend.aisensy.com/campaign/t1/api/v2` |
| DB | `communications` log. `credentials` has 0 rows. `AISENSY_API_KEY` was **not** in the backend Vercel env name list returned for this audit |
| Webhook | None for delivery status |
| Retry | Send errors are logged and do not roll back the lead |
| Verified | Not as a live send. Code path is a skip when credentials are missing |

`DOCS/CORTEXFLOW_SYSTEM.md` and `DOCS/AI_CONTEXT.md` say Twilio. The notification service does not call Twilio.

## Resend (email)

| | |
|---|---|
| Files | `notificationService.js`, `backend/routes/email.js` |
| Auth | `credentials` service `resend` (`api_key`, `from_email`) or env `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Outbound | `POST https://api.resend.com/emails` |
| Inbound | `POST /v1/email/inbound`. No signature verification |
| DB | `communications`, and also `leads.metadata.communications_log` |
| Vercel | `RESEND_API_KEY` is set on the **CRM** project, which does not run `notificationService.js`. It was not in the backend env list |
| Verified | About 120 `communications` rows exist. This audit did not attribute them to Resend |

## Google Calendar

| | |
|---|---|
| Files | `backend/routes/googleCalendar.js` |
| Names on backend | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| Same names also on the CRM project | Yes, plus `GOOGLE_SHEET_ID` |
| DB | `google_calendar_tokens`. Access and refresh tokens are plaintext columns. 0 rows |
| Webhook | OAuth callback `/v1/google-calendar/callback` is a public path |
| Verified | Not in production data |

`GOOGLE_SHEET_ID` has no reference in application source. Treat it as leftover.

## Meta Lead Ads

| | |
|---|---|
| Files | `backend/routes/metaIntegration.js` |
| Names | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| Present on backend Vercel | `META_WEBHOOK_VERIFY_TOKEN` only, in the list returned. App id and secret names were not in that list |
| DB | `integrations` row type `meta_page`, `encrypted_credentials`. Leads deduped by `metadata.meta_lead_id` |
| Webhooks | GET `/v1/meta/webhook` checks the verify token. POST does not check `X-Hub-Signature-256` |
| Verified | Not as a live leadgen delivery. One `integrations` row exists. Its type was not printed |

## Google Ads

Not implemented. `integration_sources.key = google_lead_forms` is a generic webhook label.

## Website forms and generic webhooks

| | |
|---|---|
| Files | `backend/routes/integrations.js`, `backend/integrations/webhookHandler.js`, `leadNormalizer.js` |
| URL | `POST /v1/webhook/:tenantId/:integrationKey` |
| Auth | `webhook_secret` via bearer or `sha256=` HMAC. Missing secret allows the request |
| Catalog keys in the DB | generic, google_lead_forms, indiamart, justdial, meta_lead_ads, tally, typeform, zapier |
| Retry | None. Duplicate phone returns `{status: duplicate}` |
| Verified | 3 `integration_logs` rows. Not re-read |

## Demo form

`POST /v1/demo/request` in `backend/routes/demo.js`. Public. Writes `demo_requests` and can dial the default tenant. Rate limit is an in-memory map.

## CRM env names that are not provider integrations

On Vercel project `crm`: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TENANT_ID`, `NEXT_PUBLIC_DEFAULT_TENANT_ID`, `NEXT_PUBLIC_USE_SUPABASE_PRIMARY`, `NEXT_PUBLIC_ENABLE_DUAL_WRITE`, `CRM_PASSWORD`, `RESEND_API_KEY`, Google names above.

`NEXT_PUBLIC_TENANT_ID` and `NEXT_PUBLIC_DEFAULT_TENANT_ID` are public by the Next.js prefix. Current tenant resolution in `crm/lib/auth.ts` uses `user_profiles`, not these variables. Confirm nothing else still reads them before treating them as harmless.

Landing Vercel project: no environment variables.
