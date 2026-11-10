# Security notes

This replaces the "current risk" section of the 10 November audit for the items below. `DOCS/SECURITY_AUDIT.md` remains the inspection record.

## Database

RLS is enabled and there are still no policies. The API connects as the table owner, so RLS does not constrain it. Tenant filters in the API are still required.

`anon` and `authenticated` no longer have table privileges on `public`. The anon key in the browser cannot read or truncate those tables through the Data API. `service_role` still can. Onboarding uses that key on the server.

## Secrets

Credential reads do not return plaintext. `ENCRYPTION_KEY` stays on the backend. Google Calendar tokens are still plaintext columns and the table is empty. Do not connect a Google account until those columns are encrypted.

## Webhooks

Meta lead posts require a valid `X-Hub-Signature-256` over the raw body and `META_APP_SECRET`. Generic lead webhooks require the integration secret. Inbound email requires `INBOUND_WEBHOOK_SECRET`. MSG91 delivery posts require `MSG91_WEBHOOK_SECRET`. MSG91 does not document a signature, so the header is the control.

## Calling

Automatic dialing is off unless `CALL_QUEUE_ENABLED=true`. Public demo dialing is off unless `DEMO_CALLS_ENABLED=true`. Both flags are independent of a successful deploy.

## Still open

The owner database role, missing RLS policies, plaintext Google tokens, and the fact that this code is not yet what Vercel is running.
