-- ============================================================
-- AcctOS Migration 017 — Full Client Portal
-- Corrected for actual schema (users.id = auth UUID, no firm_users)
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Extend firm_settings ──────────────────────────────────
-- firm_settings already has firm_id (uuid) and one row per firm.
-- Adding portal branding + e-signature columns.

ALTER TABLE firm_settings
  ADD COLUMN IF NOT EXISTS portal_logo_url       TEXT,
  ADD COLUMN IF NOT EXISTS portal_tagline        TEXT DEFAULT 'Your secure accounting portal',
  ADD COLUMN IF NOT EXISTS portal_esign_provider TEXT DEFAULT 'none'
    CHECK (portal_esign_provider IN ('none','docusign','dropboxsign')),
  ADD COLUMN IF NOT EXISTS portal_esign_key      TEXT,
  ADD COLUMN IF NOT EXISTS portal_esign_secret   TEXT;

-- ── 2. portal_users ─────────────────────────────────────────
-- Business owner accounts. Completely separate from firm staff (users table).
-- auth_user_id links to Supabase Auth — portal users log in with email+password.
-- One portal account per client per firm.

CREATE TABLE IF NOT EXISTS portal_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id       UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  auth_user_id  UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  UNIQUE(firm_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_users_firm    ON portal_users(firm_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_client  ON portal_users(client_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_auth    ON portal_users(auth_user_id);

-- ── 3. portal_invites ───────────────────────────────────────
-- Firm sends a "set up your portal" email to the business owner.
-- Token in the email maps to this row. Expires in 7 days.

CREATE TABLE IF NOT EXISTS portal_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(48), 'hex'),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_invites_token  ON portal_invites(token);
CREATE INDEX IF NOT EXISTS idx_portal_invites_client ON portal_invites(client_id);
CREATE INDEX IF NOT EXISTS idx_portal_invites_firm   ON portal_invites(firm_id);

-- ── 4. portal_messages ──────────────────────────────────────
-- Threaded messages between business owner (portal) and accountant (firm).
-- workflow_id is nullable — messages can be general or attached to a filing.
-- sender_id is either portal_users.id (client) or users.id (accountant).

CREATE TABLE IF NOT EXISTS portal_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id  UUID REFERENCES workflows(id) ON DELETE SET NULL,
  sender_type  TEXT NOT NULL CHECK (sender_type IN ('client','accountant')),
  sender_id    UUID NOT NULL,
  body         TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_messages_firm     ON portal_messages(firm_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_client   ON portal_messages(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_messages_workflow ON portal_messages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_unread
  ON portal_messages(firm_id, read_at)
  WHERE read_at IS NULL AND sender_type = 'client';

-- ── 5. RLS — portal_users ────────────────────────────────────
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;

-- Firm staff (users.id = auth.uid()) can read portal users for their firm
CREATE POLICY "firm_staff_read_portal_users" ON portal_users
  FOR SELECT USING (
    firm_id IN (
      SELECT firm_id FROM users WHERE id = auth.uid()
    )
  );

-- Portal users can read their own record
CREATE POLICY "portal_user_read_self" ON portal_users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Firm staff (owner, senior_accountant, admin roles) can create portal users
CREATE POLICY "firm_staff_insert_portal_user" ON portal_users
  FOR INSERT WITH CHECK (
    firm_id IN (
      SELECT firm_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner','senior_accountant','admin')
    )
  );

-- Firm owners can delete portal users (revoke access)
CREATE POLICY "firm_owner_delete_portal_user" ON portal_users
  FOR DELETE USING (
    firm_id IN (
      SELECT firm_id FROM users
      WHERE id = auth.uid()
      AND role = 'owner'
    )
  );

-- ── 6. RLS — portal_invites ──────────────────────────────────
ALTER TABLE portal_invites ENABLE ROW LEVEL SECURITY;

-- Firm staff can manage invites for their firm
CREATE POLICY "firm_staff_manage_invites" ON portal_invites
  FOR ALL USING (
    firm_id IN (
      SELECT firm_id FROM users WHERE id = auth.uid()
    )
  );

-- ── 7. RLS — portal_messages ─────────────────────────────────
ALTER TABLE portal_messages ENABLE ROW LEVEL SECURITY;

-- Firm staff see all messages for their firm
CREATE POLICY "firm_staff_read_messages" ON portal_messages
  FOR SELECT USING (
    firm_id IN (
      SELECT firm_id FROM users WHERE id = auth.uid()
    )
  );

-- Portal users see only their own client's messages
CREATE POLICY "portal_user_read_own_messages" ON portal_messages
  FOR SELECT USING (
    client_id IN (
      SELECT client_id FROM portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Firm staff can insert replies (sender_type = 'accountant')
CREATE POLICY "firm_staff_insert_messages" ON portal_messages
  FOR INSERT WITH CHECK (
    sender_type = 'accountant'
    AND firm_id IN (
      SELECT firm_id FROM users WHERE id = auth.uid()
    )
  );

-- Portal users can send messages (sender_type = 'client')
CREATE POLICY "portal_user_insert_messages" ON portal_messages
  FOR INSERT WITH CHECK (
    sender_type = 'client'
    AND client_id IN (
      SELECT client_id FROM portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Firm staff can mark messages read (set read_at)
CREATE POLICY "firm_staff_update_messages" ON portal_messages
  FOR UPDATE USING (
    firm_id IN (
      SELECT firm_id FROM users WHERE id = auth.uid()
    )
  );

-- Portal users can mark accountant messages read
CREATE POLICY "portal_user_update_messages" ON portal_messages
  FOR UPDATE USING (
    client_id IN (
      SELECT client_id FROM portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- ── 8. Unread message count helper ──────────────────────────
-- Used by GET /api/notifications for the bell icon.
-- Counts messages sent by clients that haven't been read by the firm yet.

CREATE OR REPLACE FUNCTION get_unread_message_count(p_firm_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM portal_messages
  WHERE firm_id = p_firm_id
    AND sender_type = 'client'
    AND read_at IS NULL;
$$;

-- ── 9. Enable Supabase Realtime for live bell icon updates ───
-- This lets the firm-side app subscribe to new messages without polling.
-- If this errors, skip it — it only affects live notification updates.
-- You can enable it manually in: Dashboard → Database → Replication

ALTER PUBLICATION supabase_realtime ADD TABLE portal_messages;

-- ── Verification — run after migration to confirm tables exist ──
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('portal_users','portal_invites','portal_messages')
-- ORDER BY table_name;

-- Expected result:
-- portal_invites
-- portal_messages
-- portal_users

-- ── Verify firm_settings columns added ──
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public'
-- AND table_name = 'firm_settings'
-- AND column_name LIKE 'portal_%';

-- Expected result:
-- portal_esign_key
-- portal_esign_provider
-- portal_esign_secret
-- portal_logo_url
-- portal_tagline
