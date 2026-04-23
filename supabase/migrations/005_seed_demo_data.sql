-- ============================================================
-- AcctOS — Migration 005: Seed Demo Data
-- Mirrors the 6 clients in AccountingOS.jsx exactly.
-- Run ONLY in local dev / staging. Never in production.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- DEMO FIRM
-- ────────────────────────────────────────────────────────────

INSERT INTO firms (id, name, plan, primary_email, province)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Jensen & Associates CPA',
  'Growth',
  'mark@jensenaccounting.ca',
  'Ontario'
);

-- ────────────────────────────────────────────────────────────
-- DEMO USERS (auth.users rows must exist first in real setup;
--             here we insert directly for seeding purposes)
-- ────────────────────────────────────────────────────────────

-- For local dev seeding without real auth, we insert into users
-- after manually creating auth.users rows via supabase auth admin.
-- Seed IDs match what the React app references.

INSERT INTO users (id, firm_id, name, initials, email, role) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Patrick W.',  'PW', 'patrick@jensen.ca', 'owner'),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Kiera S.',    'KS', 'kiera@jensen.ca',   'senior_accountant'),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'James R.',    'JR', 'james@jensen.ca',   'accountant'),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Reece H.',    'RH', 'reece@jensen.ca',   'admin');

-- ────────────────────────────────────────────────────────────
-- DEMO CLIENTS
-- ────────────────────────────────────────────────────────────

INSERT INTO clients (id, firm_id, name, type, freq, city, since, bn, initials, assigned_to, net_gst, risk_history, penalty_risk) VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001',
   'Maple Contracting Ltd.',    'Corporation', 'Monthly',   'Ottawa, ON',     '2022', '81427 3910 RT0001', 'MC',
   '00000000-0000-0000-0001-000000000002', 4820,  false, NULL),

  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001',
   'Sunrise Bakery Inc.',       'Corporation', 'Monthly',   'Ottawa, ON',     '2021', '72841 6603 RT0001', 'SB',
   '00000000-0000-0000-0001-000000000003', NULL,  false, NULL),

  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001',
   'Patel & Sons Holdings',     'Corporation', 'Quarterly', 'Mississauga, ON','2019', '55301 2214 RT0001', 'PS',
   '00000000-0000-0000-0001-000000000002', 14800, true,  'HIGH'),

  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001',
   'Riviera Auto Body',         'Sole prop',   'Quarterly', 'Cornwall, ON',   '2019', '90412 1120',        'RA',
   '00000000-0000-0000-0001-000000000003', 3240,  false, NULL),

  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001',
   'Northbridge Logistics',     'Corporation', 'Monthly',   'Ottawa, ON',     '2018', '55201 7214 RT0001', 'NL',
   '00000000-0000-0000-0001-000000000002', 6100,  false, NULL),

  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001',
   'Lakeshore Dental Group',    'Corporation', 'Quarterly', 'Kingston, ON',   '2020', '66312 9981 RT0001', 'LD',
   '00000000-0000-0000-0001-000000000003', 8120,  false, NULL);

-- ────────────────────────────────────────────────────────────
-- WORKFLOWS
-- ────────────────────────────────────────────────────────────

INSERT INTO workflows (id, client_id, firm_id, type, label, period, deadline, cycle_start, cur_stage, task_in_progress_days, computed_status) VALUES
  -- Maple: GST Oct (At Risk — in progress)
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — October 2025', 'Oct 2025', '2025-10-31', '2025-10-01', 3, 2, 'On Track'),

  -- Maple: T2 (placeholder)
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001',
   'T2', 'Corporate Year-End 2025', 'FY 2025', '2026-03-31', '2026-01-01', 1, 0, 'On Track'),

  -- Maple: Payroll (placeholder)
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001',
   'Payroll', 'Payroll Remittance — Oct', 'Oct 2025', '2025-11-15', '2025-10-01', 2, 0, 'On Track'),

  -- Sunrise: GST Oct (At Risk — blocked on docs)
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — October 2025', 'Oct 2025', '2025-10-31', '2025-10-01', 2, 0, 'At Risk'),

  -- Patel: GST Q2 (Overdue)
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — Q2 2025', 'Q2 2025 (Apr–Jun)', '2025-07-31', '2025-07-01', 5, 0, 'Overdue'),

  -- Riviera: GST Q3 (On Track — in progress)
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — Q3 2025', 'Q3 2025', '2025-10-31', '2025-10-01', 3, 0, 'On Track'),

  -- Northbridge: GST Sep (Complete)
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — September 2025', 'Sep 2025', '2025-10-31', '2025-09-01', 6, 0, 'Complete'),

  -- Lakeshore: GST Q3 (On Track — in review)
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001',
   'GST/HST', 'GST/HST — Q3 2025', 'Q3 2025', '2025-10-31', '2025-10-01', 4, 0, 'On Track');

