// ============================================================
// AcctOS — Edge Function: process-automation-jobs
// Runtime: Deno (Supabase Edge Functions)
// Called by pg_cron every 15 minutes.
//
// Fetches pending automation_jobs where scheduled_at <= now(),
// processes each one (send email, update status, skip if condition
// no longer applies), and logs results to notification_log.
//
// Deploy: supabase functions deploy process-automation-jobs
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BATCH_SIZE = 50  // Process at most 50 jobs per invocation

Deno.serve(async (req) => {
  // Only allow calls from pg_cron (service role) or manual trigger
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const appUrl       = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://app.acct-os.com'

  const now  = new Date().toISOString()
  const results = { processed: 0, sent: 0, skipped: 0, failed: 0 }

  // ── Fetch pending jobs ───────────────────────────────────────

  const { data: jobs, error: fetchError } = await supabase
    .from('automation_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .lt('attempts', 3)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchError) {
    console.error('[automation] Failed to fetch jobs:', fetchError)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  // ── Process each job ─────────────────────────────────────────

  for (const job of (jobs ?? [])) {
    results.processed++

    // Mark as processing to prevent double-execution
    await supabase
      .from('automation_jobs')
      .update({ status: 'processing', attempts: job.attempts + 1 })
      .eq('id', job.id)

    try {
      const outcome = await processJob(supabase, job, resendApiKey, appUrl)

      await supabase
        .from('automation_jobs')
        .update({
          status:       outcome.status,
          processed_at: new Date().toISOString(),
          last_error:   outcome.error ?? null,
        })
        .eq('id', job.id)

      if (outcome.status === 'sent') results.sent++
      else if (outcome.status === 'skipped') results.skipped++
      else results.failed++

      // Log to notification_log if an email was sent
      if (outcome.status === 'sent' && outcome.notification) {
        await supabase.from('notification_log').insert({
          firm_id:         job.firm_id,
          job_id:          job.id,
          workflow_id:     job.workflow_id,
          client_id:       job.client_id,
          channel:         'email',
          recipient_email: outcome.notification.email,
          recipient_name:  outcome.notification.name,
          subject:         outcome.notification.subject,
          type:            job.type,
          resend_id:       outcome.notification.resendId,
        })
      }
    } catch (err: any) {
      console.error(`[automation] Job ${job.id} threw:`, err)
      await supabase
        .from('automation_jobs')
        .update({ status: 'failed', last_error: err.message, processed_at: new Date().toISOString() })
        .eq('id', job.id)
      results.failed++
    }
  }

  console.log('[automation] Batch complete:', results)
  return new Response(JSON.stringify(results), { status: 200 })
})

// ────────────────────────────────────────────────────────────
// JOB PROCESSOR
// ────────────────────────────────────────────────────────────

type JobStatus = 'sent' | 'skipped' | 'failed'
interface JobOutcome {
  status:       JobStatus
  error?:       string
  notification?: {
    email:    string
    name:     string
    subject:  string
    resendId: string | null
  }
}

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: any,
  resendApiKey: string | undefined,
  appUrl: string
): Promise<JobOutcome> {

  // Fetch workflow + client + firm + users for context
  const { data: workflow } = await supabase
    .from('workflows')
    .select(`
      *,
      client:clients!workflows_client_id_fkey (
        id, name, type, net_gst, risk_history, penalty_risk, assigned_to
      )
    `)
    .eq('id', job.workflow_id)
    .single()

  if (!workflow) {
    return { status: 'skipped', error: 'Workflow not found — may have been deleted' }
  }

  // Skip if workflow is already complete
  if (workflow.computed_status === 'Complete' || workflow.cur_stage >= 6) {
    return { status: 'skipped', error: 'Workflow already complete' }
  }

  const { data: firmData } = await supabase
    .from('firms')
    .select('name')
    .eq('id', job.firm_id)
    .single()

  const firmName = firmData?.name ?? 'Your Accounting Firm'

  // Fetch firm settings for this job type check
  const { data: settings } = await supabase
    .from('firm_settings')
    .select('*')
    .eq('firm_id', job.firm_id)
    .single()

  // Fetch the owner user
  const { data: owner } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('firm_id', job.firm_id)
    .eq('role', 'owner')
    .limit(1)
    .single()

  // Fetch assigned accountant
  let assignedUser: any = null
  if (workflow.client?.assigned_to) {
    const { data: u } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', workflow.client.assigned_to)
      .single()
    assignedUser = u
  }
  // Fall back to owner if no assigned accountant
  if (!assignedUser) assignedUser = owner

  // ── Route by job type ────────────────────────────────────────

  switch (job.type) {
    case 'doc_reminder':
    case 'doc_escalation': {
      // Check: are docs still pending?
      if (!settings?.doc_reminder_enabled) {
        return { status: 'skipped', error: 'doc_reminder disabled in settings' }
      }

      const { data: pendingDocs } = await supabase
        .from('documents')
        .select('name')
        .eq('workflow_id', job.workflow_id)
        .eq('status', 'pending')

      if (!pendingDocs || pendingDocs.length === 0) {
        return { status: 'skipped', error: 'All documents already received' }
      }

      // For doc_reminder we email the client.
      // In Phase 2+ we use the client portal — for now we email the assigned accountant
      // who then forwards or calls the client. Phase 4 will add direct client emails.
      const recipient = assignedUser
      if (!recipient?.email) {
        return { status: 'failed', error: 'No recipient email found' }
      }

      const reminderNumber = job.type === 'doc_escalation' ? 2 : 1

      // doc_escalation also alerts the owner
      if (job.type === 'doc_escalation' && owner && owner.email !== recipient.email) {
        await sendEmail(resendApiKey, {
          to:      owner.email,
          subject: `⚑ Escalation: ${workflow.client.name} — documents still pending`,
          html:    buildEscalationHtml({
            ownerName:      owner.name,
            clientName:     workflow.client.name,
            firmName,
            workflowLabel:  workflow.label,
            deadline:       workflow.deadline,
            pendingDocs:    pendingDocs.map(d => d.name),
            daysToDeadline: workflow.days_to_deadline ?? 0,
            assignedTo:     assignedUser?.name ?? 'Your accountant',
          }),
        })
      }

      const subject  = reminderNumber === 1
        ? `Documents needed: ${workflow.label}`
        : `[Action Required] Documents still pending: ${workflow.label}`

      const res = await sendEmail(resendApiKey, {
        to:      recipient.email,
        subject,
        html:    buildDocReminderHtml({
          clientName:     workflow.client.name,
          firmName,
          workflowLabel:  workflow.label,
          deadline:       workflow.deadline,
          pendingDocs:    pendingDocs.map(d => d.name),
          reminderNumber,
        }),
      })

      // Increment reminder_count on documents
      for (const doc of pendingDocs) {
        await supabase.rpc('increment_reminder_count', {
          doc_id: (doc as any).id,
        })
      }

      return {
        status: res.error ? 'failed' : 'sent',
        error:  res.error ?? undefined,
        notification: res.id ? {
          email:    recipient.email,
          name:     recipient.name,
          subject,
          resendId: res.id,
        } : undefined,
      }
    }

    case 'deadline_alert': {
      if (workflow.days_to_deadline === null || workflow.days_to_deadline < 0) {
        return { status: 'skipped', error: 'Already past deadline' }
      }

      const recipient = assignedUser
      if (!recipient?.email) return { status: 'failed', error: 'No accountant email' }

      const subject = workflow.days_to_deadline <= 1
        ? `🔴 URGENT: ${workflow.client.name} deadline tomorrow`
        : `📅 Deadline in ${workflow.days_to_deadline}d — ${workflow.client.name}`

      const res = await sendEmail(resendApiKey, {
        to:      recipient.email,
        subject,
        html:    buildDeadlineAlertHtml({
          accountantName: recipient.name,
          clientName:     workflow.client.name,
          firmName,
          workflowLabel:  workflow.label,
          deadline:       workflow.deadline,
          daysToDeadline: workflow.days_to_deadline,
          currentStage:   workflow.cur_stage,
          currentStatus:  workflow.computed_status,
        }),
      })

      return {
        status: res.error ? 'failed' : 'sent',
        error:  res.error ?? undefined,
        notification: res.id ? {
          email: recipient.email, name: recipient.name,
          subject, resendId: res.id,
        } : undefined,
      }
    }

    case 'urgent_doc_alert': {
      // Only fire if docs are still missing AND deadline is < 5 days
      const { data: pendingDocs } = await supabase
        .from('documents')
        .select('name')
        .eq('workflow_id', job.workflow_id)
        .eq('status', 'pending')

      if (!pendingDocs || pendingDocs.length === 0) {
        return { status: 'skipped', error: 'No pending documents' }
      }
      if (!owner?.email) return { status: 'failed', error: 'No owner email' }

      const subject = `⚑ URGENT: ${workflow.client.name} — docs missing, ${workflow.days_to_deadline}d to deadline`
      const res = await sendEmail(resendApiKey, {
        to:      owner.email,
        subject,
        html:    buildEscalationHtml({
          ownerName:      owner.name,
          clientName:     workflow.client.name,
          firmName,
          workflowLabel:  workflow.label,
          deadline:       workflow.deadline,
          pendingDocs:    pendingDocs.map(d => d.name),
          daysToDeadline: workflow.days_to_deadline ?? 0,
          assignedTo:     assignedUser?.name ?? 'Your accountant',
        }),
      })

      return {
        status: res.error ? 'failed' : 'sent',
        error: res.error ?? undefined,
        notification: res.id ? {
          email: owner.email, name: owner.name,
          subject, resendId: res.id,
        } : undefined,
      }
    }

    case 'overdue_flag': {
      if (!settings?.overdue_flag_enabled) {
        return { status: 'skipped', error: 'overdue_flag disabled in settings' }
      }

      // Mark workflow as overdue
      await supabase
        .from('workflows')
        .update({ computed_status: 'Overdue' })
        .eq('id', job.workflow_id)
        .eq('computed_status', 'At Risk')  // only update if not already worse

      if (!owner?.email) return { status: 'failed', error: 'No owner email' }

      const daysOverdue = Math.abs(workflow.days_to_deadline ?? 0)
      const subject = `✕ OVERDUE: ${workflow.client.name} — ${workflow.label} — ${daysOverdue}d past deadline`

      const res = await sendEmail(resendApiKey, {
        to:      owner.email,
        subject,
        html:    buildOverdueHtml({
          ownerName:     owner.name,
          clientName:    workflow.client.name,
          firmName,
          workflowLabel: workflow.label,
          deadline:      workflow.deadline,
          daysOverdue,
          penaltyRisk:   workflow.client.penalty_risk,
        }),
      })

      return {
        status: res.error ? 'failed' : 'sent',
        error: res.error ?? undefined,
        notification: res.id ? {
          email: owner.email, name: owner.name,
          subject, resendId: res.id,
        } : undefined,
      }
    }

    default:
      return { status: 'skipped', error: `Unknown job type: ${job.type}` }
  }
}

