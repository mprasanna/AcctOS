-- ============================================================
-- AcctOS — Migration 015: Time Tracking + Per-Job Invoicing
-- time_entries · client_invoices · billing_rates additions
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TIME ENTRIES
-- Stores all billable time logged by firm staff.
-- RLS: firm-scoped. Users can only delete their own entries.
-- ────────────────────────────────────────────────────────────

CREATE TABLE time_entries (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id         uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id     uuid REFERENCES workflows(id) ON DELETE SET NULL,
  task_id         uuid REFERENCES tasks(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Timer-based entries
  started_at      timestamptz,    -- null for manual entries
  stopped_at      timestamptz,    -- null while timer is running

  -- Computed or manually entered
  duration_minutes integer,       -- set on stop (computed) or manual log

  note            text,
  billable        boolean NOT NULL DEFAULT true,

  -- For running timer detection
  is_running      boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- A user can only have one running timer at a time
  CONSTRAINT one_running_timer_per_user
    EXCLUDE (user_id WITH =) WHERE (is_running = true)
);

CREATE INDEX idx_time_entries_firm     ON time_entries(firm_id);
CREATE INDEX idx_time_entries_client   ON time_entries(client_id);
CREATE INDEX idx_time_entries_workflow ON time_entries(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_time_entries_user     ON time_entries(user_id);
CREATE INDEX idx_time_entries_running  ON time_entries(user_id) WHERE is_running = true;

CREATE TRIGGER trg_time_entries_updated
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_firm_select" ON time_entries
  FOR SELECT USING (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
  );

CREATE POLICY "time_entries_firm_insert" ON time_entries
  FOR INSERT WITH CHECK (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
  );

CREATE POLICY "time_entries_firm_update" ON time_entries
  FOR UPDATE USING (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
  );

-- Users can only delete their own entries; owners can delete any
CREATE POLICY "time_entries_delete" ON time_entries
  FOR DELETE USING (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
    AND (
      user_id = (auth.jwt() ->> 'sub')::uuid
      OR (auth.jwt() ->> 'role') = 'owner'
    )
  );

-- ────────────────────────────────────────────────────────────
-- STOP RUNNING TIMER FUNCTION
-- Stops any running timer for a user before starting a new one.
-- Called by the time-tracking API.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION stop_running_timer(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE time_entries
  SET
    stopped_at       = now(),
    is_running       = false,
    duration_minutes = GREATEST(1, EXTRACT(EPOCH FROM (now() - started_at))::integer / 60),
    updated_at       = now()
  WHERE
    user_id    = p_user_id
    AND is_running = true
    AND started_at IS NOT NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- CLIENT INVOICES
-- Records invoices sent to business clients for completed filings.
-- Stripe invoice ID stored for reconciliation.
-- ────────────────────────────────────────────────────────────

CREATE TABLE client_invoices (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id         uuid REFERENCES workflows(id) ON DELETE SET NULL,

  -- Stripe references
  stripe_invoice_id   text UNIQUE,
  stripe_hosted_url   text,
  stripe_pdf_url      text,

  -- Invoice details
  amount_cents        integer NOT NULL,          -- total in CAD cents
  currency            text NOT NULL DEFAULT 'cad',
  description         text,
  workflow_type       text,                       -- 'GST/HST' | 'T1' | 'T2' | 'Payroll' | 'Bookkeeping'
  period              text,                       -- billing period label, e.g. "Oct 2025"
  is_auto_generated   boolean NOT NULL DEFAULT false,  -- true if triggered by Stage 6 automation

  -- Status (synced from Stripe webhook)
  status              text NOT NULL DEFAULT 'draft',   -- 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  paid_at             timestamptz,

  -- Who created / sent
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_invoices_firm     ON client_invoices(firm_id);
CREATE INDEX idx_client_invoices_client   ON client_invoices(client_id);
CREATE INDEX idx_client_invoices_workflow ON client_invoices(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_client_invoices_stripe   ON client_invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

CREATE TRIGGER trg_client_invoices_updated
  BEFORE UPDATE ON client_invoices
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_invoices_firm_select" ON client_invoices
  FOR SELECT USING (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
  );

CREATE POLICY "client_invoices_firm_insert" ON client_invoices
  FOR INSERT WITH CHECK (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
    AND (auth.jwt() ->> 'role') IN ('owner', 'senior_accountant', 'accountant')
  );

-- Void/status updates come from Stripe webhook via service role
-- App-level updates restricted to owners
CREATE POLICY "client_invoices_owner_update" ON client_invoices
  FOR UPDATE USING (
    firm_id = (auth.jwt() ->> 'firm_id')::uuid
    AND (auth.jwt() ->> 'role') = 'owner'
  );

-- ────────────────────────────────────────────────────────────
-- AUTO INVOICE TRIGGER
-- When invoice_on_completion = true in firm_settings and a
-- workflow reaches Stage 6, inserts a client_invoices row
-- using the billing rate for that workflow type.
-- The actual Stripe API call is made by the Stage 6 API handler.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_auto_invoice_on_stage6()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_settings  firm_settings%ROWTYPE;
  v_rate      integer;
  v_type      text;
BEGIN
  IF NEW.cur_stage <> 6 OR OLD.cur_stage = 6 THEN
    RETURN NEW;
  END IF;

  -- Check if auto-invoice is enabled for this firm
  SELECT * INTO v_settings FROM firm_settings WHERE firm_id = NEW.firm_id;
  IF NOT FOUND OR NOT v_settings.invoice_on_completion THEN
    RETURN NEW;
  END IF;

  -- Look up billing rate for this workflow type
  v_type := NEW.type;  -- e.g. 'GST/HST', 'T1', 'T2', 'Payroll', 'Bookkeeping'
  v_rate := (v_settings.billing_rates ->> v_type)::integer;

  -- Only create invoice if a rate is configured
  IF v_rate IS NULL OR v_rate = 0 THEN
    RETURN NEW;
  END IF;

  -- Insert draft invoice — API handler will finalize and send via Stripe
  INSERT INTO client_invoices (
    firm_id, client_id, workflow_id,
    amount_cents, description, workflow_type, period,
    is_auto_generated, status
  ) VALUES (
    NEW.firm_id, NEW.client_id, NEW.id,
    v_rate,
    format('%s — %s', v_type, NEW.label),
    v_type,
    NEW.period,
    true,
    'draft'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_auto_invoice
  AFTER UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION trg_auto_invoice_on_stage6();

-- ────────────────────────────────────────────────────────────
-- BILLABLE TIME SUMMARY VIEW
-- Convenience view for the Time tab and invoicing.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW billable_time_summary AS
SELECT
  te.firm_id,
  te.client_id,
  te.workflow_id,
  SUM(te.duration_minutes) FILTER (WHERE te.billable)     AS total_billable_minutes,
  SUM(te.duration_minutes) FILTER (WHERE NOT te.billable) AS total_non_billable_minutes,
  COUNT(te.id)                                             AS entry_count,
  MAX(te.created_at)                                       AS last_entry_at
FROM time_entries te
WHERE te.duration_minutes IS NOT NULL  -- exclude running timers
GROUP BY te.firm_id, te.client_id, te.workflow_id;
