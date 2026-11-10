# Deployment reference

Verified from the Vercel team connected to this workspace and from files in the repo. Secret values were not read.

## Hosting

| App | Vercel project | Production domain | Git |
|---|---|---|---|
| Marketing | `landing` (`prj_eCL9ywXKOrtyVvyUIvvYm77vxr1O`) | `www.cortexflow.in`. `cortexflow.in` redirects there. Both verified | Same GitHub repo as the others when a deployment exists. Env list is empty |
| CRM | `crm` (`prj_dgHgalBUktWIkwfcWTw6hvIg8U81`) | `crm.cortexflow.in` verified. Also `crm-sage-xi.vercel.app` | `nar0ttamm/cortex_full` branch `main` |
| API | `cortex-backend-api` (`prj_Q2xTgjUScHCbI6sGPMzDYc9aB5gg`) | `cortex-backend-api.vercel.app` | Same repo and branch |

Production deployment on 10 November 2026, triggered by the GitHub push to `main` (no separate Vercel CLI deploy):

| Project | Deployment | Commit | Production alias |
|---|---|---|---|
| `cortex-backend-api` | `dpl_HxGCSnnAFAQXsV8kwSfgPMc7ELzc` | `f7a634cc3808cdf3c7387482f4b32bed839da2ae` | `cortex-backend-api.vercel.app` |
| `crm` | `dpl_EjrRe9TT8N1SEjc5kFF5rLNbKKSM` | same commit | `crm.cortexflow.in` |
| `landing` | `dpl_3YSLap5mzQsmnbDhxGpxLDrTcTD5` | same commit | `www.cortexflow.in` |

`GET /health` on that API deployment returned `database: connected`, `commit` equal to that SHA, `automatic_calling: disabled`, and `demo_calls: disabled`. `CALL_QUEUE_ENABLED` and `DEMO_CALLS_ENABLED` are not set on the backend project. `DATABASE_SSL_REJECT_UNAUTHORIZED` is not set. Postgres TLS uses `backend/certs/prod-ca-2021.crt` with certificate verification on. MSG91 keys are not set, so the new adapters cannot send. The GCP voice VM was not changed.

There is no `vercel.json` in `crm/` or `landing/`. API config is `backend/vercel.json`: one Node build of `server.js`, and two crons at `0 0 * * *`.

## Voice VM

Not visible as a Vercel project. Repo files: `pipecat-server/server.py`, `deploy.sh`, `provision_remote.sh`, `setup_server.sh`, `nginx-cortex-pipecat.conf`. nginx is written to terminate TLS and proxy to port 5000. The process listens on `0.0.0.0`.

`VOICE_SERVICE_URL` is set on the backend Vercel project. Its comment names the GCP Pipecat host. The value was not decrypted, and the VM was not logged into. Whether uvicorn is up **right now** is unknown. Database inserts of failed calls continued through 10 November 2026, which means the poller and the API were both reachable recently.

Region `asia-south1` and machine type `e2-medium` appear in `DOCS/COST_FORECAST.md` (April 2026). That was not re-checked in GCP.

## Environment variable names

### Backend project `cortex-backend-api`

`DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `BACKEND_URL`, `CALLING_MODE`, `CALL_DELAY_SECONDS`, `DEFAULT_TENANT_ID`, `OPENAI_API_KEY`, `VOICE_SECRET`, `VOICE_SERVICE_URL`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRM_URL`, `META_WEBHOOK_VERIFY_TOKEN`, `GOOGLE_REDIRECT_URI`.

Not in that list, though the code reads them if present: `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `MSG91_AUTH_KEY`, `MSG91_EMAIL_FROM`, `MSG91_WHATSAPP_NUMBER`, `MSG91_WEBHOOK_SECRET`, `CALL_QUEUE_ENABLED`, `DEMO_CALLS_ENABLED`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `MAX_CONCURRENT_CALLS`, `OPENAI_MODEL`, `PORT`. Leave the two call flags unset. Anything other than the exact string `true` keeps automatic dialing and demo calls off.

### CRM project `crm`

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TENANT_ID`, `NEXT_PUBLIC_DEFAULT_TENANT_ID`, `NEXT_PUBLIC_USE_SUPABASE_PRIMARY`, `NEXT_PUBLIC_ENABLE_DUAL_WRITE`, `CRM_PASSWORD`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_SHEET_ID`.

`GOOGLE_SHEET_ID`, `NEXT_PUBLIC_ENABLE_DUAL_WRITE`, and `NEXT_PUBLIC_USE_SUPABASE_PRIMARY` have no references in current `js`/`ts`/`tsx` source.

### Landing

No environment variables.

### Voice process, from `pipecat-server/.env.example` only

`PORT`, `SERVER_HOST`, `SERVER_DOMAIN`, `TELNYX_API_KEY`, `TELNYX_CC_APP_ID`, `TELNYX_PHONE_NUMBER`, `TELNYX_PUBLIC_KEY`, `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL`, `DEEPGRAM_LANGUAGE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `BACKEND_URL`, `VOICE_SECRET`, `CRON_SECRET`, `MAX_CALL_DURATION_S`, `SILENCE_HANGUP_S`, `MAX_CONCURRENT_CALLS`, `STT_MODE`, `TELNYX_WEBHOOK_ENFORCE`.

The example file contains example hostnames and an example caller ID. Those are not repeated here. Production VM env was not read.

## Supabase

Used as Auth and Postgres. Migration history is on the database (10 named migrations). The git repo cannot recreate the schema. See `DATABASE_SCHEMA_REFERENCE.md`.

No storage buckets. No edge functions were listed for this audit. `list_edge_functions` was not called.

## Workers

| Process | Start |
|---|---|
| Express on Vercel | Platform invokes `module.exports` from `server.js`. Does not call `app.listen` or `startJobs` |
| Local API | `npm start` in `backend/` runs `node server.js`, which listens and starts node-cron |
| Voice | `uvicorn` via `python server.py` or the shell scripts. Lifespan starts `_queue_poller` |
| `callScheduler.js` | Not started |

## Logging and monitoring

`console.log` / `console.error` in Node. `loguru` in Python. No Sentry, no OpenTelemetry config in the repo, no request id. Health routes exist on the API and the voice process. Vercel runtime logs were not pulled.

## Backups and recovery

Not defined in the repo and not inspected in the Supabase or GCP consoles. Treat backup status as **unknown**. Do not delete the 118k failed rows until a backup is confirmed.

## CI/CD

No GitHub Actions in this workspace. Production updates are Vercel git deploys from `main`. Voice deploys are the shell scripts, run by a person.

## Tests

```
cd backend
npm test
```

That is `node --test tests/*.test.js`. On 10 November 2026: 18 passed, 0 failed.

Not run: `npm run lint`, `npm run build` in `crm/` or `landing/`, any Python test. `pipecat-server/testcall.sh` is a manual dial script. Do not run it as a test.

## Local start, from package scripts

| App | Command |
|---|---|
| CRM | `npm run dev` in `crm/` |
| Landing | `npm run dev` in `landing/` |
| API | `npm run dev` in `backend/` (`node server.js`) |
| Voice | `uvicorn` / `python server.py` inside `pipecat-server/` after `pip install -r requirements.txt` |
