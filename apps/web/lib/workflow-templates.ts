// ============================================================
// AcctOS — Workflow Templates
// Phase 2: T1, T2, Bookkeeping added alongside GST/HST.
//
// Each template defines:
//   stages[]  — 6 stages with gate conditions
//   tasks[]   — tasks per stage, with assigned role and due offsets
//   doc_checklist[] — required documents, varies by client type
//
// Templates are consumed by POST /api/workflows to auto-generate
// stages and tasks when a new workflow is created.
// ============================================================

import type { WorkflowType, ClientType, StageStatus, TaskStatus } from '@/types/database'

// ────────────────────────────────────────────────────────────
// TEMPLATE TYPES
// ────────────────────────────────────────────────────────────

export interface StageTemplate {
  n: number
  name: string
  gate: string
  gate_label: string
  // Optional branching
  corp_gate_label?: string       // override gate_label for Corporation
  sole_prop_gate_label?: string  // override for Sole prop
}

export interface TaskTemplate {
  stage_n: number
  title: string
  assigned_role: 'owner' | 'senior_accountant' | 'accountant' | 'admin' | 'bot'
  // due_offset_days: days from cycle_start
  due_offset_days: number
  // corp_only / sole_prop_only for branching
  corp_only?: boolean
  sole_prop_only?: boolean
  sort_order: number
}

export interface DocTemplate {
  name: string
  corp_only?: boolean
  sole_prop_only?: boolean
  partnership_only?: boolean
}

export interface WorkflowTemplate {
  type: WorkflowType
  stages: StageTemplate[]
  tasks: TaskTemplate[]
  docs: {
    corporation: DocTemplate[]
    sole_prop: DocTemplate[]
  }
}

// ────────────────────────────────────────────────────────────
// GST/HST TEMPLATE (Phase 1 — included here for completeness)
// ────────────────────────────────────────────────────────────

export const GST_TEMPLATE: WorkflowTemplate = {
  type: 'GST/HST',
  stages: [
    { n: 1, name: 'Bookkeeping',         gate: 'bookkeepingStatus = complete',  gate_label: 'Bookkeeping confirmed in QBO',              corp_gate_label: 'Bookkeeping confirmed in QBO — ITC period match required' },
    { n: 2, name: 'Document Collection', gate: 'allDocsReceived = true',        gate_label: 'All required documents received' },
    { n: 3, name: 'Preparation',         gate: 'stage2Complete = true',         gate_label: 'Sole prop → simplified checklist; revenue threshold check', corp_gate_label: 'Corporation → ITC reconciliation required' },
    { n: 4, name: 'Review',              gate: 'preparationComplete = true',    gate_label: 'Review approval required',                  corp_gate_label: 'GST > $10,000 → dual review required' },
    { n: 5, name: 'Filing',              gate: 'reviewApproved = true',         gate_label: 'Review approval required before CRA filing' },
    { n: 6, name: 'Confirmation',        gate: 'filingComplete = true',         gate_label: 'Record CRA confirmation number' },
  ],
  tasks: [
    { stage_n: 1, title: 'Reconcile QBO through period end',             assigned_role: 'accountant',       due_offset_days: 1,  sort_order: 1 },
    { stage_n: 1, title: 'Confirm bank feeds match',                      assigned_role: 'accountant',       due_offset_days: 1,  sort_order: 2 },
    { stage_n: 1, title: 'Flag any unclassified transactions',            assigned_role: 'owner',            due_offset_days: 2,  sort_order: 3 },
    { stage_n: 2, title: 'Request required documents from client',        assigned_role: 'admin',            due_offset_days: 3,  sort_order: 4 },
    { stage_n: 3, title: 'Confirm ITC reconciliation (Corporation)',      assigned_role: 'accountant',       due_offset_days: 8,  sort_order: 5, corp_only: true },
    { stage_n: 3, title: 'Annual revenue threshold check (< $30k exempt?)', assigned_role: 'accountant',    due_offset_days: 5,  sort_order: 5, sole_prop_only: true },
    { stage_n: 3, title: 'Calculate GST and prepare draft return',        assigned_role: 'accountant',       due_offset_days: 10, sort_order: 6 },
    { stage_n: 4, title: 'Accountant review and sign-off',                assigned_role: 'accountant',       due_offset_days: 13, sort_order: 7 },
    { stage_n: 4, title: 'Senior review — GST > $10,000 dual approval',  assigned_role: 'senior_accountant',due_offset_days: 15, sort_order: 8, corp_only: true },
    { stage_n: 5, title: 'Submit return to CRA',                          assigned_role: 'accountant',       due_offset_days: 28, sort_order: 9 },
    { stage_n: 6, title: 'Record CRA confirmation number',                assigned_role: 'accountant',       due_offset_days: 30, sort_order: 10 },
  ],
  docs: {
    corporation: [
      { name: 'Bank Statement — period' },
      { name: 'Accounts Receivable Aging' },
      { name: 'Accounts Payable Aging' },
      { name: 'Vendor Invoices' },
      { name: 'Expense Receipts (>$500)' },
      { name: 'ITC Reconciliation Worksheet', corp_only: true },
    ],
    sole_prop: [
      { name: 'Bank Statement — period' },
      { name: 'Sales Invoices' },
      { name: 'Expense Receipts (>$100)' },
    ],
  },
}

