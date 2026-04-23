import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeWorkflowStatus, wfRiskScore, aggregateClientStatus } from '@/lib/risk-engine'

// ─── GET /api/intelligence ────────────────────────────────────────────────────
// Returns:
//   priority_suggestion  — "Start with Patel & Sons — highest penalty risk"
//   anomalies            — "Sunrise Bakery GST 40% lower than last quarter"
//   this_week_summary    — "4 filings due this week"
//   notification_stats   — delivery rates for the last 30 days

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const today   = new Date()
  const in7Days = new Date(today.getTime() + 7 * 86_400_000).toISOString().split('T')[0]

  // Run all queries in parallel
  const [clientsResult, gstHistoryResult, notifResult] = await Promise.all([
    // All clients with active workflows
    supabase
      .from('clients')
      .select(`
        id, name, type, net_gst, risk_history, penalty_risk, assigned_to,
        workflows (
          id, label, type, period, deadline, cycle_start, cur_stage,
          task_in_progress_days, computed_status, computed_flags, days_to_deadline,
          stages ( n, name, status, blocked, missed ),
          documents ( id, status, reminder_count )
        )
      `),

    // Last 4 GST periods per client for anomaly detection
    supabase
      .from('gst_history')
      .select('client_id, period, net_gst, deadline, filed_at')
      .order('deadline', { ascending: false })
      .limit(400),  // ~4 periods × 100 clients

    // Notification stats for last 30 days
    supabase
      .from('notification_log')
      .select('type, delivery_status, sent_at')
      .gte('sent_at', new Date(today.getTime() - 30 * 86_400_000).toISOString()),
  ])

  const clients    = clientsResult.data ?? []
  const gstHistory = gstHistoryResult.data ?? []

  // ── 1. Priority suggestion ────────────────────────────────────

  const enrichedClients = clients.map(client => {
    const computedWorkflows = (client.workflows ?? []).map(wf => ({
      ...wf,
      computed: computeWorkflowStatus({ ...wf, stages: wf.stages, documents: wf.documents }, client, today),
    }))
    const aggregate = aggregateClientStatus(computedWorkflows.map(w => w.computed))
    const score     = wfRiskScore(aggregate, client)
    return { ...client, status: aggregate.status, flags: aggregate.flags, score, computedWorkflows }
  }).sort((a, b) => b.score - a.score)

  const priorityClient      = enrichedClients.find(c => c.status !== 'Complete')
  const dueThisWeekCount    = enrichedClients.filter(c =>
    c.computedWorkflows.some(w =>
      w.computed.daysToDeadline !== undefined &&
      w.computed.daysToDeadline >= 0 &&
      w.computed.daysToDeadline <= 7 &&
      w.computed.status !== 'Complete'
    )
  ).length

  let prioritySuggestion: string | null = null
  if (priorityClient) {
    const client  = priorityClient
    const reasons: string[] = []

    if (client.status === 'Overdue')         reasons.push('overdue — filing missed')
    if (client.penalty_risk === 'HIGH')      reasons.push('high penalty risk')
    if (client.risk_history)                 reasons.push('missed deadline in last 12 months')
    if (client.flags?.[0])                   reasons.push(client.flags[0].replace(/^C\d: /, ''))

    const reasonStr = reasons.length > 0
      ? ` — ${reasons.slice(0, 2).join(', ')}`
      : ''

    prioritySuggestion = dueThisWeekCount > 0
      ? `You have ${dueThisWeekCount} filing${dueThisWeekCount !== 1 ? 's' : ''} due this week. Start with ${client.name}${reasonStr}.`
      : `Start with ${client.name}${reasonStr}.`
  }

  // ── 2. GST anomaly detection ──────────────────────────────────

  // Group history by client
  const historyByClient = gstHistory.reduce((acc, row) => {
    if (!acc[row.client_id]) acc[row.client_id] = []
    acc[row.client_id].push(row)
    return acc
  }, {} as Record<string, typeof gstHistory>)

  const anomalies: Array<{
    client_id:    string
    client_name:  string
    current_gst:  number
    prior_avg:    number
    change_pct:   number
    periods:      string[]
    message:      string
  }> = []

  for (const client of clients) {
    const history = historyByClient[client.id]
    if (!history || history.length < 2) continue  // need at least 2 periods to compare

    // Most recent period
    const [latest, ...prior] = history.sort(
      (a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
    )

    const priorAvg  = prior.slice(0, 3).reduce((s, h) => s + Number(h.net_gst), 0) / Math.min(prior.length, 3)
    if (priorAvg === 0) continue

    const changePct = ((Number(latest.net_gst) - priorAvg) / Math.abs(priorAvg)) * 100

    // Flag if change > 30% in either direction
    if (Math.abs(changePct) >= 30) {
      const direction = changePct > 0 ? 'higher' : 'lower'
      const absChange = Math.abs(Math.round(changePct))
      anomalies.push({
        client_id:   client.id,
        client_name: client.name,
        current_gst: Number(latest.net_gst),
        prior_avg:   Math.round(priorAvg),
        change_pct:  Math.round(changePct),
        periods:     [latest.period, ...prior.slice(0, 2).map(p => p.period)],
        message: `${client.name}'s GST for ${latest.period} is $${Number(latest.net_gst).toLocaleString()} — ${absChange}% ${direction} than the prior ${Math.min(prior.length, 3)}-period average ($${Math.round(priorAvg).toLocaleString()}). Review before filing.`,
      })
    }
  }

  // Sort anomalies by magnitude
  anomalies.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))

  // ── 3. Notification stats ─────────────────────────────────────

  const notifications = notifResult.data ?? []
  const notifStats = {
    total:     notifications.length,
    delivered: notifications.filter(n => n.delivery_status === 'delivered').length,
    opened:    notifications.filter(n => n.delivery_status === 'opened').length,
    bounced:   notifications.filter(n => n.delivery_status === 'bounced').length,
    by_type:   notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] ?? 0) + 1
      return acc
    }, {} as Record<string, number>),
  }

  // ── 4. This week's filings summary ───────────────────────────

  const dueThisWeek = enrichedClients
    .flatMap(c =>
      c.computedWorkflows
        .filter(w =>
          w.computed.daysToDeadline !== undefined &&
          w.computed.daysToDeadline >= 0 &&
          w.computed.daysToDeadline <= 7 &&
          w.computed.status !== 'Complete'
        )
        .map(w => ({
          client_id:       c.id,
          client_name:     c.name,
          workflow_label:  w.label,
          days_to_deadline: w.computed.daysToDeadline,
          status:          w.computed.status,
        }))
    )
    .sort((a, b) => (a.days_to_deadline ?? 0) - (b.days_to_deadline ?? 0))

  return NextResponse.json({
    priority_suggestion: prioritySuggestion,
    anomalies:           anomalies.slice(0, 5),  // top 5 anomalies
    this_week: {
      count:    dueThisWeekCount,
      filings:  dueThisWeek,
    },
    notification_stats: notifStats,
    as_of: today.toISOString(),
  })
}
