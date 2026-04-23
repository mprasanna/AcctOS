-- ============================================================
-- AcctOS — Migration 004: Row Level Security
-- All data is isolated at the database level by firm_id.
-- Application-level filtering is defence-in-depth only.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- HELPER: extract firm_id from JWT claims
-- ────────────────────────────────────────────────────────────

-- JWT claim: { firm_id: "uuid", role: "owner"|"accountant"|... }

CREATE OR REPLACE FUNCTION auth_firm_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'firm_id', '')::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_role() RETURNS text AS $$
  SELECT current_setting('request.jwt.claims', true)::json->>'role';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- FIRMS
-- ────────────────────────────────────────────────────────────

ALTER TABLE firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firms_select_own" ON firms
  FOR SELECT USING (id = auth_firm_id());

CREATE POLICY "firms_update_owner" ON firms
  FOR UPDATE USING (
    id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_same_firm" ON users
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "users_insert_owner" ON users
  FOR INSERT WITH CHECK (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

CREATE POLICY "users_update_own_or_owner" ON users
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND (id = auth.uid() OR auth_role() = 'owner')
  );

CREATE POLICY "users_delete_owner" ON users
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
    AND id <> auth.uid()  -- cannot delete yourself
  );

-- ────────────────────────────────────────────────────────────
-- CLIENTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_firm" ON clients
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "clients_insert_firm" ON clients
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

CREATE POLICY "clients_update_firm" ON clients
  FOR UPDATE USING (firm_id = auth_firm_id());

CREATE POLICY "clients_delete_owner_senior" ON clients
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- ────────────────────────────────────────────────────────────
-- WORKFLOWS
-- ────────────────────────────────────────────────────────────

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_select_firm" ON workflows
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "workflows_insert_firm" ON workflows
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

CREATE POLICY "workflows_update_firm" ON workflows
  FOR UPDATE USING (firm_id = auth_firm_id());

CREATE POLICY "workflows_delete_owner_senior" ON workflows
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- ────────────────────────────────────────────────────────────
-- STAGES
-- ────────────────────────────────────────────────────────────

ALTER TABLE stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stages_select_firm" ON stages
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "stages_insert_firm" ON stages
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Stage advancement: blocked stages cannot be advanced by non-owners
CREATE POLICY "stages_update_firm" ON stages
  FOR UPDATE USING (firm_id = auth_firm_id());

CREATE POLICY "stages_delete_owner" ON stages
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- TASKS
-- ────────────────────────────────────────────────────────────

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_firm" ON tasks
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "tasks_insert_firm" ON tasks
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

CREATE POLICY "tasks_update_firm" ON tasks
  FOR UPDATE USING (firm_id = auth_firm_id());

CREATE POLICY "tasks_delete_senior_owner" ON tasks
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_firm" ON documents
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "documents_insert_firm" ON documents
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

CREATE POLICY "documents_update_firm" ON documents
  FOR UPDATE USING (firm_id = auth_firm_id());

CREATE POLICY "documents_delete_senior_owner" ON documents
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- ────────────────────────────────────────────────────────────
-- EMAIL LOG
-- ────────────────────────────────────────────────────────────

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_log_select_firm" ON email_log
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "email_log_insert_firm" ON email_log
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- email log is immutable after insert
-- no UPDATE or DELETE policies

-- ────────────────────────────────────────────────────────────
-- EVENTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_firm" ON events
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "events_insert_firm" ON events
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- events are immutable (audit trail)
-- no UPDATE or DELETE policies

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKET RLS (documents)
-- Apply in Supabase dashboard under Storage > Policies
-- ────────────────────────────────────────────────────────────

-- Bucket: "client-documents"
-- Policy: users can only access their firm's documents

-- INSERT: authenticated users, path must start with firm_id/
-- SELECT: authenticated users, path starts with firm_id/
-- DELETE: owner and senior_accountant only

-- NOTE: Configure these in the Supabase dashboard as Storage Policies,
-- or via Supabase CLI in supabase/storage.sql (Phase 1 setup step)
