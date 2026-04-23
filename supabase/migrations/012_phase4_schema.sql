-- ============================================================
-- AcctOS — Migration 012: Phase 4 Schema
-- integrations · client_portal_tokens · stripe_subscriptions
-- billing_events · payroll job_type addition
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE integration_provider AS ENUM (
  'qbo',        -- QuickBooks Online
  'zoho_books'  -- Zoho Books
);

CREATE TYPE integration_status AS ENUM (
  'connected',
  'disconnected',
  'error',
  'pending_auth'
);

CREATE TYPE billing_interval AS ENUM (
  'monthly',
  'annual'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'past_due',
  'canceled',
  'trialing',
  'incomplete'
);

-- Add payroll to job_type enum (automation engine supports payroll reminders)
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'payroll_reminder';

-- ────────────────────────────────────────────────────────────
-- INTEGRATIONS
-- Stores OAuth tokens for QBO and Zoho Books.
-- Tokens are encrypted at rest via Supabase Vault in production.
-- One row per firm per provider.
-- ────────────────────────────────────────────────────────────

CREATE TABLE integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  provider        integration_provider NOT NULL,
  status          integration_status NOT NULL DEFAULT 'pending_auth',

  -- OAuth tokens — store vault secret IDs in production
  -- In development, store raw (configure vault in Phase 4 hardening)
  access_token    text,           -- short-lived (1 hour for QBO)
  refresh_token   text,           -- long-lived (180 days for QBO)
  token_expires_at timestamptz,

  -- Provider-specific identifiers
  realm_id        text,           -- QBO: company/realm ID
  company_name    text,           -- human-readable name from provider
  base_url        text,           -- QBO sandbox vs production endpoint

  -- Sync state
  last_synced_at  timestamptz,
  last_sync_error text,
  sync_enabled    boolean NOT NULL DEFAULT true,

  -- Webhook
  webhook_url     text,           -- registered webhook URL at provider
  webhook_secret  text,           -- HMAC secret for webhook verification

  connected_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (firm_id, provider)
);

CREATE INDEX idx_integrations_firm     ON integrations(firm_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);

CREATE TRIGGER trg_integrations_updated
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- CLIENT INTEGRATION MAPPINGS
-- Maps a client (firm-side) to their account in QBO/Zoho.
-- Used to fetch period-specific reconciliation status.
-- ────────────────────────────────────────────────────────────

CREATE TABLE client_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  integration_id  uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- External reference in the accounting system
  external_id     text NOT NULL,   -- QBO customer/company ID
  external_name   text,            -- name as it appears in QBO

  -- Sync preferences
  auto_advance_stage1 boolean NOT NULL DEFAULT true,  -- auto-complete Stage 1 on reconciliation

  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, integration_id)
);

CREATE INDEX idx_client_integrations_client      ON client_integrations(client_id);
CREATE INDEX idx_client_integrations_integration ON client_integrations(integration_id);
CREATE INDEX idx_client_integrations_external    ON client_integrations(integration_id, external_id);

-- ────────────────────────────────────────────────────────────
-- CLIENT PORTAL TOKENS
-- Secure, time-limited tokens that let business clients (not
-- firm staff) access a lightweight view of their own filing
-- status and upload documents without creating an account.
--
-- Security model:
--   - Token is a cryptographically random 48-byte hex string
--   - Scoped to one client only
--   - Expires after expires_at
--   - Can be revoked by firm staff
--   - No auth.users row required for the client
-- ────────────────────────────────────────────────────────────

CREATE TABLE client_portal_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  token       text NOT NULL UNIQUE,       -- 96-char hex (48 bytes)
  label       text,                       -- "Oct 2025 GST filing"
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at  timestamptz,
  last_used_at timestamptz,
  use_count   integer NOT NULL DEFAULT 0,

  -- What the client can see/do through this token
  can_upload  boolean NOT NULL DEFAULT true,
  can_view_status boolean NOT NULL DEFAULT true,

  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_tokens_client ON client_portal_tokens(client_id);
