-- ============================================================
-- AcctOS — Migration 006: SQL Helper Functions
-- Called via supabase.rpc() from API route handlers.
-- ============================================================

-- ── Increment reminder_count on a document ───────────────────
CREATE OR REPLACE FUNCTION increment_reminder_count(doc_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE documents
  SET reminder_count = reminder_count + 1
  WHERE id = doc_id
    AND firm_id = auth_firm_id();  -- RLS enforcement even inside function
$$;

-- ── Compute days_to_deadline for a workflow ──────────────────
-- Called when updating a workflow deadline.
CREATE OR REPLACE FUNCTION compute_days_to_deadline(deadline_date date)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(DAY FROM (deadline_date::timestamp - CURRENT_DATE::timestamp))::integer;
$$;

-- ── Auto-refresh days_to_deadline on all workflows ───────────
-- Called by pg_cron daily at midnight (Phase 3).
-- In Phase 1, the API computes this at query time.
CREATE OR REPLACE FUNCTION refresh_all_days_to_deadline()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE workflows
  SET days_to_deadline = EXTRACT(DAY FROM (deadline::timestamp - CURRENT_DATE::timestamp))::integer;
$$;

-- ── Get firm summary stats ────────────────────────────────────
-- Used by /api/dashboard for fast aggregate counts.
CREATE OR REPLACE FUNCTION firm_workflow_stats(p_firm_id uuid)
RETURNS TABLE (
  computed_status text,
  count           bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT computed_status::text, COUNT(*) as count
  FROM workflows
  WHERE firm_id = p_firm_id
  GROUP BY computed_status;
$$;
