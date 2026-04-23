-- ============================================================
-- AcctOS — Migration 003: Documents · Events
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE document_status AS ENUM (
  'pending',
  'received',
  'rejected'
);

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE documents (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id         uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name                text NOT NULL,
  status              document_status NOT NULL DEFAULT 'pending',
  reminder_count      smallint NOT NULL DEFAULT 0,
  last_reminder_at    timestamptz,
  uploaded_at         timestamptz,
  upload_source       text,           -- "Client upload" | "Auto-sync" | "Manual"
  storage_path        text,           -- Supabase Storage / R2 object path
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_workflow ON documents(workflow_id);
CREATE INDEX idx_documents_client   ON documents(client_id);
CREATE INDEX idx_documents_firm     ON documents(firm_id);
CREATE INDEX idx_documents_status   ON documents(status);

CREATE TRIGGER trg_documents_updated
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- EMAIL LOG
-- ────────────────────────────────────────────────────────────

CREATE TABLE email_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  type        text NOT NULL,        -- "Initial Request" | "Reminder #1" | etc.
  sent_at     timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'sent'
);

CREATE INDEX idx_email_log_client ON email_log(client_id);
CREATE INDEX idx_email_log_firm   ON email_log(firm_id);

-- ────────────────────────────────────────────────────────────
-- EVENTS (activity feed)
-- ────────────────────────────────────────────────────────────

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES workflows(id) ON DELETE SET NULL,
  who         text NOT NULL,        -- user name or "System"
  action      text NOT NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_client   ON events(client_id);
CREATE INDEX idx_events_firm     ON events(firm_id);
CREATE INDEX idx_events_workflow ON events(workflow_id);
-- descending index for feed queries
CREATE INDEX idx_events_created  ON events(created_at DESC);