CREATE INDEX idx_portal_tokens_token  ON client_portal_tokens(token);
CREATE INDEX idx_portal_tokens_firm   ON client_portal_tokens(firm_id);

-- ────────────────────────────────────────────────────────────
-- STRIPE SUBSCRIPTIONS
-- One row per firm. Updated by Stripe webhooks.
-- ────────────────────────────────────────────────────────────

CREATE TABLE stripe_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             uuid NOT NULL UNIQUE REFERENCES firms(id) ON DELETE CASCADE,

  stripe_customer_id  text NOT NULL UNIQUE,
  stripe_sub_id       text UNIQUE,     -- null until first subscription created
  plan                text NOT NULL DEFAULT 'Starter',  -- 'Starter' | 'Growth' | 'Scale'
  status              subscription_status NOT NULL DEFAULT 'trialing',
  billing_interval    billing_interval NOT NULL DEFAULT 'monthly',

  current_period_start timestamptz,
  current_period_end   timestamptz,
  trial_end            timestamptz,
  cancel_at            timestamptz,
  canceled_at          timestamptz,

  -- Usage for metered billing (Phase 5)
  client_count        integer NOT NULL DEFAULT 0,
  workflow_count      integer NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_stripe_sub_updated
  BEFORE UPDATE ON stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────
-- BILLING EVENTS
-- Immutable log of every Stripe event and filing-triggered invoice.
-- ────────────────────────────────────────────────────────────

CREATE TABLE billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  workflow_id     uuid REFERENCES workflows(id) ON DELETE SET NULL,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,

  event_type      text NOT NULL,     -- 'invoice.created' | 'filing_complete' | 'subscription.updated' | etc.
  stripe_event_id text UNIQUE,       -- Stripe event ID (for idempotency)
  amount_cents    integer,           -- invoice amount if applicable
  currency        text DEFAULT 'cad',
  description     text,
  metadata        jsonb DEFAULT '{}',

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_firm     ON billing_events(firm_id);
CREATE INDEX idx_billing_events_stripe   ON billing_events(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX idx_billing_events_workflow ON billing_events(workflow_id) WHERE workflow_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- TRIGGER: create Stripe billing event when workflow hits Stage 6
-- The API handler fires the actual Stripe invoice;
-- this trigger just records the intent in billing_events.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_billing_on_stage6()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When cur_stage reaches 6 (filing confirmed)
  IF NEW.cur_stage = 6 AND OLD.cur_stage < 6 THEN
    INSERT INTO billing_events (
      firm_id, workflow_id, client_id,
      event_type, description, metadata
    ) VALUES (
      NEW.firm_id, NEW.id, NEW.client_id,
      'filing_complete',
      format('Filing complete: %s', NEW.label),
      jsonb_build_object(
        'workflow_type', NEW.type,
        'period',        NEW.period,
        'deadline',      NEW.deadline
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_billing
  AFTER UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION trg_billing_on_stage6();

-- ────────────────────────────────────────────────────────────
-- QBO SYNC LOG
-- Immutable record of every QBO reconciliation event received.
-- ────────────────────────────────────────────────────────────

CREATE TABLE qbo_sync_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  integration_id      uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  workflow_id         uuid REFERENCES workflows(id) ON DELETE SET NULL,

  event_type          text NOT NULL,    -- 'reconciliation_complete' | 'token_refresh' | 'error'
  realm_id            text,
  qbo_entity_type     text,             -- 'Account' | 'JournalEntry' | etc.
  qbo_entity_id       text,
  period_start        date,
  period_end          date,
  stage_advanced      boolean NOT NULL DEFAULT false,
  raw_payload         jsonb,            -- full webhook payload for debugging

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qbo_sync_firm        ON qbo_sync_log(firm_id);
CREATE INDEX idx_qbo_sync_integration ON qbo_sync_log(integration_id);
CREATE INDEX idx_qbo_sync_client      ON qbo_sync_log(client_id);
