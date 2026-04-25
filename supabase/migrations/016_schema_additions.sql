-- ============================================================
-- AcctOS — Migration 016: Seed additional firm_settings rows
-- + firms.plan column · users.client_ids assignment column
-- + Ensure all existing firms have settings rows
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ADD plan COLUMN TO firms (if not already present)
-- Reflects the Stripe subscription tier.
-- Default 'Starter' — updated by sync_firm_plan_from_stripe().
-- ────────────────────────────────────────────────────────────

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'Starter',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- ADD assigned_client_ids TO users
-- Array of client UUIDs this user is assigned to.
-- Used by doc reminder routing: assigned accountant receives reminders.
-- Populated via the client assignment UI (Phase 2) or directly.
-- ────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS assigned_client_ids uuid[] DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- ADD is_demo FLAG TO firms
-- Prevents cron jobs from firing for demo seed data firms.
-- ────────────────────────────────────────────────────────────

ALTER TABLE firms
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Mark the demo firm (seeded in 005_seed_demo_data.sql) as demo
UPDATE firms SET is_demo = true WHERE name = 'Jensen & Associates CPA';

-- ────────────────────────────────────────────────────────────
-- ADD days_to_deadline COLUMN TO workflows
-- Pre-computed by refresh_all_days_to_deadline() daily cron.
-- Avoids repeated date math on every dashboard query.
-- ────────────────────────────────────────────────────────────

ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS days_to_deadline integer;

-- Back-fill computed values
UPDATE workflows
SET days_to_deadline = EXTRACT(DAY FROM deadline - now())::integer
WHERE deadline IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- REFRESH ALL DAYS TO DEADLINE FUNCTION
-- Called by pg_cron daily at midnight.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_all_days_to_deadline()
RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE workflows
  SET days_to_deadline = EXTRACT(DAY FROM deadline - now())::integer
  WHERE deadline IS NOT NULL
    AND computed_status NOT IN ('Complete');
$$;

-- ────────────────────────────────────────────────────────────
-- ENSURE ALL EXISTING FIRMS HAVE SETTINGS ROWS
-- Defensive: idempotent insert for any firm missing a settings row.
-- ────────────────────────────────────────────────────────────

INSERT INTO firm_settings (firm_id)
SELECT id FROM firms
WHERE id NOT IN (SELECT firm_id FROM firm_settings)
ON CONFLICT (firm_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- ADD MISSING INDEXES FOR COMMON QUERY PATTERNS
-- ────────────────────────────────────────────────────────────

-- Dashboard query: sort all clients by risk score
CREATE INDEX IF NOT EXISTS idx_workflows_firm_status
  ON workflows(firm_id, computed_status, days_to_deadline);

-- At Risk engine: find stale stages
CREATE INDEX IF NOT EXISTS idx_stages_status_updated
  ON stages(workflow_id, status, updated_at)
  WHERE status = 'in_progress';

-- Events feed: latest first per client
CREATE INDEX IF NOT EXISTS idx_events_client_created
  ON events(client_id, created_at DESC);

-- Automation jobs: due processing
CREATE INDEX IF NOT EXISTS idx_automation_jobs_due
  ON automation_jobs(scheduled_for, status)
  WHERE status = 'pending';