// ────────────────────────────────────────────────────────────
// T1 — PERSONAL TAX RETURN
// Seasonal: January–April. Heavy document chase.
// ────────────────────────────────────────────────────────────

export const T1_TEMPLATE: WorkflowTemplate = {
  type: 'T1',
  stages: [
    {
      n: 1, name: 'Document Collection',
      gate: 'allDocsReceived = true',
      gate_label: 'All T4/T5/slips and receipts received — auto-reminders Day 3 and Day 10',
    },
    {
      n: 2, name: 'Organizer Review',
      gate: 'stage1Complete = true',
      gate_label: 'Review completed client organizer for missing or unusual items',
    },
    {
      n: 3, name: 'Preparation',
      gate: 'organizerReviewed = true',
      gate_label: 'Prepare T1 return in tax software — flag carryforward items',
    },
    {
      n: 4, name: 'Review',
      gate: 'preparationComplete = true',
      gate_label: 'Senior review — refund > $5,000 or balance owing > $2,000 triggers dual review',
    },
    {
      n: 5, name: 'Client Approval',
      gate: 'reviewApproved = true',
      gate_label: 'Client must sign T183 authorization before filing',
    },
    {
      n: 6, name: 'Filing & Confirmation',
      gate: 'clientApproved = true',
      gate_label: 'EFILE to CRA — record confirmation number and NETFILE code',
    },
  ],
  tasks: [
    { stage_n: 1, title: 'Send client organizer / document checklist',      assigned_role: 'admin',             due_offset_days: 3,  sort_order: 1 },
    { stage_n: 1, title: 'Chase T4s, T5s, investment slips',                assigned_role: 'admin',             due_offset_days: 14, sort_order: 2 },
    { stage_n: 1, title: 'Confirm RRSP contribution room (prior NOA)',       assigned_role: 'accountant',        due_offset_days: 14, sort_order: 3 },
    { stage_n: 1, title: 'Verify receipt for charitable donations, medical', assigned_role: 'accountant',        due_offset_days: 21, sort_order: 4 },
    { stage_n: 2, title: 'Review organizer for prior-year changes',          assigned_role: 'accountant',        due_offset_days: 28, sort_order: 5 },
    { stage_n: 2, title: 'Flag rental income, business income, foreign income', assigned_role: 'accountant',    due_offset_days: 28, sort_order: 6 },
    { stage_n: 2, title: 'Check for TFSA/RRSP over-contributions',          assigned_role: 'senior_accountant', due_offset_days: 30, sort_order: 7 },
    { stage_n: 3, title: 'Prepare T1 return in tax software',               assigned_role: 'accountant',        due_offset_days: 45, sort_order: 8 },
    { stage_n: 3, title: 'Enter all slips and apply credits',                assigned_role: 'accountant',        due_offset_days: 45, sort_order: 9 },
    { stage_n: 3, title: 'Apply carryforward items (capital losses, CCA)',   assigned_role: 'accountant',        due_offset_days: 46, sort_order: 10 },
    { stage_n: 4, title: 'Senior review — check balance owing / refund',     assigned_role: 'senior_accountant', due_offset_days: 50, sort_order: 11 },
    { stage_n: 4, title: 'Cross-check against prior year return',            assigned_role: 'senior_accountant', due_offset_days: 50, sort_order: 12 },
    { stage_n: 5, title: 'Send T183 e-signature request to client',          assigned_role: 'admin',             due_offset_days: 55, sort_order: 13 },
    { stage_n: 5, title: 'Confirm client reviewed refund / balance owing',   assigned_role: 'accountant',        due_offset_days: 56, sort_order: 14 },
    { stage_n: 6, title: 'EFILE return to CRA',                              assigned_role: 'accountant',        due_offset_days: 60, sort_order: 15 },
    { stage_n: 6, title: 'Record NETFILE confirmation number',               assigned_role: 'accountant',        due_offset_days: 60, sort_order: 16 },
    { stage_n: 6, title: 'Send copy of filed return to client',              assigned_role: 'admin',             due_offset_days: 62, sort_order: 17 },
  ],
  docs: {
    corporation: [
      { name: 'T4 Slips' },
      { name: 'T5 Investment Income Slips' },
      { name: 'T3 Trust Income Slips' },
      { name: 'RRSP Contribution Receipts' },
      { name: 'Prior Year Notice of Assessment' },
      { name: 'Charitable Donation Receipts' },
      { name: 'Medical Expense Receipts' },
      { name: 'Tuition Receipts (T2202)' },
      { name: 'Rental Income / Expenses Summary' },
      { name: 'Business Income Summary (if self-employed)' },
    ],
    sole_prop: [
      { name: 'T4 Slips' },
      { name: 'T5 Investment Income Slips' },
      { name: 'RRSP Contribution Receipts' },
      { name: 'Prior Year Notice of Assessment' },
      { name: 'Business Income & Expense Summary' },
      { name: 'Home Office Expense Records' },
      { name: 'Vehicle Log (if claiming auto)' },
      { name: 'Charitable Donation Receipts' },
      { name: 'Medical Expense Receipts' },
    ],
  },
}

