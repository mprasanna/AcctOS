import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeWorkflowStatus } from '@/lib/risk-engine'
import { resolveTemplate } from '@/lib/workflow-templates'
import type { WorkflowStatus, WorkflowType } from '@/types/database'

// ─── GET /api/workflows ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const clientId     = searchParams.get('client_id')
  const typeFilter   = searchParams.get('type') as WorkflowType | null
  const statusFilter = searchParams.get('status') as WorkflowStatus | null

  let query = supabase
    .from('workflows')
    .select(`
      *,
      stages ( * ),
      documents ( id, status, reminder_count ),
      client:clients!workflows_client_id_fkey ( id, name, type, net_gst, risk_history, penalty_risk, assigned_to )
    `)

  if (clientId)   query = query.eq('client_id', clientId)
  if (typeFilter) query = query.eq('type', typeFilter)

  const { data: workflows, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  const today = new Date()

  const enriched = (workflows ?? []).map(wf => {
    const computed = computeWorkflowStatus(
      { ...wf, stages: wf.stages, documents: wf.documents },
      wf.client,
      today
    )
    return {
      ...wf,
      computed_status:  computed.status,
      computed_flags:   computed.flags,
      days_to_deadline: computed.daysToDeadline,
      stages: (wf.stages ?? []).sort((a: any, b: any) => a.n - b.n),
      client_name: wf.client?.name ?? '',
    }
  })

  const filtered = statusFilter
    ? enriched.filter(w => w.computed_status === statusFilter)
    : enriched

  return NextResponse.json({
    data: filtered.sort((a, b) => (a.days_to_deadline ?? 999) - (b.days_to_deadline ?? 999)),
    meta: { total: filtered.length },
  })
}

// ─── POST /api/workflows ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, name, role')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const { client_id, type, period, deadline, cycle_start, link_bookkeeping_to } = body

  if (!client_id || !type || !period || !deadline || !cycle_start) {
    return NextResponse.json({
      error: 'client_id, type, period, deadline, and cycle_start are required',
      code: 'VALIDATION_ERROR',
    }, { status: 400 })
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, type, name, firm_id, assigned_to')
    .eq('id', client_id)
    .single()

  if (!clientRow || clientRow.firm_id !== userRow.firm_id) {
    return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const label         = `${type} — ${period}`
  const cycleStartDate = new Date(cycle_start)

  // Create workflow
  const { data: newWorkflow, error: wfError } = await supabase
    .from('workflows')
    .insert({
      client_id,
      firm_id:               userRow.firm_id,
      type,
      label,
      period,
      deadline,
      cycle_start,
      cur_stage:             1,
      task_in_progress_days: 0,
      computed_status:       'On Track',
      computed_flags:        [],
    })
    .select()
    .single()

  if (wfError || !newWorkflow) {
    return NextResponse.json({ error: wfError?.message ?? 'Failed', code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Resolve and insert template
  const resolved = resolveTemplate(type as WorkflowType, clientRow.type as any, cycleStartDate)

  if (resolved) {
    // Stages
    await supabase.from('stages').insert(
      resolved.stages.map(s => ({
        workflow_id: newWorkflow.id,
        firm_id:     userRow.firm_id,
        n:           s.n,
        name:        s.name,
        status:      'pending' as const,
        gate:        s.gate,
        gate_label:  s.gate_label,
      }))
    )

    // Resolve user IDs from roles for task assignment
    const { data: firmUsers } = await supabase
      .from('users')
      .select('id, role')
      .eq('firm_id', userRow.firm_id)

    const byRole = (role: string) =>
      firmUsers?.find(u => u.role === role)?.id ??
      firmUsers?.find(u => u.role === 'owner')?.id ?? null

    // Tasks
    await supabase.from('tasks').insert(
      resolved.tasks.map(t => ({
        workflow_id:      newWorkflow.id,
        firm_id:          userRow.firm_id,
        stage_n:          t.stage_n,
        title:            t.title,
        assigned_to:      t.assigned_role === 'accountant'
                            ? (clientRow.assigned_to ?? byRole('accountant'))
                            : byRole(t.assigned_role),
        assigned_initials: null,
        due_date:         t.due_date,
        status:           'pending' as const,
        sort_order:       t.sort_order,
      }))
    )

    // Load firm settings for upload_required flag
    const { data: fSettings } = await supabase
      .from('firm_settings')
      .select('require_upload_to_receive')
      .eq('firm_id', userRow.firm_id)
      .single()
    const requireUpload = fSettings?.require_upload_to_receive ?? false

    // Documents
    if (resolved.docs.length > 0) {
      await supabase.from('documents').insert(
        resolved.docs.map(d => ({
          workflow_id:    newWorkflow.id,
          client_id,
          firm_id:        userRow.firm_id,
          name:           d.name,
          status:         'pending' as const,
          reminder_count: 0,
          is_t183:        d.is_t183 ?? false,
          upload_required: requireUpload ? true : (d.is_t183 ?? false),
        }))
      )
    }
  }

  // Bookkeeping → GST link
  if (type === 'Bookkeeping' && link_bookkeeping_to) {
    await supabase.from('workflow_links').insert({
      firm_id:            userRow.firm_id,
      source_workflow_id: newWorkflow.id,
      source_stage_n:     6,
      target_workflow_id: link_bookkeeping_to,
      target_stage_n:     1,
    })
  }

  // Suggest bookkeeping link for GST workflows
  let suggested_bookkeeping_link = null
  if (type === 'GST/HST') {
    const { data: bkWf } = await supabase
      .from('workflows')
      .select('id, label')
      .eq('client_id', client_id)
      .eq('type', 'Bookkeeping')
      .neq('computed_status', 'Complete')
      .order('deadline', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (bkWf) {
      suggested_bookkeeping_link = {
        workflow_id: bkWf.id,
        label:       bkWf.label,
        message:     'Link this Bookkeeping workflow to auto-advance GST Stage 1 when books are signed off.',
      }
    }
  }

  await supabase.from('events').insert({
    client_id,
    firm_id:     userRow.firm_id,
    workflow_id: newWorkflow.id,
    who:         'System',
    action:      'Workflow created',
    detail:      `${label}${resolved ? ' — template applied' : ''}`,
  })

  return NextResponse.json({ ...newWorkflow, suggested_bookkeeping_link }, { status: 201 })
}