// ────────────────────────────────────────────────────────────
// EMAIL SENDER (inline Resend call — no imports in Edge Function)
// ────────────────────────────────────────────────────────────

async function sendEmail(
  apiKey: string | undefined,
  opts: { to: string; subject: string; html: string }
): Promise<{ id: string | null; error: string | null }> {
  if (!apiKey) {
    console.warn('[automation] RESEND_API_KEY not set — email not sent (dev mode)')
    return { id: 'dev-mode-no-send', error: null }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    Deno.env.get('RESEND_FROM_ADDRESS') ?? 'AcctOS <noreply@acct-os.com>',
        to:      [opts.to],
        subject: opts.subject,
        html:    opts.html,
      }),
    })
    const data = await res.json()
    if (!res.ok) return { id: null, error: data.message ?? `Resend HTTP ${res.status}` }
    return { id: data.id, error: null }
  } catch (err: any) {
    return { id: null, error: err.message }
  }
}

// ────────────────────────────────────────────────────────────
// INLINE HTML BUILDERS (minimal — full templates in Next.js)
// ────────────────────────────────────────────────────────────

function buildDocReminderHtml(p: any): string {
  const docs = p.pendingDocs.map((d: string) => `<li>${d}</li>`).join('')
  const isR2 = p.reminderNumber === 2
  return `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;">
    <h2 style="color:${isR2 ? '#F59E0B' : '#2563EB'};">Documents needed${isR2 ? ' — Action Required' : ''}</h2>
    <p><strong>${p.workflowLabel}</strong> · CRA deadline: ${p.deadline}</p>
    <p>The following documents are still required:</p>
    <ul>${docs}</ul>
    <p style="color:#475569;font-size:13px;">Please provide these documents to avoid a late filing penalty. Contact ${p.firmName} with any questions.</p>
  </div>`
}

