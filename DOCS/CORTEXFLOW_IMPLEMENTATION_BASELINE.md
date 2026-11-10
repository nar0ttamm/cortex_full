# CortexFlow implementation baseline

Inspected 10 November 2026 on `main` at `cc15cd7`, then compared with the live Supabase project. This describes the system before the Phase 0 code in the same working tree. What that code changed is in `DOCS/IMPLEMENTATION_STATUS.md`.

## Actual architecture

One repository, four deployable parts, not an npm workspace:

| Part | Role | Runtime |
|---|---|---|
| `landing/` | Marketing site | Next.js on Vercel |
| `crm/` | Authenticated CRM | Next.js on Vercel. Data goes through the Express API |
| `backend/` | Express API | Vercel. PostgreSQL through `DATABASE_URL` |
| `pipecat-server/` | Voice runtime | Designed for a GCP VM. Telnyx Call Control, Deepgram, OpenAI, ElevenLabs |

The database connection uses the table owner, so row-level security does not apply to the API. The CRM does not query tenant tables with the anon key. Onboarding uses the service role.

LiveKit, FreeSWITCH, and Twilio are not on the boot path. `DOCS/PRODUCT.md`, `DOCS/TECHNICAL_MANUAL.md`, and `DOCS/AI_CONTEXT.md` still describe them and are marked obsolete.

## Database at inspection

24 public tables, RLS enabled, zero policies. About 118,267 `calls` and 118,241 `call_queue` rows. Queue status was 118,239 `failed` and 2 `retry_scheduled`. `credentials`, `appointments`, `google_calendar_tokens`, and `knowledge_bases` were empty.

`anon` and `authenticated` had `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on all 24 tables. `ssl.rejectUnauthorized` was false in `backend/db.js`.

## Feature inventory

Working code paths, not proof of a live provider:

- Signup, login, tenant, team, projects, leads, notes in `leads.metadata`, CSV import/export, dashboard charts from loaded leads.
- Call queue, `startOutboundCall`, Pipecat voice, call transcripts, usage counters.
- Appointments table and Google Calendar routes. Tokens were plaintext and the table was empty.
- Communications history. Outbound email was Resend. WhatsApp was AiSensy. Both skipped when credentials were empty.
- Meta Lead Ads routes without POST signature verification. Generic webhooks accepted a null secret.
- Lead score, next action, project resolution, covered by 18 unit tests.

## Gaps that were still open

- Legacy queue migration inserted a new job whenever a lead had `metadata.scheduled_call_at` and no open job. A `failed` job did not count, so HTTP 502 replies created another `calls` row on every poll.
- No consent or suppression.
- `GET /v1/credentials/:tenantId/:service` returned decrypted secrets to any tenant member.
- Inbound email matched a lead by address with no tenant and returned the lead name.
- Public demo dial used a process-local rate limit.
- Lead lists ignored `assigned_to`. Kanban columns were hardcoded.
- No subscriptions, Stripe, bundles, or entitlement enforcement.
- Google refresh tokens were not encrypted. Human transfer was a flag, not a Telnyx transfer.
- `DOCS/PRODUCT.md` and the technical manual were not safe to implement from.

## Recommended sequence

The sequence in the engineering brief still holds: stop the queue loop and the public secret paths, then CRM visibility and statuses, then MSG91, then usage, calendar encryption, handoff, integrations, and entitlements. Do not turn automatic dialing back on until the new worker is deployed and `CALL_QUEUE_ENABLED` is set on purpose.
