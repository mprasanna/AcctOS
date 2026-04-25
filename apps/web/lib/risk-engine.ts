// ============================================================
// AcctOS — Core Risk Engine
// Pure TypeScript — no React, no Supabase, no framework deps.
// Runs identically in browser, server, and mobile.
//
// Functions:
//   computeWorkflowStatus  — C1–C5 per workflow
//   aggregateClientStatus  — worst across all workflows
//   wfRiskScore            — numeric priority score
//   evaluateGate           — per-stage gate enforcement
// ============================================================

import type {
  WorkflowRow,
  StageRow,
  DocumentRow,
  ClientRow,
  WorkflowStatus,
} from '../types/database'

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────

export interface WorkflowComputed {
  status: WorkflowStatus;
  flags: string[];
  daysToDeadline: number;
}

export type GateSeverity = 'blocked' | 'missed' | 'info' | 'warn';

export interface GateResult {
  locked: boolean;
  reason?: string;
  info?: string;
  severity: GateSeverity;
}

// ────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────

function daysFrom(a: Date | string, b: Date | string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

// ────────────────────────────────────────────────────────────
// COMPUTE WORKFLOW STATUS — C1–C5
// ────────────────────────────────────────────────────────────

export function computeWorkflowStatus(
  wf: WorkflowRow & { stages?: StageRow[]; documents?: DocumentRow[] },
  client: Pick<ClientRow, 'risk_history' | 'penalty_risk'>,
  today: Date = new Date()
): WorkflowComputed {
  const stages = wf.stages ?? []
  const docs   = wf.documents ?? []

  // Placeholder workflows (no stages) — deadline-only status
  if (stages.length === 0) {
    const d = daysFrom(today, wf.deadline)
    if (d < 0 && wf.cur_stage < 6) return { status: 'Overdue', flags: ['CRA deadline missed'], daysToDeadline: d }
    if (wf.cur_stage >= 6)          return { status: 'Complete', flags: [], daysToDeadline: d }
    return { status: 'On Track', flags: [], daysToDeadline: d }
  }

  const daysToDeadline = daysFrom(today, wf.deadline)
  const daysInCycle    = daysFrom(wf.cycle_start, today)
  const stage          = wf.cur_stage
  const missingDocs    = docs.some(d => d.status === 'pending')
  const maxReminders   = docs.reduce((m, d) => Math.max(m, d.reminder_count ?? 0), 0)

  // Complete — check stages first, before deadline check
  // A workflow is complete if ALL stages are complete regardless of cur_stage or deadline
  const allStagesComplete = stages.length > 0 && stages.every(s => s.status === 'complete')
  if (allStagesComplete || stage >= 6)
    return { status: 'Complete', flags: [], daysToDeadline }

  // Overdue (deadline passed, not yet filed)
  if (daysToDeadline < 0 && stage < 6)
    return { status: 'Overdue', flags: ['CRA deadline missed — file immediately'], daysToDeadline }

  const flags: string[] = []
  let atRisk = false

  // C1 — Timeline breach: Stage 3 not started after Day 12
  if (stage < 3 && daysInCycle > 12) {
    atRisk = true
    flags.push('C1: Timeline breach — Stage 3 not started after Day 12')
  }
  // C2 — Deadline proximity: ≤ 3 days, not at review stage
  if (daysToDeadline <= 3 && stage < 4) {
    atRisk = true
    flags.push(`C2: Deadline in ${daysToDeadline}d — workflow not at Review stage`)
  }
  // C3 — Document blocker: Reminder #2 sent + deadline < 7 days
  if (missingDocs && maxReminders >= 2 && daysToDeadline < 7) {
    atRisk = true
    flags.push('C3: Document blocker — Reminder #2 sent, deadline < 7 days')
  }
  // C4 — Stage stall: task in progress > 5 days (reads from WORKFLOW, not client)
  if (wf.task_in_progress_days > 5 && stage < 6) {
    atRisk = true
    flags.push(`C4: Stage stall — task in progress ${wf.task_in_progress_days} days`)
  }
  // C5 — High-risk history: missed CRA deadline in last 12 months
  if (client.risk_history && stage < 3 && daysToDeadline <= 10) {
    atRisk = true
    flags.push('C5: High-risk history — missed CRA deadline in last 12 months')
  }
  // Soft doc blocker (Reminder #2, no deadline proximity yet)
  if (missingDocs && maxReminders >= 2 && !atRisk) {
    atRisk = true
    flags.push('Document blocker — client has not responded to Reminder #2')
  }

  return { status: atRisk ? 'At Risk' : 'On Track', flags, daysToDeadline }
}

// ────────────────────────────────────────────────────────────
// AGGREGATE CLIENT STATUS — worst across all workflows
// ────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<WorkflowStatus, number> = {
  Overdue:    3,
  'At Risk':  2,
  'On Track': 1,
  Complete:   0,
}