// ────────────────────────────────────────────────────────────
// T2 — CORPORATE TAX RETURN
// Annual. Complex. High-value client management.
// ────────────────────────────────────────────────────────────

export const T2_TEMPLATE: WorkflowTemplate = {
  type: 'T2',
  stages: [
    {
      n: 1, name: 'Year-End Bookkeeping',
      gate: 'yearEndComplete = true',
      gate_label: 'QBO year-end reconciliation complete — all entries posted and reviewed',
    },
    {
      n: 2, name: 'Document Collection',
      gate: 'allDocsReceived = true',
      gate_label: 'All corporate documents received — financial statements, share registry, minute book',
    },
    {
      n: 3, name: 'Financial Statements',
      gate: 'stage2Complete = true',
      gate_label: 'Draft financial statements prepared and internally reviewed',
    },
    {
      n: 4, name: 'T2 Preparation',
      gate: 'financialStatementsComplete = true',
      gate_label: 'T2 return prepared using reviewed financial statements',
    },
    {
      n: 5, name: 'Review & Approval',
      gate: 'preparationComplete = true',
      gate_label: 'Senior CPA review — all T2 schedules, GIFI, SRED (if applicable)',
    },
    {
      n: 6, name: 'Filing & Confirmation',
      gate: 'reviewApproved = true',
      gate_label: 'File T2 via EFILE — record confirmation, send copy to client',
    },
  ],
  tasks: [
    { stage_n: 1, title: 'Post all year-end adjusting entries',              assigned_role: 'senior_accountant', due_offset_days: 14, sort_order: 1 },
    { stage_n: 1, title: 'Reconcile all balance sheet accounts',             assigned_role: 'accountant',        due_offset_days: 21, sort_order: 2 },
    { stage_n: 1, title: 'Review accounts receivable — write-off decisions', assigned_role: 'senior_accountant', due_offset_days: 21, sort_order: 3 },
    { stage_n: 1, title: 'CCA schedule review and additions',                assigned_role: 'accountant',        due_offset_days: 21, sort_order: 4 },
    { stage_n: 1, title: 'Payroll reconciliation (T4 vs GL)',                assigned_role: 'accountant',        due_offset_days: 21, sort_order: 5 },
    { stage_n: 2, title: 'Request corporate minute book review',             assigned_role: 'admin',             due_offset_days: 25, sort_order: 6 },
    { stage_n: 2, title: 'Confirm shareholder loans — Section 15 check',     assigned_role: 'senior_accountant', due_offset_days: 28, sort_order: 7 },
    { stage_n: 2, title: 'Request prior year T2 and NOA',                   assigned_role: 'admin',             due_offset_days: 14, sort_order: 8 },
    { stage_n: 3, title: 'Prepare draft financial statements',               assigned_role: 'senior_accountant', due_offset_days: 42, sort_order: 9 },
    { stage_n: 3, title: 'Internal review of financial statements',          assigned_role: 'owner',             due_offset_days: 49, sort_order: 10 },
    { stage_n: 3, title: 'Send draft financials to client for review',       assigned_role: 'admin',             due_offset_days: 52, sort_order: 11 },
    { stage_n: 4, title: 'Complete T2 return in tax software',               assigned_role: 'senior_accountant', due_offset_days: 63, sort_order: 12 },
    { stage_n: 4, title: 'Prepare GIFI schedules',                           assigned_role: 'accountant',        due_offset_days: 63, sort_order: 13 },
    { stage_n: 4, title: 'SR&ED assessment (if applicable)',                 assigned_role: 'senior_accountant', due_offset_days: 63, sort_order: 14 },
    { stage_n: 4, title: 'Small business deduction calculation',             assigned_role: 'senior_accountant', due_offset_days: 65, sort_order: 15 },
    { stage_n: 5, title: 'Senior CPA review — all schedules and GIFI',       assigned_role: 'owner',             due_offset_days: 70, sort_order: 16 },
    { stage_n: 5, title: 'Cross-check tax payable vs prior year',            assigned_role: 'owner',             due_offset_days: 70, sort_order: 17 },
    { stage_n: 5, title: 'Client approval sign-off',                         assigned_role: 'admin',             due_offset_days: 75, sort_order: 18 },
    { stage_n: 6, title: 'EFILE T2 to CRA',                                  assigned_role: 'senior_accountant', due_offset_days: 80, sort_order: 19 },
    { stage_n: 6, title: 'Record CRA confirmation number',                   assigned_role: 'accountant',        due_offset_days: 80, sort_order: 20 },
    { stage_n: 6, title: 'Send filed return and financial statements to client', assigned_role: 'admin',          due_offset_days: 82, sort_order: 21 },
  ],
  docs: {
    corporation: [
      { name: 'QBO Year-End Export' },
      { name: 'Bank Statements — all months' },
      { name: 'Loan Statements (year-end balances)' },
      { name: 'Shareholder Loan Schedule' },
      { name: 'Fixed Asset Additions — invoices' },
      { name: 'Prior Year T2 Return' },
      { name: 'Prior Year Notice of Assessment' },
      { name: 'Corporate Minute Book (current)' },
      { name: 'Share Registry' },
      { name: 'Payroll Summary (T4 vs GL)' },
    ],
    sole_prop: [], // T2 is corporation-only; sole props file T1
  },
}

