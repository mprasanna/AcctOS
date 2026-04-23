-- ============================================================
-- AcctOS — Migration 008: Phase 2 RLS Policies
-- firm_settings · storage_objects · auto_advance_log
-- workflow_links · user_invitations + Storage bucket
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FIRM SETTINGS
-- ────────────────────────────────────────────────────────────

ALTER TABLE firm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_settings_select" ON firm_settings
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "firm_settings_update_owner" ON firm_settings
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- No INSERT — created automatically by trigger on firm creation
-- No DELETE — settings row lives as long as the firm does

-- ────────────────────────────────────────────────────────────
-- STORAGE OBJECTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_objects_select_firm" ON storage_objects
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "storage_objects_insert_firm" ON storage_objects
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Only owner/senior can delete files
CREATE POLICY "storage_objects_delete_senior" ON storage_objects
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- ────────────────────────────────────────────────────────────
-- AUTO ADVANCE LOG (immutable)
-- ────────────────────────────────────────────────────────────

ALTER TABLE auto_advance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_advance_select_firm" ON auto_advance_log
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "auto_advance_insert_firm" ON auto_advance_log
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- No UPDATE or DELETE — immutable audit trail

-- ────────────────────────────────────────────────────────────
-- WORKFLOW LINKS
-- ────────────────────────────────────────────────────────────

ALTER TABLE workflow_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_links_select_firm" ON workflow_links
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "workflow_links_insert_owner_senior" ON workflow_links
  FOR INSERT WITH CHECK (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "workflow_links_update_owner_senior" ON workflow_links
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "workflow_links_delete_owner" ON workflow_links
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- USER INVITATIONS
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Owner can see all invitations for their firm
CREATE POLICY "invitations_select_owner" ON user_invitations
  FOR SELECT USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- Only owner can create invitations
CREATE POLICY "invitations_insert_owner" ON user_invitations
  FOR INSERT WITH CHECK (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- Owner can cancel/delete pending invitations
CREATE POLICY "invitations_delete_owner" ON user_invitations
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
    AND accepted_at IS NULL  -- cannot delete accepted invitations (audit trail)
  );

-- ────────────────────────────────────────────────────────────
-- SUPABASE STORAGE BUCKET POLICIES
-- Bucket name: "client-documents"
-- Path convention: {firm_id}/{client_id}/{workflow_id}/{filename}
--
-- These SQL statements configure the Storage RLS via Supabase's
-- storage.objects table. Run in the Supabase SQL editor or
-- configure via the Dashboard → Storage → Policies.
-- ────────────────────────────────────────────────────────────

-- Create bucket (run once)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('client-documents', 'client-documents', false);

-- SELECT: user can read files in their firm's folder
CREATE POLICY "storage_select_own_firm" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (auth_firm_id())::text
  );

-- INSERT: user can upload files to their firm's folder
CREATE POLICY "storage_insert_own_firm" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (auth_firm_id())::text
  );

-- UPDATE: owner and senior_accountant only
CREATE POLICY "storage_update_senior" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (auth_firm_id())::text
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- DELETE: owner only
CREATE POLICY "storage_delete_owner" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (auth_firm_id())::text
    AND auth_role() = 'owner'
  );
