# CortexFlow — Product Conversion Audit

**Date:** 20 September 2026  
**Scope:** Live repo + production schema. No destructive changes during this audit.  
**Rule:** Reuse what exists. Only the missing/weak parts get built.

---

## Inventory

| Capability | Status | Current implementation | Missing / weak | Recommended change | Files | Tables | Risk |
|---|---|---|---|---|---|---|---|
| AI outbound call loop | **EXISTS** | Queue → `startOutboundCall` → Pipecat → Telnyx → `/v1/calls/result` | Telnyx D51 live dials | Do not touch voice infra | `startOutboundCall.js`, `internal.js`, `pipecat-server/` | `call_queue`, `calls` | High if touched |
| Project + kb_products | **EXISTS** | Project KB + `selectProducts` when `lead.project_id` set | Ingest never sets `project_id` (0/17 live leads) | Resolve project on ingest/start; block generic dial if ambiguous | `callContextBuilder.js`, `productSelector.js`, `leads.js` | `projects`, `kb_products`, `leads.project_id` | Medium |
| Default / missing project | **MISSING** | Call still starts with empty products | No default, no operator warning | Auto-assign if one active project; else `needs_project_assignment` and no enqueue | — | `leads.metadata` | Low |
| Call brief | **EXISTS** | `buildCallContext` + products | Empty when no project | Persist resolved `project_id` on lead + `calls` | `startOutboundCall.js` | `calls.project_id` | Low |
| Lead ingest | **PARTIAL** | `/v1/lead/ingest`, CSV, webhook | `project_id` omitted; CSV no project column | Accept `project_id`; resolve; skip queue if unassigned | `leads.js`, `webhookHandler.js`, `import/route.ts` | `leads` | Medium |
| Pre-call intent | **EXISTS** | Regex from inquiry → `lead_context` | No AI fallback | Keep rules; do not invent LLM extraction | `leadIntentExtractor.js` | `lead_context` | Low |
| Post-call intelligence | **PARTIAL** | Pipecat tools can `updateLeadMemory` | `/calls/result` never writes `lead_context` | Persist summary/outcome/score after every result | `newCalls.js` | `lead_context` | Medium |
| Transcript + per-call summary | **EXISTS** | `call_transcripts.summary`, CRM Calls + lead history | No lead-level summary card | Surface `lead_context.last_summary` | `newCalls.js`, lead detail | `call_transcripts` | Low |
| Appointment from voice | **EXISTS** | ISO → metadata + `appointments` + reminders | Manual schedule API skips `appointments` row | Reuse voice path; do not rebuild | `appointmentFromCall.js`, `reminderJob.js` | `appointments` | Low |
| Callback scheduling | **PARTIAL** | Outcome `callback` → WhatsApp only | No datetime parse, no queue, no status | Parse time, enqueue, `callback_scheduled` | `newCalls.js` | `call_queue`, `lead_context.callback_time` | Medium |
| Lead statuses | **EXISTS** | `new`…`closed` including `qualified`, `callback_scheduled` | Call result never sets those | Map outcomes + score to status | `leadService.js`, `newCalls.js` | `leads.status` | Low |
| Numeric lead score | **MISSING** | `interest_level` text only | No 0–100, no temperature, no signals | Deterministic scorer on `lead_context` | — | `lead_context` (new cols) | Low |
| Human handoff | **MISSING** | `leads.assigned_to` unused | No UI, no flag | Set `human_handoff`; PATCH `assigned_to` | — | `leads.assigned_to` | Low |
| Teams as security | **DO NOT** | Tenant-wide lists | — | Keep assignment organizational only | team pages | `team_members` | High if scoped |
| Next action | **MISSING** in UI | Simulated metadata only | Not on live Pipecat path | Derive + store `next_action` / `next_action_at` | — | `lead_context` | Low |
| Dashboard funnel | **PARTIAL** | Total → Called → Interested → Appt → Confirmed | No TTF C, weak source funnel, no needs-attention | Extend `buildDashboardAnalytics`; never invent | `analyticsFromLeads.ts`, `/api/stats` | leads + calls | Low |
| Time to first call | **MISSING** | `calls.started_at` exists | Not computed | `MIN(calls.started_at) - leads.created_at` | GET leads join | `calls` | Low |
| Source attribution | **PARTIAL** | Count by `leads.source` | No called/qualified/appt per source | Aggregate real rows only | `analyticsFromLeads.ts` | `leads.source` | Low |
| Usage / billing readiness | **EXISTS** | `tenant_usage` + Usage page | No “leads processed”; `demo_calls_used` hidden | Add month lead count; keep no Stripe | `usageTracker.js`, `usage/page.tsx` | `tenant_usage` | Low |
| Estimated pipeline | **MISSING** | No deal value | — | Optional `tenants.settings.average_deal_value`; label Estimated | tenant settings | `tenants.settings` | Low |
| Communications | **EXISTS** | `metadata.communications_log` + table | Result writes metadata only | Keep; do not duplicate | `communications/page.tsx` | `communications` | Low |
| Lead detail workspace | **PARTIAL** | Contact, status, calls, transcript, notes, Start AI Call | No score, project, next action, qualification, assign | Add sections on existing page | `leads/[id]/page.tsx` | — | Low |
| Auth / JWT / Telnyx / queue | **EXISTS** | Do not change | — | Leave alone | `auth.js` | — | Critical |

---

## Decision: schema

Reuse `lead_context` (already holds budget, location, requirement, interest, objections, callback_time, last_summary). Add only columns that cannot live there cleanly:

`score`, `temperature`, `next_action`, `next_action_at`, `human_handoff`, `ai_confidence`, `score_signals`, `preferred_product`, `decision_maker`.

No new tables. No Stripe. No new assignment system (`assigned_to` already exists).

---

## What we will not build

- New knowledge/RAG stack (kb_products is enough)
- ML scoring
- Workflow automation engine
- Team-scoped RLS
- Stripe / plan enforcement
- Voice/Telnyx/Pipecat changes
- Dashboard redesign
- Duplicate appointment or reminder systems