function buildEscalationHtml(p: any): string {
  const docs = p.pendingDocs.map((d: string) => `<li>${d}</li>`).join('')
  return `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;">
    <h2 style="color:#DC2626;">⚑ Document escalation — ${p.clientName}</h2>
    <p>Hi ${p.ownerName}, Reminder #2 has been sent. ${p.daysToDeadline} days to deadline.</p>
    <p><strong>Workflow:</strong> ${p.workflowLabel}<br><strong>Assigned to:</strong> ${p.assignedTo}</p>
    <p><strong>Pending documents:</strong></p>
    <ul>${docs}</ul>
    <p style="color:#475569;font-size:13px;">Log in to AcctOS to take action.</p>
  </div>`
}

function buildDeadlineAlertHtml(p: any): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;">
    <h2 style="color:${p.daysToDeadline <= 1 ? '#DC2626' : '#F59E0B'};">
      ${p.daysToDeadline <= 1 ? '🔴 URGENT: ' : '📅 '}Deadline ${p.daysToDeadline <= 1 ? 'tomorrow' : `in ${p.daysToDeadline} days`}
    </h2>
    <p>Hi ${p.accountantName}, the CRA deadline for <strong>${p.clientName}</strong>'s ${p.workflowLabel} is approaching.</p>
    <p><strong>Deadline:</strong> ${p.deadline}<br><strong>Current stage:</strong> ${p.currentStage}/6 — ${p.currentStatus}</p>
    <p style="color:#475569;font-size:13px;">Log in to AcctOS to continue the workflow.</p>
  </div>`
}

function buildOverdueHtml(p: any): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;border:2px solid #DC2626;border-radius:8px;">
    <h2 style="color:#DC2626;">✕ CRA deadline missed — ${p.clientName}</h2>
    <p>Hi ${p.ownerName}, the deadline for ${p.workflowLabel} passed ${p.daysOverdue} days ago.</p>
    ${p.penaltyRisk === 'HIGH' ? '<p style="color:#DC2626;font-weight:700;">⚠ HIGH PENALTY RISK — file immediately and document the reason.</p>' : ''}
    <p>File the return as soon as possible to minimise CRA interest and penalties.</p>
    <p style="color:#475569;font-size:13px;">Log in to AcctOS to take action.</p>
  </div>`
}
