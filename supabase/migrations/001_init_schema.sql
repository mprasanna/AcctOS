-- ============================================================
-- AcctOS — Migration 001: Core Schema
-- firms · users · clients
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'owner',
  'senior_accountant',
  'accountant',
  'admin'
);

CREATE TYPE client_type AS ENUM (
  'Corporation',
  'Sole prop',
  'Partnership'
);

CREATE TYPE filing_freq AS ENUM (
  'Monthly',
  'Quarterly',
  'Annual'
);

CREATE TYPE penalty_risk_level AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE plan_tier AS ENUM (
  'Starter',
  'Growth',
  'Scale'
);

-- ────────────────────────────────────────────────────────────
-- FIRMS
-- ────────────────────────────────────────────────────────────

CREATE TABLE firms (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  plan              plan_tier NOT NULL DEFAULT 'Starter',
  primary_email     text,
  province          text NOT NULL DEFAULT 'Ontario',
  cra_bn            text,              -- stored as vault secret id in production
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- USERS
-- ────────────────────────────────────────────────────────────

-- mirrors auth.users — extended profile
CREATE TABLE users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id     uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  initials    text NOT NULL,
  email       text NOT NULL,
  role        user_role NOT NULL DEFAULT 'accountant',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_firm ON users(firm_id);

-- ────────────────────────────────────────────────────────────
-- CLIENTS
-- ────────────────────────────────────────────────────────────

CREATE TABLE clients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name            text NOT NULL,
  type            client_type NOT NULL,
  freq            filing_freq NOT NULL,
  city            text,
  since           text,
  bn              text,              -- CRA Business Number (vault in prod)
  initials        text,
  assigned_to     uuid REFERENCES users(id) ON DELETE SET NULL,
  net_gst         numeric(12,2),     -- latest known net GST amount
  risk_history    boolean NOT NULL DEFAULT false,
  penalty_risk    penalty_risk_level,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_firm     ON clients(firm_id);
CREATE INDEX idx_clients_assigned ON clients(assigned_to);

-- ────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER (shared)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_firms_updated
  BEFORE UPDATE ON firms
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_clients_updated
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
