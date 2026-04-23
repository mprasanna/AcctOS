import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { sendDocReminder, sendEscalation } from '@/lib/email'

// ─── POST /api/documents/request ─────────────────────────────────────────────
// Phase 3: sends real emails via Resend.
// Increments reminder_count, logs to email_log + notification_log.
// If reminder #2, also fires escalation email to firm owner.

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role, name')
    .eq('id', user.id)
    .single()

  if (!['owner', 'admin'].includes(userRow?.role ?? '')) {
    return NextResponse.json(
      { error: 'Only owner and admin roles can send document reminders', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { workflow_id, document_ids, type } = body as {
    workflow_id: string
    document_ids: string[]
    type: string
  }

  if (!workflow_id || !document_ids?.length || !type) {
    return NextResponse.json(
      { error: 'workflow_id, document_ids, and type are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // Rate limit: no more than 1 reminder per document per 24 hours
  const { data: recentDocs } = await supabase
    .from('documents')
    .select('id, name, last_reminder_at')
    .in('id', document_ids)

  const now = new Date()
  const tooRecent = (recentDocs ?? []).find(d => {
    if (!d.last_reminder_at) return false
    return (now.getTime() - new Date(d.last_reminder_at).getTime()) / 3_600_000 < 24
  })

  if (tooRecent) {
    return NextResponse.json(
      { error: 'A reminder was sent within the last 24 hours for one or more documents', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  // Fetch workflow + client + firm + users for email context
  const { data: workflow } = await supabase
    .from('workflows')
    .select(`
      id, label, deadline, days_to_deadline, client_id, firm_id,
      client:clients!workflows_client_id_fkey (
        id, name, assigned_to
      )
    `)
    .eq('id', workflow_id)
    .single()

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data: firmData } = await supabase
    .from('firms')
    .select('name')
    .eq('id', workflow.firm_id)
    .single()

  const firmName = firmData?.name ?? 'Your Accounting Firm'

  // Get the assigned accountant (for reminder context) and firm owner (for escalation)
  const [assignedResult, ownerResult] = await Promise.all([
    workflow.client?.assigned_to
      ? supabase.from('users').select('id, name, email').eq('id', workflow.client.assigned_to).single()
      : Promise.resolve({ data: null }),
    supabase.from('users').select('id, name, email').eq('firm_id', workflow.firm_id).eq('role', 'owner').limit(1).single(),
  ])

  const assignedUser = assignedResult.data
  const ownerUser    = ownerResult.data

  // Determine reminder number from type string ("Reminder #1", "Reminder #2", etc.)
  const reminderMatch   = type.match(/#(\d+)/)
  const reminderNumber  = reminderMatch ? parseInt(reminderMatch[1]) : 1
  const isEscalation    = reminderNumber >= 2

  const pendingDocNames = (recentDocs ?? []).map(d => d.name)

  // Send reminder to accountant (they contact the client directly; Phase 4 adds client portal)
  const recipientEmail = assignedUser?.email ?? ownerUser?.email
  const recipientName  = assignedUser?.name  ?? ownerUser?.name ?? 'Accountant'

  let emailResult = { messageId: null as string | null, error: null as string | null }

  if (recipientEmail) {
    emailResult = await sendDocReminder({
      to:             recipientEmail,
      clientName:     workflow.client?.name ?? 'Client',
      firmName,
      workflowLabel:  workflow.label,
      deadline:       workflow.deadline,
      pendingDocs:    pendingDocNames,
      reminderNumber: reminderNumber as 1 | 2,
    })
  }

  // Escalation: reminder #2+ → also alert the owner separately
  if (isEscalation && ownerUser?.email && ownerUser.email !== recipientEmail) {
    await sendEscalation({
      to:             ownerUser.email,
      ownerName:      ownerUser.name,
      clientName:     workflow.client?.name ?? 'Client',
      firmName,
      workflowLabel:  workflow.label,
      deadline:       workflow.deadline,
      pendingDocs:    pendingDocNames,
      daysToDeadline: workflow.days_to_deadline ?? 0,
      assignedTo:     assignedUser?.name ?? 'Unassigned',
    })
  }

  // Increment reminder_count per document
  for (const docId of document_ids) {
    await supabase.rpc('increment_reminder_count', { doc_id: docId })
  }

  // Also update last_reminder_at
  await supabase
    .from('documents')
    .update({ last_reminder_at: now.toISOString() })
    .in('id', document_ids)

  // Log to email_log
  const { data: emailEntry } = await supabase
    .from('email_log')
    .insert({
      client_id:   workflow.client_id,
      firm_id:     userRow!.firm_id,
      workflow_id,
      type,
      sent_at:     now.toISOString(),
      status:      emailResult.error ? 'failed' : 'sent',
    })
    .select('id')
    .single()

  // Log to notification_log (Phase 3)
  if (recipientEmail && emailResult.messageId) {
    await supabase.from('notification_log').insert({
      firm_id:         userRow!.firm_id,
      workflow_id,
      client_id:       workflow.client_id,
      channel:         'email',
      recipient_email: recipientEmail,
      recipient_name:  recipientName,
      subject:         `${type} — ${workflow.label}`,
      type:            isEscalation ? 'doc_escalation' : 'doc_reminder',
      resend_id:       emailResult.messageId,
    })
  }

  // Log event
  await supabase.from('events').insert({
    client_id:   workflow.client_id,
    firm_id:     userRow!.firm_id,
    workflow_id,
    who:         userRow!.name,
    action:      `${type} sent`,
    detail:      emailResult.error
      ? `Email failed: ${emailResult.error}`
      : `Sent to ${recipientEmail ?? 'unknown'}`,
  })

  return NextResponse.json({
    sent:              !emailResult.error,
    email_log_id:      emailEntry?.id ?? null,
    resend_message_id: emailResult.messageId,
    documents_updated: document_ids.length,
    escalation_fired:  isEscalation,
    error:             emailResult.error,
  }, { status: emailResult.error ? 207 : 201 })
}
