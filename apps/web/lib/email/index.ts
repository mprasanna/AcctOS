// ============================================================
// AcctOS — Resend Email Client
// Typed wrapper. All transactional email flows through here.
// Phase 3: Resend replaces the TODO comment in Phase 1/2 routes.
// ============================================================

import { Resend } from 'resend'

// ────────────────────────────────────────────────────────────
// CLIENT SINGLETON
// ────────────────────────────────────────────────────────────

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error(
        'RESEND_API_KEY is not set. Email sending is unavailable. ' +
        'Add it to .env.local (development) or Vercel Environment Variables (production).'
      )
    }
    _resend = new Resend(apiKey)
  }
  return _resend
}

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────

export interface EmailResult {
  messageId: string | null
  error:     string | null
}

export interface SendOptions {
  to:      string | string[]
  subject: string
  html:    string
  replyTo?: string
  tags?:   Array<{ name: string; value: string }>
}

// Sender identity — configure your verified domain in Resend
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'AcctOS <noreply@acct-os.com>'
const REPLY_TO     = process.env.RESEND_REPLY_TO     ?? 'support@acct-os.com'

// ────────────────────────────────────────────────────────────
// BASE SEND
// ────────────────────────────────────────────────────────────

export async function sendEmail(opts: SendOptions): Promise<EmailResult> {
  try {
    const resend = getResend()

    const { data, error } = await resend.emails.send({
      from:     FROM_ADDRESS,
      to:       Array.isArray(opts.to) ? opts.to : [opts.to],
      subject:  opts.subject,
      html:     opts.html,
      reply_to: opts.replyTo ?? REPLY_TO,
      tags:     opts.tags,
    })

    if (error) {
      console.error('[Resend] Send error:', error)
      return { messageId: null, error: error.message }
    }

    return { messageId: data?.id ?? null, error: null }
  } catch (err: any) {
    console.error('[Resend] Unexpected error:', err)
    return { messageId: null, error: err.message ?? 'Unknown email error' }
  }
}

// ────────────────────────────────────────────────────────────
// TYPED EMAIL SENDERS
// Each function maps to one automation_jobs job_type.
// ────────────────────────────────────────────────────────────

export interface DocReminderParams {
  to:             string
  clientName:     string
  firmName:       string
  workflowLabel:  string
  deadline:       string      // ISO date string
  pendingDocs:    string[]
  reminderNumber: 1 | 2
  uploadLink?:    string      // Phase 4: client portal link
}

export async function sendDocReminder(p: DocReminderParams): Promise<EmailResult> {
  const { html } = await import('./templates/doc-reminder')
  const subject  = p.reminderNumber === 1
    ? `Documents needed — ${p.workflowLabel}`
    : `[Action Required] Documents still pending — ${p.workflowLabel}`

  return sendEmail({
    to:      p.to,
    subject,
    html:    html(p),
    tags:    [
      { name: 'type',            value: 'doc_reminder' },
      { name: 'reminder_number', value: String(p.reminderNumber) },
    ],
  })
}

export interface EscalationParams {
  to:             string    // firm owner email
  ownerName:      string
  clientName:     string
  firmName:       string
  workflowLabel:  string
  deadline:       string
  pendingDocs:    string[]
  daysToDeadline: number
  assignedTo:     string   // accountant name
}

export async function sendEscalation(p: EscalationParams): Promise<EmailResult> {
  const { html } = await import('./templates/escalation')
  return sendEmail({
    to:      p.to,
    subject: `⚑ Escalation: ${p.clientName} — ${p.workflowLabel} — documents still pending`,
    html:    html(p),
    tags:    [{ name: 'type', value: 'doc_escalation' }],
  })
}

export interface DeadlineAlertParams {
  to:             string    // assigned accountant email
  accountantName: string
  clientName:     string
  firmName:       string
  workflowLabel:  string
  deadline:       string
  daysToDeadline: number
  currentStage:   number
  currentStatus:  string
}

export async function sendDeadlineAlert(p: DeadlineAlertParams): Promise<EmailResult> {
  const { html } = await import('./templates/deadline-alert')
  const urgent   = p.daysToDeadline <= 1
  return sendEmail({
    to:      p.to,
    subject: urgent
      ? `🔴 URGENT: ${p.clientName} deadline tomorrow — ${p.workflowLabel}`
      : `📅 Deadline in ${p.daysToDeadline} days — ${p.clientName} · ${p.workflowLabel}`,
    html:    html(p),
    tags:    [{ name: 'type', value: 'deadline_alert' }],
  })
}

export interface OverdueAlertParams {
  to:            string    // firm owner email
  ownerName:     string
  clientName:    string
  firmName:      string
  workflowLabel: string
  deadline:      string
  daysOverdue:   number
  penaltyRisk:   string | null
}

export async function sendOverdueAlert(p: OverdueAlertParams): Promise<EmailResult> {
  const { html } = await import('./templates/overdue-alert')
  return sendEmail({
    to:      p.to,
    subject: `✕ OVERDUE: ${p.clientName} — ${p.workflowLabel} — CRA deadline passed ${p.daysOverdue}d ago`,
    html:    html(p),
    tags:    [
      { name: 'type',         value: 'overdue_flag' },
      { name: 'penalty_risk', value: p.penaltyRisk ?? 'none' },
    ],
  })
}
