# Implementation status

Updated 10 November 2026 after the Phase 0 change set. Nothing here was deployed to Vercel or the voice VM.

## Evidence

- Backend unit tests: `node --test tests/*.test.js` in `backend/` — 36 passed, 0 failed.
- Database migration `phase0_security_consent_usage` applied to the linked Supabase project. `leads.channel_consent`, `communication_suppressions`, and `usage_ledger` exist. `anon` and `authenticated` no longer have grants on `public.leads`. `service_role` still does. The Express API uses the table-owner connection in `DATABASE_URL`, which still bypasses RLS.
- Postgres TLS with `rejectUnauthorized: true` plus the published Supabase Root 2021 CA (`backend/certs/prod-ca-2021.crt`) succeeded against the configured database. The pooler certificate chain is rooted at that CA, which is not in the public trust store. `DATABASE_SSL_REJECT_UNAUTHORIZED` is not set on the backend project.
- No MSG91 message was sent. No outbound call was placed. The CRM Kanban change was not clicked in a browser.

## Implemented in this tree

| Area | State |
|---|---|
| Queue re-enqueue | A lead with any non-cancelled queue row is not migrated again. HTTP 502 is transient, uses the same row, and stops at `MAX_ATTEMPTS_PER_DAY`. One open job per lead is enforced by a partial unique index. |
| Automatic dialing | `runQueueWorker` returns immediately unless `CALL_QUEUE_ENABLED=true`. The two existing `retry_scheduled` rows are not dialed by this code. The VM poller will keep calling the old API until this backend is deployed. |
| Credentials | `GET /v1/credentials/:tenantId/:service` returns `configured` and `created_at` to admins and managers. It does not decrypt. |
| Webhooks | Generic webhooks reject a missing secret. Meta POST requires `X-Hub-Signature-256`. Inbound email requires `x-inbound-secret` and does not return the lead. MSG91 delivery webhook is secret-checked and idempotent. |
| Demo | `DEMO_CALLS_ENABLED` must be true. Shared hourly cap uses `demo_requests`. |
| TLS | Postgres `rejectUnauthorized` defaults to true. Set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only if a deploy cannot verify the host certificate. |
| Consent | Opt-out and suppression block calls, email, and WhatsApp. Unknown consent still allows a send until `REQUIRE_CALL_CONSENT`, `REQUIRE_EMAIL_CONSENT`, or `REQUIRE_WHATSAPP_CONSENT` is `true`, or the tenant sets `require_<channel>_consent`. |
| Lead visibility | Admins and managers see every lead. Other roles see unassigned leads and leads assigned to their profile. They can claim an unassigned lead and cannot reassign someone else's. |
| Statuses | `GET/PUT /v1/tenant/:id/lead-statuses` stores the board in `tenants.settings.lead_statuses`. The leads page loads it and falls back to the previous five columns. |
| MSG91 | Email and WhatsApp adapters replace Resend and AiSensy on the notification path. Sends skip until templates and `MSG91_AUTH_KEY` are set. Acceptance is not recorded as delivery. |
| Usage ledger | Accepted MSG91 sends insert `usage_ledger` rows. Rate cards, reservations, and spending caps are not built. |

## Not done

- This code is not deployed. Production keeps the old worker until the backend deploy.
- RLS policies for a least-privilege API role. The owner connection still bypasses RLS. A role change needs a new `DATABASE_URL`, which is a credential change and was not made.
- Google token encryption, availability, Meet links, and conflict checks.
- Telnyx transfer and the human handoff panel.
- Google Ads, Zapier, and Make beyond the existing generic webhook.
- Subscription bundles, Stripe, and backend entitlement enforcement. `tenants.plan` is still stored and not enforced.
- Live MSG91, Meta, and Google verification.
- Browser pass of the CRM. The Kanban fetch needs a signed-in session.

## Deploy and rollback

Deploy the backend before the CRM so the status route exists. Leave `CALL_QUEUE_ENABLED` unset or `false`. Leave `DEMO_CALLS_ENABLED` unset or `false`. Do not start the voice poller.

If the new database privileges must be reversed, run the `GRANT` statement in `backend/migrations/20261110_phase0_security_consent_usage.sql`. Dropping the new columns and tables is in that same comment and deletes consent and usage rows, so do not run it unless that data is disposable.

If certificate verification fails on the next backend boot, set `DATABASE_SSL_REJECT_UNAUTHORIZED=false`, confirm the API health check, and then fix the certificate instead of leaving verification off.
