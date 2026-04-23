import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  computeWorkflowStatus,
  aggregateClientStatus,
  wfRiskScore,
  willBecomeAtRisk,
} from '@/lib/risk-engine'

// ─── GET /api/dashboard ───────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    // Fetch all clients with their workflows, stages, and documents in one query
    const { data: clients, error } = await supabase
      .from('clients')
      .select(`
        id, name, type, city, freq, net_gst, risk_history, penalty_risk, assigned_to, initials,
        assigned_user:users!clients_assigned_to_fkey ( id, name, initials ),
        workflows (
          id, label, type, period, deadline, cycle_start, cur_stage, task_in_progress_days,
          stages ( n, name, status, blocked, missed ),
          documents ( id, status, reminder_count )
        )
      `)

    if (error) throw error

    const today = new Date()

    // Enrich each client
    const enriched = (clients ?? []).map(client => {
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

      const activeWf = computedWorkflows
        .filter(w => w.computed.status !== 'Complete')
        .sort((a, b) => (a.computed.daysToDeadline ?? 999) - (b.computed.daysToDeadline ?? 999))[0]
        ?? computedWorkflows[0]

      return {
        ...client,
        status:          aggregate.status,
        flags:           aggregate.flags,
        days_to_deadline: aggregate.daysToDeadline,
        risk_score:      score,
        active_workflow: activeWf,
        workflow_count:  (client.workflows ?? []).length,
        computedWorkflows,
      }
    })

    // Aggregate stats
    const stats = {
      active_filings: enriched.filter(c => c.status !== 'Complete').length,
      on_track:       enriched.filter(c => c.status === 'On Track').length,
      at_risk:        enriched.filter(c => c.status === 'At Risk').length,
      overdue:        enriched.filter(c => c.status === 'Overdue').length,
      complete:       enriched.filter(c => c.status === 'Complete').length,
    }

    // Soon-at-risk: On Track clients within 5 days of deadline
    const soonAtRisk = enriched
      .filter(c => willBecomeAtRisk(
        { status: c.status as any, flags: c.flags, daysToDeadline: c.days_to_deadline ?? 999 },
        5
      ))
      .map(c => ({ id: c.id, name: c.name, days_to_deadline: c.days_to_deadline }))

    // Top 3 spotlights by risk score (non-complete)
    const spotlights = enriched
      .filter(c => c.status !== 'Complete')
      .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
      .slice(0, 3)
      // Strip computedWorkflows from response to keep payload lean
      .map(({ computedWorkflows: _, ...c }) => c)

    return NextResponse.json({
      stats,
      soon_at_risk: soonAtRisk,
      spotlights,
      as_of: today.toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/dashboard]', err)
    return NextResponse.json({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