-- ────────────────────────────────────────────────────────────
-- STAGES — Maple GST Oct
-- ────────────────────────────────────────────────────────────

INSERT INTO stages (workflow_id, firm_id, n, name, status, date_label, note, gate, gate_label) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Bookkeeping',         'complete',    'Oct 2', 'Reconciled in QBO — Oct 2',           'bookkeepingStatus = complete',     'Bookkeeping confirmed in QBO'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Document Collection', 'complete',    'Oct 5', 'All docs received — Oct 5',           'allDocsReceived = true',           'All required documents received'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'Preparation',         'in_progress', 'Oct 6', 'Draft in progress — Oct 6',           'stage2Complete = true',            'Corporation → ITC reconciliation required'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'Review',              'pending',     NULL,    NULL,                                  'preparationComplete = true',       'GST $4,820 — single review sufficient'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 5, 'Filing',              'pending',     NULL,    NULL,                                  'reviewApproved = true',            'Review approval required before filing'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 6, 'Confirmation',        'pending',     NULL,    NULL,                                  'filingComplete = true',            'Record CRA confirmation number');

-- ────────────────────────────────────────────────────────────
-- STAGES — Sunrise GST Oct (blocked)
-- ────────────────────────────────────────────────────────────

INSERT INTO stages (workflow_id, firm_id, n, name, status, date_label, note, gate, gate_label, blocked, block_reason) VALUES
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 1, 'Bookkeeping',         'complete', 'Oct 2', 'Confirmed — Oct 2',                    'bookkeepingStatus = complete', 'Bookkeeping confirmed in QBO', false, NULL),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 2, 'Document Collection', 'blocked',  'Reminder #2 sent Oct 9', 'Reminder #2 sent Oct 9, no response', 'allDocsReceived = false', '3 documents still pending — Stage 3 is blocked until all docs received', true, 'Client has not responded to Reminder #2 (sent Oct 9). Stage 3 cannot begin until bank statement, invoices, and receipts are received.'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 3, 'Preparation',         'pending',  NULL, NULL, 'stage2Complete = true', 'Waiting on document gate', true, 'Blocked by Stage 2. Cannot prepare return until all documents are on file.'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 4, 'Review',              'pending',  NULL, NULL, 'preparationComplete = true', 'Blocked by Stage 2', true, 'Blocked upstream — resolve document collection first.'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 5, 'Filing',              'pending',  NULL, NULL, 'reviewApproved = true', 'Blocked by Stage 2', true, 'Blocked upstream — resolve document collection first.'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 6, 'Confirmation',        'pending',  NULL, NULL, 'filingComplete = true', 'Record CRA confirmation number', false, NULL);

-- ────────────────────────────────────────────────────────────
-- STAGES — Patel GST Q2 (missed)
-- ────────────────────────────────────────────────────────────

INSERT INTO stages (workflow_id, firm_id, n, name, status, date_label, note, gate, gate_label, missed, block_reason) VALUES
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 1, 'Bookkeeping',         'complete', NULL, 'Complete', 'bookkeepingStatus = complete', 'Bookkeeping confirmed in QBO', false, NULL),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 2, 'Document Collection', 'complete', NULL, 'Complete', 'allDocsReceived = true',        'All docs received', false, NULL),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 3, 'Preparation',         'complete', NULL, 'Complete', 'stage2Complete = true',         'ITC reconciliation complete', false, NULL),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 4, 'Review',              'complete', NULL, 'Dual review — both approved (GST > $10k)', 'preparationComplete = true', 'GST $14,800 > $10,000 → dual review required ✓', false, NULL),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 5, 'Filing',              'missed',   'Missed Jul 31', 'MISSED — accountant was away', 'reviewApproved = true', 'Gate passed — filing missed due to accountant absence', true, 'CRA deadline passed Jul 31. Late filing required immediately. Interest and penalties accumulating. File today — log reason in CRA correspondence.'),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 6, 'Confirmation',        'pending',  NULL, NULL, 'filingComplete = true', 'Record CRA confirmation after late filing', false, NULL);

-- ────────────────────────────────────────────────────────────
-- STAGES — Northbridge GST Sep (complete)
-- ────────────────────────────────────────────────────────────

INSERT INTO stages (workflow_id, firm_id, n, name, status, gate_label) VALUES
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 1, 'Bookkeeping',         'complete', ''),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 2, 'Document Collection', 'complete', ''),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 3, 'Preparation',         'complete', ''),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 4, 'Review',              'complete', ''),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 5, 'Filing',              'complete', ''),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001', 6, 'Confirmation',        'complete', 'CRA conf #RT2025-48291 · Filed Oct 3');

