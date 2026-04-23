-- ============================================================
-- AcctOS — Migration 014: Phase 4 Helper Functions
-- ============================================================

-- Portal token use counter increment
CREATE OR REPLACE FUNCTION increment_portal_token_use(token_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE client_portal_tokens
  SET use_count = use_count + 1
  WHERE id = token_id;
$$;

-- Update firm plan from Stripe subscription
-- Called by webhook handler, but also useful for admin corrections
CREATE OR REPLACE FUNCTION sync_firm_plan_from_stripe(
  p_firm_id   uuid,
  p_plan_name text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE firms
  SET plan = p_plan_name::plan_tier
  WHERE id = p_firm_id;
$$;

-- Get integration status summary for a firm
CREATE OR REPLACE FUNCTION get_integration_summary(p_firm_id uuid)
RETURNS TABLE (
  provider         text,
  status           text,
  company_name     text,
  last_synced_at   timestamptz,
  clients_mapped   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    i.provider::text,
    i.status::text,
    i.company_name,
    i.last_synced_at,
    COUNT(ci.id) as clients_mapped
  FROM integrations i
  LEFT JOIN client_integrations ci ON ci.integration_id = i.id
  WHERE i.firm_id = p_firm_id
  GROUP BY i.id;
$$;
