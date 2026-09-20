-- Conversion intelligence on existing lead_context (idempotent).
-- Does not drop or rename columns. Safe on a live database.

ALTER TABLE public.lead_context
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS temperature text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_handoff boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence text,
  ADD COLUMN IF NOT EXISTS score_signals jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preferred_product text,
  ADD COLUMN IF NOT EXISTS decision_maker text;

COMMENT ON COLUMN public.lead_context.score IS 'Deterministic 0-100 qualification score; null until a conversation exists';
COMMENT ON COLUMN public.lead_context.temperature IS 'cold|warm|qualified|hot derived from score';
COMMENT ON COLUMN public.lead_context.next_action IS 'call_now|callback|appointment|human_followup|assign_project|nurture|closed';
