-- ============================================================
-- AcctOS — Migration 011: Phase 3 RLS Policies
-- automation_jobs · notification_log · gst_history · r2_objects
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- AUTOMATION JOBS
-- ────────────────────────────────────────────────────────────

ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;

-- All authenticated firm members can view their jobs
CREATE POLICY "jobs_select_firm" ON automation_jobs
  FOR SELECT USING (firm_id = auth_firm_id());

-- Jobs are created by the system (Edge Function via service role)
-- and by the API trigger endpoint — no direct client INSERT needed
CREATE POLICY "jobs_insert_firm" ON automation_jobs
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Owner and senior can cancel/reschedule jobs
CREATE POLICY "jobs_update_owner_senior" ON automation_jobs
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- No DELETE — jobs are immutable records (use 'cancelled' status)

-- ────────────────────────────────────────────────────────────
-- NOTIFICATION LOG (immutable)
-- ────────────────────────────────────────────────────────────

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_select_firm" ON notification_log
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "notif_insert_firm" ON notification_log
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Delivery status updates come from the Resend webhook
-- via the service role — no UPDATE policy needed for regular users

-- ────────────────────────────────────────────────────────────
-- GST HISTORY
-- ────────────────────────────────────────────────────────────

ALTER TABLE gst_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gst_history_select_firm" ON gst_history
  FOR SELECT USING (firm_id = auth_firm_id());

-- Written by the workflow trigger (SECURITY DEFINER function)
-- and by the API when Stage 6 is reached
CREATE POLICY "gst_history_insert_firm" ON gst_history
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

CREATE POLICY "gst_history_update_senior" ON gst_history
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- No DELETE — historical records are permanent (CRA retention)

-- ────────────────────────────────────────────────────────────
-- R2 OBJECTS
-- ────────────────────────────────────────────────────────────

ALTER TABLE r2_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "r2_select_firm" ON r2_objects
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "r2_insert_firm" ON r2_objects
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Only owner/senior can delete (and only < 2 years old, soft delete in practice)
CREATE POLICY "r2_delete_owner" ON r2_objects
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
    AND created_at > now() - interval '2 years'
  );

-- Tier updates: senior can update storage_tier
CREATE POLICY "r2_update_tier_senior" ON r2_objects
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );
