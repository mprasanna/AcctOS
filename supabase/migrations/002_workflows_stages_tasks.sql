-- ============================================================
-- AcctOS — Migration 002: Workflows · Stages · Tasks
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE workflow_type AS ENUM (
  'GST/HST',
  'T1',
  'T2',
  'Payroll',
  'Bookkeeping',
  'Financial Statements',
  'Other'
);

CREATE TYPE workflow_status AS ENUM (
  'On Track',
  'At Risk',
  'Overdue',
  'Complete'
);

CREATE TYPE stage_status AS ENUM (
  'pending',
  'in_progress',
  'complete',
  'blocked',
  'missed'
);

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'complete',
  'blocked',
  'missed'
);

-- ────────────────────────────────────────────────────────────
-- WORKFLOWS
-- ────────────────────────────────────────────────────────────

CREATE TABLE workflows (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id                 uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  type                    workflow_type NOT NULL,
  label                   text NOT NULL,
  period                  text NOT NULL,                    -- "Oct 2025", "Q3 2025"
  deadline                date NOT NULL,
  cycle_start             date NOT NULL,
  cur_stage               smallint NOT NULL DEFAULT 1
                            CHECK (cur_stage BETWEEN 1 AND 6),
  task_in_progress_days   smallint NOT NULL DEFAULT 0,
  -- computed status — refreshed by edge function on any mutation
  computed_status         workflow_status NOT NULL DEFAULT 'On Track',
  computed_flags          jsonb NOT NULL DEFAULT '[]',      -- string[]
  days_to_deadline        integer,                          -- signed, negative = overdue
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_client  ON workflows(client_id);
CREATE INDEX idx_workflows_firm    ON workflows(firm_id);
CREATE INDEX idx_workflows_status  ON workflows(computed_status);
CREATE INDEX idx_workflows_deadline ON workflows(deadline);

CREATE TRIGGER trg_workflows_updated
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- STAGES
-- ────────────────────────────────────────────────────────────

CREATE TABLE stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  n               smallint NOT NULL CHECK (n BETWEEN 1 AND 6),
  name            text NOT NULL,
  status          stage_status NOT NULL DEFAULT 'pending',
  date_label      text,                   -- human-readable "Oct 2", "Missed Jul 31"
  completed_at    timestamptz,
  gate            text,                   -- machine-readable condition string
  gate_label      text,                   -- human-readable gate description
  blocked         boolean NOT NULL DEFAULT false,
  block_reason    text,
  missed          boolean NOT NULL DEFAULT false,
  note            text,                   -- stageNotes equivalent
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workflow_id, n)
);

CREATE INDEX idx_stages_workflow ON stages(workflow_id);
CREATE INDEX idx_stages_firm     ON stages(firm_id);

CREATE TRIGGER trg_stages_updated
  BEFORE UPDATE ON stages
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- TASKS
-- ────────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  stage_n         smallint CHECK (stage_n BETWEEN 1 AND 6),
  title           text NOT NULL,
  assigned_to     uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_initials text,               -- denormalised for display when user deleted
  due_date        date,
  status          task_status NOT NULL DEFAULT 'pending',
  sort_order      smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_workflow ON tasks(workflow_id);
CREATE INDEX idx_tasks_firm     ON tasks(firm_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);

CREATE TRIGGER trg_tasks_updated
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