// ────────────────────────────────────────────────────────────
// BOOKKEEPING — MONTHLY RECONCILIATION
// Feeds directly into GST Stage 1 via workflow_links.
// ────────────────────────────────────────────────────────────

export const BOOKKEEPING_TEMPLATE: WorkflowTemplate = {
  type: 'Bookkeeping',
  stages: [
    {
      n: 1, name: 'Transaction Import',
      gate: 'bankFeedsImported = true',
      gate_label: 'All bank and credit card feeds imported and up to date in QBO',
    },
    {
      n: 2, name: 'Categorisation',
      gate: 'stage1Complete = true',
      gate_label: 'All transactions categorised — no unclassified items remaining',
    },
    {
      n: 3, name: 'Bank Reconciliation',
      gate: 'stage2Complete = true',
      gate_label: 'All accounts reconciled to bank statements — zero unreconciled items',
    },
    {
      n: 4, name: 'Review',
      gate: 'stage3Complete = true',
      gate_label: 'P&L and balance sheet reviewed for anomalies',
    },
    {
      n: 5, name: 'Adjusting Entries',
      gate: 'reviewComplete = true',
      gate_label: 'All adjusting entries posted (depreciation, prepaid, accruals)',
    },
    {
      n: 6, name: 'Sign-off',
      gate: 'adjustingEntriesComplete = true',
      gate_label: 'Books signed off — feeds GST/T2 workflows automatically',
    },
  ],
  tasks: [
    { stage_n: 1, title: 'Confirm QBO bank feeds are live',                  assigned_role: 'accountant',  due_offset_days: 2,  sort_order: 1 },
    { stage_n: 1, title: 'Import any missing transactions manually',          assigned_role: 'accountant',  due_offset_days: 3,  sort_order: 2 },
    { stage_n: 2, title: 'Categorise all uncategorised transactions',         assigned_role: 'accountant',  due_offset_days: 5,  sort_order: 3 },
    { stage_n: 2, title: 'Flag unusual or large transactions for review',     assigned_role: 'accountant',  due_offset_days: 5,  sort_order: 4 },
    { stage_n: 3, title: 'Reconcile chequing account',                        assigned_role: 'accountant',  due_offset_days: 8,  sort_order: 5 },
    { stage_n: 3, title: 'Reconcile savings / line of credit',                assigned_role: 'accountant',  due_offset_days: 8,  sort_order: 6 },
    { stage_n: 3, title: 'Reconcile credit cards',                            assigned_role: 'accountant',  due_offset_days: 8,  sort_order: 7 },
    { stage_n: 4, title: 'Review P&L vs prior month — flag variances >20%',  assigned_role: 'senior_accountant', due_offset_days: 10, sort_order: 8 },
    { stage_n: 4, title: 'Review balance sheet — check AP/AR aging',          assigned_role: 'senior_accountant', due_offset_days: 10, sort_order: 9 },
    { stage_n: 5, title: 'Post depreciation / CCA entries',                   assigned_role: 'accountant',  due_offset_days: 12, sort_order: 10 },
    { stage_n: 5, title: 'Post prepaid expense amortisation',                 assigned_role: 'accountant',  due_offset_days: 12, sort_order: 11 },
    { stage_n: 5, title: 'Post accruals (payroll, rent if needed)',           assigned_role: 'accountant',  due_offset_days: 12, sort_order: 12 },
    { stage_n: 6, title: 'Final sign-off on reconciled books',                assigned_role: 'senior_accountant', due_offset_days: 14, sort_order: 13 },
    { stage_n: 6, title: 'Export final P&L and balance sheet for client',     assigned_role: 'accountant',  due_offset_days: 14, sort_order: 14 },
  ],
  docs: {
    corporation: [
      { name: 'Bank Statements — all accounts' },
      { name: 'Credit Card Statements' },
      { name: 'Loan Statements' },
      { name: 'Payroll Register' },
    ],
    sole_prop: [
      { name: 'Bank Statement' },
      { name: 'Credit Card Statement' },
    ],
  },
}

