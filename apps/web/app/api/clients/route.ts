import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  computeWorkflowStatus,
  aggregateClientStatus,
  wfRiskScore,
} from '@/lib/risk-engine'
import type { ClientSummary, WorkflowStatus } from '@/types/database'

// ─── GET /api/clients ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const statusFilter  = searchParams.get('status') as WorkflowStatus | null
  const assignedTo    = searchParams.get('assigned_to')
  const q             = searchParams.get('q')
  const sort          = searchParams.get('sort') ?? 'risk_score'

  try {
    // Fetch clients with their workflows, stages, documents, and assigned user
    let query = supabase
      .from('clients')
      .select(`
        *,
        assigned_user:users!clients_assigned_to_fkey ( id, name, initials, role ),
        workflows (
          *,
          stages ( * ),
          tasks ( id, title, status, stage_n, due_date, sort_order, assigned_to,
                  assigned_user:users!tasks_assigned_to_fkey ( id, name, initials ) ),
          documents ( id, name, status, reminder_count, last_reminder_at, uploaded_at, upload_source )
        )
      `)

    if (assignedTo) query = query.eq('assigned_to', assignedTo)
    if (q) query = query.ilike('name', `%${q}%`)

    const { data: clients, error } = await query
    if (error) throw error

    const today = new Date()

    // Enrich each client with computed status + risk score
    const enriched: ClientSummary[] = (clients ?? []).map(client => {
      const computedWorkflows = (client.workflows ?? []).map(wf => ({
        ...wf,
        computed: computeWorkflowStatus(
          { ...wf, stages: wf.stages, documents: wf.documents },
          client,
          today
        ),
      }))

      const aggregate = aggregateClientStatus(computedWorkflows.map(w => w.computed))
      const score     = wfRiskScore(aggregate, client)

      // Active workflow = worst-status, soonest deadline among non-complete
      const activeWf = computedWorkflows
        .filter(w => w.computed.status !== 'Complete')
        .sort((a, b) => (a.computed.daysToDeadline ?? 999) - (b.computed.daysToDeadline ?? 999))[0]
        ?? computedWorkflows[0]

      return {
        ...client,
        assigned_user: client.assigned_user ?? null,
        status:          aggregate.status,
        flags:           aggregate.flags,
        days_to_deadline: aggregate.daysToDeadline,
        risk_score:      score,
        active_workflow: activeWf ? {
          ...activeWf,
          computed_status: activeWf.computed.status,
          computed_flags:  activeWf.computed.flags,
          days_to_deadline: activeWf.computed.daysToDeadline,
        } : null,
        workflow_count:  (client.workflows ?? []).length,
        // Mask BN in list view
        bn: client.bn ? client.bn.replace(/(.{5}).*(.{2})/, '$1****$2') : null,
      } as unknown as ClientSummary
    })

    // Filter by computed status (post-enrichment)
    const filtered = statusFilter
      ? enriched.filter(c => c.status === statusFilter)
      : enriched

    // Sort
    const sorted = filtered.sort((a, b) => {
      if (sort === 'name')     return a.name.localeCompare(b.name)
      if (sort === 'deadline') return (a.days_to_deadline ?? 999) - (b.days_to_deadline ?? 999)
      return (b.risk_score ?? 0) - (a.risk_score ?? 0) // default: risk_score DESC
    })

    return NextResponse.json({
      data: sorted,
      meta: { total: enriched.length, filtered: sorted.length },
    })
  } catch (err) {
    console.error('[GET /api/clients]', err)
    return NextResponse.json({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

// ─── POST /api/clients ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Get user's firm_id from the users table
  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User profile not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const { name, type, freq, city, since, bn, assigned_to, net_gst } = body

  // Basic validation
  if (!name || !type || !freq) {
    return NextResponse.json({
      error: 'name, type, and freq are required',
      code: 'VALIDATION_ERROR',
    }, { status: 400 })
  }

  const validTypes = ['Corporation', 'Sole prop', 'Partnership']
  const validFreqs = ['Monthly', 'Quarterly', 'Annual']
  if (!validTypes.includes(type) || !validFreqs.includes(freq)) {
    return NextResponse.json({
      error: `type must be one of ${validTypes.join(', ')}; freq must be one of ${validFreqs.join(', ')}`,
      code: 'VALIDATION_ERROR',
    }, { status: 400 })
  }

  // Check for duplicate BN within firm
  if (bn) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('firm_id', userRow.firm_id)
      .eq('bn', bn)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        error: 'A client with this Business Number already exists in your firm',
        code: 'CONFLICT',
      }, { status: 409 })
    }
  }

  try {
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        firm_id:     userRow.firm_id,
        name,
        type,
        freq,
        city:        city ?? null,
        since:       since ?? null,
        bn:          bn ?? null,
        initials:    name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2),
        assigned_to: assigned_to ?? null,
        net_gst:     net_gst ?? null,
        risk_history: false,
        penalty_risk: null,
      })
      .select()
      .single()

    if (error) throw error

    // Log event
    await supabase.from('events').insert({
      client_id:  newClient.id,
      firm_id:    userRow.firm_id,
      who:        'System',
      action:     'Client created',
      detail:     `${type} · ${freq} filer`,
    })

    return NextResponse.json(newClient, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clients]', err)
    return NextResponse.json({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
