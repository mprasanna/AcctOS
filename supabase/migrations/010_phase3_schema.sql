-- ============================================================
-- AcctOS — Migration 010: Phase 3 Schema
-- automation_jobs · notification_log · gst_history · r2_objects
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE job_type AS ENUM (
  'doc_reminder',           -- send document reminder to client
  'doc_escalation',         -- Reminder #2 + escalate to owner
  'deadline_alert',         -- alert accountant N days before deadline
  'overdue_flag',           -- flag workflow as overdue, notify owner
  'auto_create_workflow',   -- create next billing cycle workflow
  'urgent_doc_alert'        -- docs missing + deadline < 5 days
);

CREATE TYPE job_status AS ENUM (
  'pending',    -- scheduled, not yet processed
  'processing', -- being handled right now
  'sent',       -- completed successfully
  'failed',     -- error, may be retried
  'skipped',    -- condition no longer applies (e.g. doc received)
  'cancelled'   -- manually cancelled
);

CREATE TYPE notification_channel AS ENUM (
  'email',
  'in_app'   -- Phase 4+ — stub for future
);

-- ────────────────────────────────────────────────────────────
-- AUTOMATION JOBS
-- Persistent queue. pg_cron calls process-automation-jobs
-- Edge Function every 15 minutes. The function processes all
-- pending jobs whose scheduled_at <= now().
-- ────────────────────────────────────────────────────────────

CREATE TABLE automation_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  workflow_id     uuid REFERENCES workflows(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES clients(id) ON DELETE CASCADE,
  document_ids    uuid[] NOT NULL DEFAULT '{}',  -- specific docs this job relates to

  type            job_type NOT NULL,
  status          job_status NOT NULL DEFAULT 'pending',

  -- When to fire
  scheduled_at    timestamptz NOT NULL DEFAULT now(),

  -- Execution
  attempts        smallint NOT NULL DEFAULT 0,
  max_attempts    smallint NOT NULL DEFAULT 3,
  last_error      text,
  processed_at    timestamptz,

  -- Payload: arbitrary JSON for the Edge Function
  payload         jsonb NOT NULL DEFAULT '{}',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_firm      ON automation_jobs(firm_id);
CREATE INDEX idx_jobs_workflow  ON automation_jobs(workflow_id);
CREATE INDEX idx_jobs_status    ON automation_jobs(status);
-- Optimised for the queue processor query:
CREATE INDEX idx_jobs_pending   ON automation_jobs(scheduled_at)
  WHERE status = 'pending';

CREATE TRIGGER trg_automation_jobs_updated
  BEFORE UPDATE ON automation_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- NOTIFICATION LOG
-- Every email/in-app notification ever sent.
-- email_log (Phase 1) tracks document requests specifically.
-- notification_log is broader: all automated alerts.
-- ────────────────────────────────────────────────────────────

CREATE TABLE notification_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  job_id          uuid REFERENCES automation_jobs(id) ON DELETE SET NULL,
  workflow_id     uuid REFERENCES workflows(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,

  channel         notification_channel NOT NULL DEFAULT 'email',
  recipient_email text NOT NULL,
  recipient_name  text,
  subject         text NOT NULL,
  type            job_type NOT NULL,

  -- Resend tracking
  resend_id       text,          -- Resend message ID
  delivery_status text,          -- 'delivered' | 'bounced' | 'complained' | 'opened'
  delivered_at    timestamptz,
  opened_at       timestamptz,
  bounced_at      timestamptz,

  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_firm     ON notification_log(firm_id);
CREATE INDEX idx_notif_workflow ON notification_log(workflow_id);
CREATE INDEX idx_notif_resend   ON notification_log(resend_id) WHERE resend_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- GST HISTORY
-- Historical net GST amounts per client per period.
-- Drives anomaly detection: "GST 40% lower than last quarter".
-- Populated automatically when a workflow reaches Stage 6.
-- ────────────────────────────────────────────────────────────

CREATE TABLE gst_history (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,

  period      text NOT NULL,        -- "Oct 2025", "Q3 2025"
  deadline    date NOT NULL,
  net_gst     numeric(12,2) NOT NULL,
  filed_at    timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, period)
);

CREATE INDEX idx_gst_history_client ON gst_history(client_id);
CREATE INDEX idx_gst_history_firm   ON gst_history(firm_id);
CREATE INDEX idx_gst_history_period ON gst_history(client_id, deadline DESC);

-- ────────────────────────────────────────────────────────────
-- R2 OBJECTS
-- Tracks files in Cloudflare R2. Mirrors storage_objects but
-- with R2-specific metadata. storage_objects continues to
-- serve Supabase Storage (Phase 2). r2_objects serves R2 (Phase 3+).
-- The upload route checks STORAGE_PROVIDER env var to decide which
-- table to write to. Both are queryable for the firm.
-- ────────────────────────────────────────────────────────────

CREATE TABLE r2_objects (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,

  -- R2 metadata
  bucket          text NOT NULL,   -- 'acct-os-documents' (R2 bucket name)
  key             text NOT NULL,   -- R2 object key: {firm_id}/{client_id}/{wf_id}/{file}
  original_name   text NOT NULL,
  content_type    text,
  size_bytes      bigint,
  etag            text,            -- R2 ETag for integrity verification
  checksum_sha256 text,

  -- Lifecycle tier (CRA 7-year requirement)
  -- R2 does not auto-tier — we track intended tier and handle via API
  storage_tier    text NOT NULL DEFAULT 'standard',  -- 'standard' | 'infrequent' | 'archive'
  tier_updated_at timestamptz,

  -- Uploader
  uploaded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  upload_source   text NOT NULL DEFAULT 'manual',

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_r2_objects_document  ON r2_objects(document_id);
CREATE INDEX idx_r2_objects_workflow  ON r2_objects(workflow_id);
CREATE INDEX idx_r2_objects_firm      ON r2_objects(firm_id);
-- For lifecycle management queries:
CREATE INDEX idx_r2_objects_tier_age  ON r2_objects(firm_id, created_at)
  WHERE storage_tier = 'standard';

-- ────────────────────────────────────────────────────────────
-- AUTO-SCHEDULE JOBS FUNCTION
-- Called when a workflow is created or updated.
-- Inserts the correct automation_jobs rows based on:
--   - cycle_start (for doc_reminder_3d, doc_reminder_6d)
--   - deadline (for deadline_alert_3d, overdue_flag)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION schedule_automation_jobs(
  p_workflow_id uuid,
  p_firm_id     uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wf       workflows%ROWTYPE;
  v_settings firm_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_wf FROM workflows WHERE id = p_workflow_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_settings FROM firm_settings WHERE firm_id = p_firm_id;
  -- Use defaults if no settings row yet
  IF NOT FOUND THEN
    v_settings.doc_reminder_enabled  := true;
    v_settings.escalate_on_reminder2 := true;
    v_settings.deadline_alert_days   := 3;
    v_settings.overdue_flag_enabled  := true;
  END IF;

  -- Delete any previously scheduled pending jobs for this workflow
  -- (safe to re-schedule on workflow update)
  DELETE FROM automation_jobs
  WHERE workflow_id = p_workflow_id
    AND status = 'pending';

  -- Doc reminder #1: Day 3 after cycle_start
  IF v_settings.doc_reminder_enabled THEN
    INSERT INTO automation_jobs (firm_id, workflow_id, client_id, type, scheduled_at, payload)
    VALUES (
      p_firm_id, p_workflow_id, v_wf.client_id,
      'doc_reminder',
      v_wf.cycle_start::timestamptz + interval '3 days',
      jsonb_build_object(
        'reminder_number', 1,
        'workflow_label',  v_wf.label,
        'deadline',        v_wf.deadline
      )
    );

    -- Doc escalation (Reminder #2): Day 6
    IF v_settings.escalate_on_reminder2 THEN
      INSERT INTO automation_jobs (firm_id, workflow_id, client_id, type, scheduled_at, payload)
      VALUES (
        p_firm_id, p_workflow_id, v_wf.client_id,
        'doc_escalation',
        v_wf.cycle_start::timestamptz + interval '6 days',
        jsonb_build_object(
          'reminder_number', 2,
          'workflow_label',  v_wf.label,
          'deadline',        v_wf.deadline
        )
      );
    END IF;
  END IF;

  -- Deadline alert: N days before deadline
  INSERT INTO automation_jobs (firm_id, workflow_id, client_id, type, scheduled_at, payload)
  VALUES (
    p_firm_id, p_workflow_id, v_wf.client_id,
    'deadline_alert',
    v_wf.deadline::timestamptz - (v_settings.deadline_alert_days || ' days')::interval,
    jsonb_build_object(
      'days_before',    v_settings.deadline_alert_days,
      'workflow_label', v_wf.label,
      'deadline',       v_wf.deadline
    )
  );

  -- Urgent doc alert: deadline - 5 days (separate from deadline_alert)
  INSERT INTO automation_jobs (firm_id, workflow_id, client_id, type, scheduled_at, payload)
  VALUES (
    p_firm_id, p_workflow_id, v_wf.client_id,
    'urgent_doc_alert',
    v_wf.deadline::timestamptz - interval '5 days',
    jsonb_build_object('workflow_label', v_wf.label, 'deadline', v_wf.deadline)
  );

  -- Overdue flag: 1 hour after deadline passes
  IF v_settings.overdue_flag_enabled THEN
    INSERT INTO automation_jobs (firm_id, workflow_id, client_id, type, scheduled_at, payload)
    VALUES (
      p_firm_id, p_workflow_id, v_wf.client_id,
      'overdue_flag',
      v_wf.deadline::timestamptz + interval '1 hour',
      jsonb_build_object('workflow_label', v_wf.label, 'deadline', v_wf.deadline)
    );
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- TRIGGER: schedule jobs when a workflow is created
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_schedule_on_workflow_create()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM schedule_automation_jobs(NEW.id, NEW.firm_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_schedule_jobs
  AFTER INSERT ON workflows
  FOR EACH ROW EXECUTE FUNCTION trg_schedule_on_workflow_create();

-- ────────────────────────────────────────────────────────────
-- TRIGGER: record GST history when workflow reaches Stage 6
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_record_gst_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_client clients%ROWTYPE;
BEGIN
  -- Only fire when cur_stage reaches 6 (confirmation)
  IF NEW.cur_stage = 6 AND OLD.cur_stage < 6 AND NEW.type = 'GST/HST' THEN
    SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;

    INSERT INTO gst_history (
      firm_id, client_id, workflow_id,
      period, deadline, net_gst, filed_at
    ) VALUES (
      NEW.firm_id, NEW.client_id, NEW.id,
      NEW.period, NEW.deadline,
      COALESCE(v_client.net_gst, 0),
      now()
    )
    ON CONFLICT (client_id, period) DO UPDATE
      SET net_gst   = EXCLUDED.net_gst,
          filed_at  = EXCLUDED.filed_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_gst_history
  AFTER UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION trg_record_gst_history();

-- ────────────────────────────────────────────────────────────
-- PG_CRON SCHEDULES
-- pg_cron extension must be enabled in Supabase:
--   Dashboard → Database → Extensions → pg_cron → Enable
--
-- These schedules call the Supabase Edge Function via pg_net.
-- Replace SUPABASE_PROJECT_REF and SERVICE_ROLE_KEY with actual values.
-- ────────────────────────────────────────────────────────────

-- Enable pg_net for outbound HTTP from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Process automation job queue every 15 minutes
-- The Edge Function processes pending jobs whose scheduled_at <= now()
SELECT cron.schedule(
  'process-automation-jobs',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://SUPABASE_PROJECT_REF.supabase.co/functions/v1/process-automation-jobs',
      headers := jsonb_build_object(
        'Authorization', 'Bearer SERVICE_ROLE_KEY',
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Daily midnight: refresh days_to_deadline on all workflows
SELECT cron.schedule(
  'refresh-days-to-deadline',
  '0 0 * * *',
  $$ SELECT refresh_all_days_to_deadline(); $$
);

-- Daily 6am ET: auto-create next-cycle workflows for Monthly filers
-- (auto_create_workflows setting checked inside Edge Function)
SELECT cron.schedule(
  'auto-create-monthly-workflows',
  '0 10 1 * *',    -- 10:00 UTC = 6:00 ET on 1st of each month
  $$
    SELECT net.http_post(
      url     := 'https://SUPABASE_PROJECT_REF.supabase.co/functions/v1/auto-create-workflows',
      headers := jsonb_build_object(
        'Authorization', 'Bearer SERVICE_ROLE_KEY',
        'Content-Type',  'application/json'
      ),
      body    := '{"freq":"Monthly"}'::jsonb
    );
  $$
);

-- Quarterly on the 2nd (day after quarter end)
SELECT cron.schedule(
  'auto-create-quarterly-workflows',
  '0 10 2 1,4,7,10 *',   -- Jan 2, Apr 2, Jul 2, Oct 2 at 10:00 UTC
  $$
    SELECT net.http_post(
      url     := 'https://SUPABASE_PROJECT_REF.supabase.co/functions/v1/auto-create-workflows',
      headers := jsonb_build_object(
        'Authorization', 'Bearer SERVICE_ROLE_KEY',
        'Content-Type',  'application/json'
      ),
      body    := '{"freq":"Quarterly"}'::jsonb
    );
  $$
);
