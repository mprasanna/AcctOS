import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  computeWorkflowStatus,
  aggregateClientStatus,
  wfRiskScore,
} from '@/lib/risk-engine'

type RouteParams = { params: { id: string } }

// ─── GET /api/clients/:id ─────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select(`
      *,
      assigned_user:users!clients_assigned_to_fkey ( id, name, initials, role ),
      workflows (
        *,
        stages ( * ),
        tasks ( * ),
        documents ( * )
      ),
      email_log ( * )
    `)
    .eq('id', params.id)
    .single()

  if (error || !client) {
    return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const today = new Date()

  // Enrich workflows
  const enrichedWorkflows = (client.workflows ?? []).map(wf => {
    const computed = computeWorkflowStatus(
      { ...wf, stages: wf.stages, documents: wf.documents },
      client,
      today
    )
    return {
      ...wf,
      computed_status:    computed.status,
      computed_flags:     computed.flags,
      days_to_deadline:   computed.daysToDeadline,
      // Sort stages and tasks
      stages: (wf.stages ?? []).sort((a: any, b: any) => a.n - b.n),
      tasks:  (wf.tasks  ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      client: {
        id:           client.id,
        name:         client.name,
        type:         client.type,
        net_gst:      client.net_gst,
        risk_history: client.risk_history,
        penalty_risk: client.penalty_risk,
      },
    }
  })

  const aggregate = aggregateClientStatus(
    enrichedWorkflows.map(w => ({
      status: w.computed_status,
      flags:  w.computed_flags,
      daysToDeadline: w.days_to_deadline,
    }))
  )
  const score = wfRiskScore(aggregate, client)

  // BN unmasked for detail view — only owner and senior_accountant
  const showBn = ['owner', 'senior_accountant'].includes(userRow.role)

  return NextResponse.json({
    ...client,
    bn: showBn ? client.bn : client.bn?.replace(/(.{5}).*(.{2})/, '$1****$2') ?? null,
    assigned_user:    client.assigned_user ?? null,
    status:           aggregate.status,
    flags:            aggregate.flags,
    days_to_deadline: aggregate.daysToDeadline,
    risk_score:       score,
    workflows:        enrichedWorkflows,
    email_log:        (client.email_log ?? []).sort(
      (a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    ),
  })
}

// ─── PATCH /api/clients/:id ───────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = await req.json()

  // Whitelist patchable fields
  const allowed = ['name', 'type', 'freq', 'city', 'since', 'bn', 'assigned_to', 'net_gst', 'risk_history', 'penalty_risk']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No patchable fields provided', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('clients')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json(updated)
}

// ─── DELETE /api/clients/:id ──────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['owner', 'senior_accountant'].includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