export function aggregateClientStatus(
  computedWorkflows: WorkflowComputed[]
): WorkflowComputed {
  let worst: WorkflowComputed = { status: 'Complete', flags: [], daysToDeadline: 999 }
  for (const wc of computedWorkflows) {
    if ((STATUS_PRIORITY[wc.status] ?? 0) > (STATUS_PRIORITY[worst.status] ?? 0)) {
      worst = wc
    }
  }
  return worst
}

// ────────────────────────────────────────────────────────────
// RISK SCORE — numeric priority for dashboard sorting
// ────────────────────────────────────────────────────────────

export function wfRiskScore(
  computed: WorkflowComputed,
  client: Pick<ClientRow, 'risk_history' | 'penalty_risk'>
): number {
  let s = 0
  const d = computed.daysToDeadline ?? 99
  if (computed.status === 'Overdue')    s += 100
  if (computed.status === 'At Risk')    s += 50
  if (client.penalty_risk === 'HIGH')   s += 25
  if (client.risk_history)              s += 15
  if (d <= 3)  s += 30
  if (d <= 7)  s += 20
  if (d <= 14) s += 10
  return s
}

// ────────────────────────────────────────────────────────────
// GATE EVALUATION — per-stage enforcement
// Returns null if no gate applies.
// ────────────────────────────────────────────────────────────

export function evaluateGate(
  stage: StageRow,
  wf: WorkflowRow & { stages?: StageRow[]; documents?: DocumentRow[] },
  client: Pick<ClientRow, 'type' | 'net_gst' | 'risk_history'>
): GateResult | null {
  const docs        = wf.documents ?? []
  const stages      = wf.stages ?? []
  const missingDocs = docs.filter(d => d.status === 'pending')
  const n = stage.n

  // Explicitly blocked or missed stages
  if (stage.blocked || stage.missed) {
    return {
      locked: true,
      reason: stage.block_reason ?? 'This stage is blocked — resolve the previous stage first.',
      severity: stage.missed ? 'missed' : 'blocked',
    }
  }

  // Stage 2: block if docs still pending and Stage 2 is currently active
  if (n === 2 && missingDocs.length > 0 && stage.status === 'in_progress') {
    return {
      locked: true,
      reason: `${missingDocs.length} document${missingDocs.length > 1 ? 's' : ''} still pending. Stage 3 cannot begin until all required documents are received.`,
      severity: 'blocked',
    }
  }

  // Stage 3: for Corporation, ITC reconciliation is required
  if (n === 3 && client.type === 'Corporation' && stage.status === 'pending') {
    return {
      locked: false,
      info: 'Corporation — ITC reconciliation must be confirmed before preparation is complete.',
      severity: 'info',
    }
  }

  // Stage 3: high-risk client — note senior auto-assign
  if (n === 3 && client.risk_history && stage.status === 'pending') {
    return {
      locked: false,
      info: 'High-risk client — senior accountant has been auto-assigned to this stage.',
      severity: 'warn',
    }
  }

  // Stage 4: dual review if GST > $10k
  if (n === 4 && (client.net_gst ?? 0) > 10_000 && stage.status === 'pending') {
    return {
      locked: false,
      info: `GST $${client.net_gst?.toLocaleString()} > $10,000 — dual review required. Both accountant and senior must approve.`,
      severity: 'info',
    }
  }

  // Stage 4: refund claim
  if (n === 4 && (client.net_gst ?? 0) < 0 && stage.status === 'pending') {
    return {
      locked: false,
      info: 'Refund claim detected — document justification required before this review can be approved.',
      severity: 'warn',
    }
  }

  // Stage 5: block if Stage 4 not complete
  if (n === 5 && stage.status === 'pending') {
    const reviewStage = stages.find(s => s.n === 4)
    if (reviewStage && reviewStage.status !== 'complete') {
      return {
        locked: true,
        reason: 'Filing is blocked. Stage 4 review must be approved before this return can be submitted to CRA.',
        severity: 'blocked',
      }
    }
  }

  return null
}

// ────────────────────────────────────────────────────────────
// FORWARD-LOOKING: identify On Track clients about to tip
// ────────────────────────────────────────────────────────────

export function willBecomeAtRisk(
  computed: WorkflowComputed,
  withinDays: number = 5
): boolean {
  return (
    computed.status === 'On Track' &&
    computed.daysToDeadline >= 0 &&
    computed.daysToDeadline <= withinDays
  )
}