-- ────────────────────────────────────────────────────────────
-- TASKS — Maple GST Oct
-- ────────────────────────────────────────────────────────────

INSERT INTO tasks (workflow_id, firm_id, stage_n, title, assigned_initials, due_date, status, sort_order) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Reconcile QBO through period end',        'KS', '2025-10-01', 'complete',     1),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Confirm bank feeds match',                 'KS', '2025-10-01', 'complete',     2),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'Flag any unclassified transactions',       'PW', '2025-10-02', 'complete',     3),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Request required documents',               'RH', '2025-10-03', 'complete',     4),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 2, 'Confirm ITC reconciliation (Corporation)', 'KS', '2025-10-08', 'complete',     5),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 3, 'Calculate GST and prepare draft return',   'KS', '2025-10-10', 'in_progress',  6),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 4, 'Senior review and sign-off',               'PW', '2025-10-15', 'pending',      7),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 5, 'Submit return to CRA',                     'KS', '2025-10-31', 'pending',      8),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 6, 'Record CRA confirmation number',           'KS', '2025-10-31', 'pending',      9);

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS — Maple GST Oct
-- ────────────────────────────────────────────────────────────

INSERT INTO documents (workflow_id, client_id, firm_id, name, status, reminder_count, uploaded_at, upload_source) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'Bank_Statement_Oct25.pdf',   'received', 0, '2025-10-05 00:00:00', 'Client upload'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'Vendor_Invoices_Oct25.zip',  'received', 0, '2025-10-05 00:00:00', 'Client upload'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'Expense_Receipts_Oct25.pdf', 'received', 0, '2025-10-05 00:00:00', 'Client upload'),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'QBO_Export_Oct25.csv',       'received', 0, '2025-10-02 00:00:00', 'Auto-sync');

-- ────────────────────────────────────────────────────────────
-- DOCUMENTS — Sunrise GST Oct (all pending)
-- ────────────────────────────────────────────────────────────

INSERT INTO documents (workflow_id, client_id, firm_id, name, status, reminder_count, last_reminder_at) VALUES
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 'Bank Statement — October',  'pending', 2, '2025-10-09 08:00:00'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 'Outstanding Invoices',      'pending', 2, '2025-10-09 08:00:00'),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 'Expense Receipts >$500',    'pending', 2, '2025-10-09 08:00:00');

-- ────────────────────────────────────────────────────────────
-- EMAIL LOG — Sunrise
-- ────────────────────────────────────────────────────────────

INSERT INTO email_log (client_id, firm_id, workflow_id, type, sent_at) VALUES
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'Initial Request',          '2025-10-03 07:00:00'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'Reminder #1',              '2025-10-06 08:00:00'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'Reminder #2 — Escalation', '2025-10-09 08:00:00');

-- ────────────────────────────────────────────────────────────
-- EVENTS — sample activity feed
-- ────────────────────────────────────────────────────────────

INSERT INTO events (client_id, firm_id, workflow_id, who, action, detail, created_at) VALUES
  -- Maple
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'Kiera S.',  'Started Stage 3 — Preparation',       'Draft return underway',                '2025-10-06 10:14:00'),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'Reece H.',  'Marked documents complete',           '4 of 4 received',                      '2025-10-05 14:02:00'),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'System',    'Bookkeeping auto-verified',           'QBO reconciled through Sep 30',        '2025-10-02 09:11:00'),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000001', 'System',    'Workflow auto-generated',             'GST/HST October 2025',                 '2025-10-01 07:00:00'),
  -- Sunrise
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'System',    'Reminder #2 sent — owner notified',   'Document blocker escalated to Patrick W.', '2025-10-09 08:00:00'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'System',    'Reminder #1 sent to client',          'No response after 3 days',             '2025-10-06 08:00:00'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000004', 'Reece H.',  'Initial document request sent',       '3 items requested',                    '2025-10-03 07:00:00'),
  -- Patel
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000005', 'System',    'Overdue flag raised',                 '75 days past CRA deadline — penalty risk HIGH', '2025-10-14 09:00:00'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000005', 'System',    'Filing deadline passed — not filed',  'KS was away, no backup coverage',      '2025-07-31 17:00:00'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000005', 'Patrick W.','Dual review approved',               'GST $14,800 — both reviews complete',  '2025-07-15 11:22:00'),
  -- Northbridge
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000007', 'Kiera S.',  'CRA confirmation recorded',           'Filed Sep 30 — conf #RT2025-48291',    '2025-10-03 11:00:00'),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000007', 'Kiera S.',  'Return submitted to CRA',             'Net GST: $6,100',                      '2025-10-02 15:00:00'),
  -- Lakeshore
  ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0003-000000000008', 'James R.',  'Draft sent to KS for review',         'Net GST: $8,120',                      '2025-10-12 14:00:00');
