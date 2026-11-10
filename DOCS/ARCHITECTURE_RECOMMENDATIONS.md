# Architecture recommendations

These are implementation constraints for the next plan. Nothing here was applied.

## Keep

Keep four processes: `landing/`, `crm/`, `backend/`, `pipecat-server/`. Keep Supabase Auth and Postgres. Keep Telnyx Call Control plus Pipecat. The 11 completed calls show that combination has worked. The failure since June is queue control and carrier/HTTP errors, not a reason to introduce LiveKit, FreeSWITCH, or a second telephony stack.

Keep tenant id = owning auth user id for self-serve companies. `requireUser` and `crm/lib/auth.ts` already agree. Invited users are `user_profiles` rows pointing at that tenant. Do not go back to `user_metadata.tenant_id`.

## Change before adding product surface

### 1. Make the queue a state machine

`call_queue` is already the right table. Do not add another.

- One open row per lead. `migrateLegacyScheduledLeads` must not insert a second row when a `failed` row exists.
- Every terminal update sets `last_attempt_at`.
- `canAttemptLead` counts `calls` for that lead since midnight in the tenant's timezone (the code currently uses the server clock).
- `markCallFailed` clears `scheduled_call_at` or sets `call_initiated`, so a crash between queue update and metadata update cannot revive the lead.
- Add a status CHECK only after the writers are listed. Today the column accepts any text, which is why `max_attempts_reached` works without a migration. A CHECK is good later. It is not the first patch.
- Pause `_queue_poller` until the patch is on the Vercel production deployment. The VM polls production. A local fix does nothing until that deploy.

### 2. Stop using a RLS-bypass role for tenant queries

The safest path that preserves the API:

- Add policies: `authenticated` may access a row only when `tenant_id` matches a `user_profiles` row for `auth.uid()`. Service role remains for onboarding.
- Revoke `TRUNCATE`, `INSERT`, `UPDATE`, `DELETE` on `public` from `anon`.
- Point `DATABASE_URL` at a login that is not the owner and does not have `BYPASSRLS`. Set `app.tenant_id` per request and use that in policies, or switch the hot paths to the Supabase client with the user JWT.
- Do this in a migration reviewed against the 10 existing migration names. Do not toggle RLS off to "test".

Until that lands, every new query must take `tenant_id` from `req.tenantId`, never from an untrusted body alone. `requireUser` already overwrites a mismatch with 403, but only when the field is named `tenant_id` or `tenantId`.

### 3. Secrets

- Delete or admin-gate `GET /v1/credentials/:tenantId/:service`. The CRM should ask "is Resend configured?" and receive `{configured: true}`.
- Encrypt `google_calendar_tokens` with the same key as `credentials` before anyone connects Calendar.
- Reject webhooks whose `webhook_secret` is null.
- Verify Meta `X-Hub-Signature-256` and a Resend signature on `/v1/email/inbound`, and match the lead inside one tenant.
- Gate `POST /v1/demo/request` behind a server flag defaulting off.

### 4. One reminder model and one message log

`reminderJob.js` reads `leads.metadata`. `appointments` has its own reminder columns and zero rows. New appointment work should write `appointments` and teach the job to read that table. Leave the metadata keys until the job is switched, so old leads do not lose a reminder.

`communications` is the table. `metadata.communications_log` is the legacy array still appended in `newCalls.js` and `notificationService.js`. New UI should read `communications`. Stop appending to both once the communications page is confirmed against that table.

## Where each requested feature goes

| Feature | Place |
|---|---|
| Kanban configuration | `tenants.settings` or `projects.settings`. Render in `crm/app/leads/page.tsx`. Status PATCH already exists |
| Assignment | `leads.assigned_to`. UI on lead detail. Optional filter on `GET /v1/leads/:tenantId` |
| Notes and timeline | Existing notes routes plus `activity_logs` plus `communications` |
| Calendar | `crm/app/appointments/page.tsx` and `routes/appointments.js` |
| Integrations | `crm/app/integrations/page.tsx` |
| Usage and caps | `usageTracker.js` checked inside `startOutboundCall` before insert. Display stays on `/usage` |
| Bundles / subscription | New columns or a new table beside `tenants`. Do not encode prices only in the signup component |
| Forwarding | No route today. Add a Telnyx transfer in `server.py` first, then a field on tenant settings |
| Handoff UI | `LeadConversionPanel.tsx` and `assigned_to`. Live takeover is a new websocket, not a CSS change |

## Explicit non-goals for the next plan

- A vector database. Three `kb_products` rows do not justify one. `productSelector.js` is the retrieval path.
- Rewriting the CRM in React 19 to match the landing app. They can stay on different majors.
- Deleting `DOCS/PRODUCT.md` inside a feature branch with no archive. Those files are wrong, and they are the record of the old stack. Point new work at `DOCS/CURRENT_ARCHITECTURE.md` and this file.
- Running `pipecat-server/testcall.sh` or enabling Telnyx origination to "see if it works" before the queue patch is in production.

## Order of work

1. Kill switch the poller.
2. Patch the three functions named in `VOICE_PIPELINE_AUDIT.md` and deploy the API.
3. Confirm a day of zero new failed rows while the poller is off.
4. RLS policies and grant revoke, in a migration, with the API still able to read a tenant.
5. Close credential GET, demo dial, and unsigned webhooks.
6. One supervised completed call, with `call_control_id` logged, consent required.
7. Only then: plan enforcement, WhatsApp credentials, calendar encryption, kanban settings.

That order uses the code you have. It does not pause product work forever. It stops the next feature from being built on a dialer that inserts a call every minute.
