-- ============================================================
-- AcctOS — Migration 013: Phase 4 RLS Policies
-- integrations · client_integrations · client_portal_tokens
-- stripe_subscriptions · billing_events · qbo_sync_log
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- INTEGRATIONS
-- Only owner and senior_accountant can manage integrations.
-- ────────────────────────────────────────────────────────────

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select_firm" ON integrations
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "integrations_insert_owner_senior" ON integrations
  FOR INSERT WITH CHECK (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "integrations_update_owner_senior" ON integrations
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "integrations_delete_owner" ON integrations
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- CLIENT INTEGRATIONS
-- ────────────────────────────────────────────────────────────

ALTER TABLE client_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_integrations_select_firm" ON client_integrations
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "client_integrations_insert_owner_senior" ON client_integrations
  FOR INSERT WITH CHECK (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "client_integrations_update_owner_senior" ON client_integrations
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

CREATE POLICY "client_integrations_delete_owner" ON client_integrations
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- CLIENT PORTAL TOKENS
-- Firm staff can manage tokens for their firm's clients.
-- Portal endpoints authenticate via the token itself (no JWT),
-- so those routes bypass RLS entirely (service role).
-- ────────────────────────────────────────────────────────────

ALTER TABLE client_portal_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_tokens_select_firm" ON client_portal_tokens
  FOR SELECT USING (firm_id = auth_firm_id());

CREATE POLICY "portal_tokens_insert_firm" ON client_portal_tokens
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- Owner and admin can revoke tokens
CREATE POLICY "portal_tokens_update_owner_admin" ON client_portal_tokens
  FOR UPDATE USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'admin')
  );

CREATE POLICY "portal_tokens_delete_owner" ON client_portal_tokens
  FOR DELETE USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- STRIPE SUBSCRIPTIONS
-- Only owner can view and manage billing.
-- ────────────────────────────────────────────────────────────

ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_sub_select_owner" ON stripe_subscriptions
  FOR SELECT USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

-- Updates come only from the Stripe webhook (service role)
-- No direct UPDATE policy for regular users

-- ────────────────────────────────────────────────────────────
-- BILLING EVENTS (immutable audit trail)
-- ────────────────────────────────────────────────────────────

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_events_select_owner" ON billing_events
  FOR SELECT USING (
    firm_id = auth_firm_id()
    AND auth_role() = 'owner'
  );

CREATE POLICY "billing_events_insert_firm" ON billing_events
  FOR INSERT WITH CHECK (firm_id = auth_firm_id());

-- No UPDATE or DELETE — immutable

-- ────────────────────────────────────────────────────────────
-- QBO SYNC LOG (immutable)
-- ────────────────────────────────────────────────────────────

ALTER TABLE qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qbo_sync_select_owner_senior" ON qbo_sync_log
  FOR SELECT USING (
    firm_id = auth_firm_id()
    AND auth_role() IN ('owner', 'senior_accountant')
  );

-- Written by webhook handler via service role — no INSERT policy needed
