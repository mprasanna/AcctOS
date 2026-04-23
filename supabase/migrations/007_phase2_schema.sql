-- ============================================================
-- AcctOS — Migration 007: Phase 2 Schema Additions
-- firm_settings · storage_objects · auto_advance_log
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FIRM SETTINGS
-- Per-firm automation preferences (mirrors SettingsPage toggles)
-- ────────────────────────────────────────────────────────────

CREATE TABLE firm_settings (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id               uuid NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,

  -- Automation rules
  auto_create_workflows boolean NOT NULL DEFAULT true,
  doc_reminder_enabled  boolean NOT NULL DEFAULT true,
  escalate_on_reminder2 boolean NOT NULL DEFAULT true,
  deadline_alert_days   smallint NOT NULL DEFAULT 3,   -- alert X days before deadline
  overdue_flag_enabled  boolean NOT NULL DEFAULT true,

  -- Notification preferences
  notify_owner_on_escalation boolean NOT NULL DEFAULT true,
  notify_assigned_on_advance boolean NOT NULL DEFAULT true,

  -- Filing preferences
  dual_review_threshold numeric(12,2) NOT NULL DEFAULT 10000.00,  -- GST > this → dual review

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_firm_settings_updated
  BEFORE UPDATE ON firm_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Default settings row auto-created when firm is created
CREATE OR REPLACE FUNCTION create_default_firm_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO firm_settings (firm_id) VALUES (NEW.id)
  ON CONFLICT (firm_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_firms_create_settings
  AFTER INSERT ON firms
  FOR EACH ROW EXECUTE FUNCTION create_default_firm_settings();

-- ────────────────────────────────────────────────────────────
-- STORAGE OBJECTS
-- Tracks uploaded files in Supabase Storage / R2.
-- Separate from `documents` table — documents are the checklist
-- items; storage_objects are the actual files behind them.
-- One document checklist item can have multiple file versions.
-- ────────────────────────────────────────────────────────────

CREATE TABLE storage_objects (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  document_id     uuid REFERENCES documents(id) ON DELETE SET NULL,  -- linked checklist item

  -- Storage metadata
  bucket          text NOT NULL DEFAULT 'client-documents',
  storage_path    text NOT NULL,            -- {firm_id}/{client_id}/{workflow_id}/{filename}
  original_name   text NOT NULL,
  content_type    text,
  size_bytes      bigint,
  checksum        text,                     -- SHA-256, verified on upload

  -- Version tracking
  version         smallint NOT NULL DEFAULT 1,
  superseded_by   uuid REFERENCES storage_objects(id),

  -- Uploader
  uploaded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  upload_source   text NOT NULL DEFAULT 'manual',  -- 'manual' | 'client_portal' | 'auto_sync'

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_storage_objects_document  ON storage_objects(document_id);
CREATE INDEX idx_storage_objects_workflow  ON storage_objects(workflow_id);
CREATE INDEX idx_storage_objects_firm      ON storage_objects(firm_id);

-- ────────────────────────────────────────────────────────────
-- AUTO ADVANCE LOG
-- Immutable audit trail of every automatic stage advancement.
-- Answers: "why did Stage 3 advance without me clicking anything?"
-- ────────────────────────────────────────────────────────────

CREATE TABLE auto_advance_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  workflow_id     uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  stage_n         smallint NOT NULL,
  trigger_type    text NOT NULL,  -- 'all_tasks_complete' | 'doc_received' | 'bookkeeping_linked'
  trigger_detail  text,           -- human-readable reason
  previous_status text NOT NULL,
  new_status      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_advance_workflow ON auto_advance_log(workflow_id);
CREATE INDEX idx_auto_advance_firm     ON auto_advance_log(firm_id);

-- ────────────────────────────────────────────────────────────
-- WORKFLOW LINKS
-- For bookkeeping → GST Stage 1 feed.
-- When the linked "source" workflow completes a specific stage,
-- the target workflow auto-advances its target stage.
-- ────────────────────────────────────────────────────────────

CREATE TABLE workflow_links (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  source_workflow_id  uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_stage_n      smallint NOT NULL,   -- when THIS stage completes on source...
  target_workflow_id  uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  target_stage_n      smallint NOT NULL,   -- ...advance THIS stage on target
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_workflow_id, target_workflow_id)
);

CREATE INDEX idx_workflow_links_source ON workflow_links(source_workflow_id);
CREATE INDEX idx_workflow_links_firm   ON workflow_links(firm_id);

-- ────────────────────────────────────────────────────────────
-- INVITED USERS
-- Tracks pending invitations before the user accepts.
-- ────────────────────────────────────────────────────────────

CREATE TABLE user_invitations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        user_role NOT NULL DEFAULT 'accountant',
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  token       text NOT NULL UNIQUE,       -- used in the invite link
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, email)
);

CREATE INDEX idx_invitations_firm  ON user_invitations(firm_id);
CREATE INDEX idx_invitations_email ON user_invitations(email);
CREATE INDEX idx_invitations_token ON user_invitations(token);