// ────────────────────────────────────────────────────────────
// TEMPLATE REGISTRY — lookup by WorkflowType
// ────────────────────────────────────────────────────────────

export const TEMPLATES: Partial<Record<WorkflowType, WorkflowTemplate>> = {
  'GST/HST':    GST_TEMPLATE,
  'T1':         T1_TEMPLATE,
  'T2':         T2_TEMPLATE,
  'Bookkeeping': BOOKKEEPING_TEMPLATE,
}

// ────────────────────────────────────────────────────────────
// TEMPLATE BUILDER
// Resolves tasks and docs for a specific client type,
// filtering out corp_only / sole_prop_only items.
// Called by POST /api/workflows.
// ────────────────────────────────────────────────────────────

export function resolveTemplate(
  type: WorkflowType,
  clientType: ClientType,
  cycleStart: Date
) {
  const template = TEMPLATES[type]
  if (!template) return null

  const isCorp     = clientType === 'Corporation'
  const isSoleProp = clientType === 'Sole prop'

  // Filter tasks for this client type
  const tasks = template.tasks.filter(t => {
    if (t.corp_only     && !isCorp)     return false
    if (t.sole_prop_only && !isSoleProp) return false
    return true
  })

  // Resolve due dates from cycle_start
  const resolvedTasks = tasks.map(t => ({
    ...t,
    due_date: new Date(cycleStart.getTime() + t.due_offset_days * 86_400_000)
      .toISOString()
      .split('T')[0],
  }))

  // Resolve stage gate_labels for this client type
  const stages = template.stages.map(s => ({
    ...s,
    gate_label: (isCorp && s.corp_gate_label)
      ? s.corp_gate_label
      : (isSoleProp && s.sole_prop_gate_label)
        ? s.sole_prop_gate_label
        : s.gate_label,
  }))

  // Doc checklist for this client type
  const docs = isCorp
    ? template.docs.corporation
    : template.docs.sole_prop

  return { stages, tasks: resolvedTasks, docs }
}

