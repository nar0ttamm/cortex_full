# Implementation gap analysis

No file in this workspace is named "CortexFlow Master Feature Checklist". The comparison below uses the feature set in the current audit request, the live code, and `DOCS/PROJECT_STATUS.md` (May 2026), which is stale where it says the pilot is ready.

Legend: **Have** means a current code path. **Reuse** means extend that path. **Change** means the path exists and is unsafe or incomplete. **Missing** means there is nothing to extend.

## Identity and tenancy

| Capability | State | Action |
|---|---|---|
| Signup, login, session | Have | Reuse `crm/middleware.ts`, `lib/auth.ts`, `backend/middleware/auth.js` |
| Tenant row and admin profile | Have | Reuse onboarding. It marks `onboarding_completed` immediately and creates no project |
| Roles | Have as three strings | Change: enforce them on settings, credentials, and dial, or stop showing role as a control |
| Team-scoped lead visibility | Missing | `assigned_to` exists. List queries do not filter by it |
| RLS as the isolation boundary | Missing in effect | Change the database role and add policies. Do not add a second tenant column |

## CRM

| Capability | State | Action |
|---|---|---|
| Leads, search, filters, CSV import/export | Have | Reuse. Fix CSV parsing before large imports. Search is client-side |
| Kanban view | Have, fixed columns | Reuse `leads/page.tsx`. Column config is missing |
| Notes | Have, inside `metadata.notes` | Reuse the notes routes. A separate notes table is optional, not required |
| Activity | Partial | `activity_logs` is thin. Status history is inside lead metadata. Reuse both before adding a third log |
| Projects and products | Have | Reuse `projects` and `kb_products`. `knowledge_bases` is the prose slot and is empty |
| Dashboard | Have | Reuse `/` and `analyticsFromLeads.ts`. `/analytics` is an unlinked page |
| Usage display | Have | Reuse `/usage`. Enforcement is missing |
| Settings | Have | Reuse `/tenant`. Authorization is too wide |

## Voice

| Capability | State | Action |
|---|---|---|
| Queue, dial, STT, LLM, TTS, result callback | Have | Reuse the whole Pipecat path |
| Attempt cap | Have in name only | Change `migrateLegacyScheduledLeads`, `canAttemptLead`, and `markCallFailed` |
| Provider call id | Missing on `calls` | Add a column later. Do not block the loop fix on it |
| Consent and opt-out | Missing | Required before commercial dialing. No table to reuse |
| Transfer / forwarding | Missing | Do not add a settings page until a Telnyx transfer action exists |
| Human handoff flag | Have | Reuse `human_handoff` and `assigned_to`. It is not a live transfer |
| Recordings | Missing | No bucket |

## Channels and calendar

| Capability | State | Action |
|---|---|---|
| Email send | Code complete, credentials empty on `credentials` | Reuse `notificationService.js`. Put Resend on the **backend** project if it is only on the CRM project |
| Email inbound | Have, unsigned, cross-tenant | Change `email.js` before trusting it |
| WhatsApp | AiSensy templates only | Reuse the sender. Session chat, opt-out, and delivery webhooks are missing |
| Meta leads | OAuth and webhook code | Change: verify `X-Hub-Signature-256` |
| Google Ads | Missing | Do not pretend `google_lead_forms` is the Ads API |
| Generic webhooks | Have | Change: reject a null secret |
| Calendar UI and table | Have, 0 rows | Reuse `appointments`. Reminder job still reads lead metadata. Pick one |
| Google sync | Code, 0 tokens, plaintext | Do not enable until tokens are encrypted like `credentials` |

## Commercial

| Capability | State | Action |
|---|---|---|
| Plan names and trial timestamp | Have | Change: either enforce in `startOutboundCall` or remove the numbers from `signup/page.tsx` and the landing pricing copy |
| Stripe, invoices, bundles | Missing | New. There is no subscription table. Do not start here |
| Per-tenant caller ID, inbound DID | Missing | New, after one shared number completes calls safely |

## Docs and ops that block a safe build

| Item | State |
|---|---|
| `DOCS/PRODUCT.md`, `TECHNICAL_MANUAL.md`, `AI_CONTEXT.md` | Obsolete LiveKit / FreeSWITCH / Twilio descriptions. Do not implement from them |
| Schema in git | One SQL file. Live history is the 10 Supabase migrations. A new feature that needs a column should be a new migration, not an edit of production by hand |
| Tests | 18 unit tests. No test around the queue. Add one that fails if a 502 inserts another queue row |
| `livekit-server-sdk` | Unused dependency. Remove only when you are editing dependencies on purpose |

## What a future plan should not rebuild

- The CRM shell, sidebar, and lead pages.
- Express routers and `startOutboundCall`.
- Pipecat `server.py` / `bot.py` media path.
- `leads`, `projects`, `kb_products`, `call_queue`, `calls`, `lead_context`, `tenant_usage`.

## What must be modified before new features stack on the dialer

1. The re-enqueue loop.
2. Tenant enforcement in Postgres.
3. Credential read authorization.
4. Webhook authentication.
5. A consent gate in `enqueueCall` and `startOutboundCall`.