// ────────────────────────────────────────────────────────────
// PAYROLL REMITTANCES — Phase 4
// CRA payroll deadlines are penalty-sensitive.
// Monthly AND bi-weekly cycle support.
// ────────────────────────────────────────────────────────────

export const PAYROLL_TEMPLATE: WorkflowTemplate = {
  type: 'Payroll',
  stages: [
    {
      n: 1, name: 'Payroll Processing',
      gate: 'payrollRunComplete = true',
      gate_label: 'Payroll run completed in payroll system — all hours, salaries, and deductions confirmed',
    },
    {
      n: 2, name: 'Deduction Calculation',
      gate: 'stage1Complete = true',
      gate_label: 'CPP, EI, and income tax withholdings calculated and verified against CRA tables',
    },
    {
      n: 3, name: 'T4/RL-1 Review',
      gate: 'deductionsVerified = true',
      gate_label: 'Payroll deduction totals match expected CRA remittance amounts',
    },
    {
      n: 4, name: 'Remittance Preparation',
      gate: 'stage3Complete = true',
      gate_label: 'PD7A remittance form prepared — total = CPP (employee + employer) + EI (employee + employer × 1.4) + income tax',
    },
    {
      n: 5, name: 'CRA Payment',
      gate: 'remittancePrepared = true',
      gate_label: 'Payment submitted to CRA via My Business Account or financial institution. HARD DEADLINE — penalties for late payment.',
    },
    {
      n: 6, name: 'Confirmation',
      gate: 'paymentConfirmed = true',
      gate_label: 'Record CRA payment confirmation number and reconcile to GL',
    },
  ],
  tasks: [
    { stage_n: 1, title: 'Run payroll for the period',                        assigned_role: 'accountant',        due_offset_days: 1,  sort_order: 1 },
    { stage_n: 1, title: 'Confirm all employee hours/salaries are correct',   assigned_role: 'accountant',        due_offset_days: 1,  sort_order: 2 },
    { stage_n: 1, title: 'Verify new employees and terminations',             assigned_role: 'senior_accountant', due_offset_days: 1,  sort_order: 3 },
    { stage_n: 2, title: 'Calculate CPP contributions (employee + employer)', assigned_role: 'accountant',        due_offset_days: 2,  sort_order: 4 },
    { stage_n: 2, title: 'Calculate EI premiums (employee + employer × 1.4)','accountant',        due_offset_days: 2,  sort_order: 5 },
    { stage_n: 2, title: 'Calculate income tax withholding per employee',     assigned_role: 'accountant',        due_offset_days: 2,  sort_order: 6 },
    { stage_n: 3, title: 'Cross-check deductions against CRA Payroll Tables', assigned_role: 'senior_accountant', due_offset_days: 3,  sort_order: 7 },
    { stage_n: 3, title: 'Verify year-to-date CPP/EI maximums not exceeded', assigned_role: 'accountant',        due_offset_days: 3,  sort_order: 8 },
    { stage_n: 4, title: 'Prepare PD7A remittance form',                      assigned_role: 'accountant',        due_offset_days: 4,  sort_order: 9 },
    { stage_n: 4, title: 'Confirm total remittance amount with GL balance',   assigned_role: 'senior_accountant', due_offset_days: 4,  sort_order: 10 },
    { stage_n: 5, title: 'Submit payment to CRA (My Business Account)',       assigned_role: 'accountant',        due_offset_days: 5,  sort_order: 11 },
    { stage_n: 6, title: 'Record CRA payment confirmation number',            assigned_role: 'accountant',        due_offset_days: 5,  sort_order: 12 },
    { stage_n: 6, title: 'Reconcile payroll remittance to general ledger',   assigned_role: 'accountant',        due_offset_days: 6,  sort_order: 13 },
  ],
  docs: {
    corporation: [
      { name: 'Payroll Register — period' },
      { name: 'CPP Contribution Schedule' },
      { name: 'EI Premium Schedule' },
      { name: 'Income Tax Withholding Summary' },
      { name: 'PD7A Remittance Form' },
    ],
    sole_prop: [
      { name: 'Payroll Register — period' },
      { name: 'CRA Deductions Summary' },
    ],
  },
}

// Register Payroll in the templates registry
// (Mutating the existing TEMPLATES object — safe since it's module-level)
;(TEMPLATES as any)['Payroll'] = PAYROLL_TEMPLATE
