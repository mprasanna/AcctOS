// ============================================================
// AcctOS — Edge Function: auto-create-workflows
// Runtime: Deno (Supabase Edge Functions)
// Called by pg_cron on billing cycle boundaries.
// Creates next-cycle workflows for all clients of matching freq.
//
// Deploy: supabase functions deploy auto-create-workflows
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body     = await req.json().catch(() => ({}))
  const freq     = body.freq as 'Monthly' | 'Quarterly' | null

  if (!freq) {
    return new Response(JSON.stringify({ error: 'freq required' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const today       = new Date()
  const results     = { created: 0, skipped: 0, errors: 0 }

  // Fetch all firms with auto_create_workflows = true
  const { data: firmSettings } = await supabase
    .from('firm_settings')
    .select('firm_id')
    .eq('auto_create_workflows', true)

  if (!firmSettings?.length) {
    return new Response(JSON.stringify({ ...results, message: 'No firms with auto-create enabled' }), { status: 200 })
  }

  const firmIds = firmSettings.map(s => s.firm_id)

  // Fetch all clients of the given frequency across all opted-in firms
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, type, freq, firm_id, assigned_to')
    .in('firm_id', firmIds)
    .eq('freq', freq)

  if (!clients?.length) {
    return new Response(JSON.stringify({ ...results, message: `No ${freq} clients found` }), { status: 200 })
  }

  // Compute period + deadline for the NEW cycle
  const { period, deadline, cycleStart } = computeNextCycle(freq, today)

  for (const client of clients) {
    // Check: does a workflow for this period already exist?
    const { data: existing } = await supabase
      .from('workflows')
      .select('id')
      .eq('client_id', client.id)
      .eq('type', 'GST/HST')
      .eq('period', period)
      .maybeSingle()

    if (existing) {
      results.skipped++
      continue
    }

    try {
      // Create the workflow
      const { data: newWf, error: wfError } = await supabase
        .from('workflows')
        .insert({
          client_id:             client.id,
          firm_id:               client.firm_id,
          type:                  'GST/HST',
          label:                 `GST/HST — ${period}`,
          period,
          deadline,
          cycle_start:           cycleStart,
          cur_stage:             1,
          task_in_progress_days: 0,
          computed_status:       'On Track',
          computed_flags:        [],
        })
        .select('id')
        .single()

      if (wfError || !newWf) throw wfError ?? new Error('Failed to insert workflow')

      // Log event
      await supabase.from('events').insert({
        client_id:   client.id,
        firm_id:     client.firm_id,
        workflow_id: newWf.id,
        who:         'System',
        action:      'Workflow auto-created',
        detail:      `${freq} cycle — ${period}`,
      })

      results.created++
    } catch (err: any) {
      console.error(`[auto-create] Client ${client.id} failed:`, err.message)
      results.errors++
    }
  }

  console.log(`[auto-create] ${freq}:`, results)
  return new Response(JSON.stringify(results), { status: 200 })
})

// ────────────────────────────────────────────────────────────
// COMPUTE NEXT BILLING CYCLE
// ────────────────────────────────────────────────────────────

function computeNextCycle(freq: 'Monthly' | 'Quarterly', today: Date): {
  period: string
  deadline: string
  cycleStart: string
} {
  if (freq === 'Monthly') {
    // Called on 1st of each month → period is current month
    const year  = today.getFullYear()
    const month = today.getMonth()  // 0-indexed
    const monthName = today.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })

    // Monthly GST due: last day of following month
    const deadlineDate = new Date(year, month + 2, 0)  // last day of next month
    const cycleStartDate = new Date(year, month, 1)

    return {
      period:     monthName,
      deadline:   deadlineDate.toISOString().split('T')[0],
      cycleStart: cycleStartDate.toISOString().split('T')[0],
    }
  }

  // Quarterly: called on Jan 2, Apr 2, Jul 2, Oct 2
  // Each call creates the workflow for the quarter just ended
  const month = today.getMonth()  // 0-indexed
  const year  = today.getFullYear()

  // Which quarter just ended?
  // Jan 2 → Q4 of previous year (Oct-Dec)
  // Apr 2 → Q1 of current year (Jan-Mar)
  // Jul 2 → Q2 (Apr-Jun)
  // Oct 2 → Q3 (Jul-Sep)
  let qLabel: string
  let qDeadline: Date
  let qCycleStart: Date

  if (month === 0) {
    // January → Q4 prev year
    qLabel       = `Q4 ${year - 1} (Oct–Dec)`
    qDeadline    = new Date(year, 0, 31)   // Jan 31
    qCycleStart  = new Date(year - 1, 9, 1) // Oct 1
  } else if (month === 3) {
    // April → Q1
    qLabel       = `Q1 ${year} (Jan–Mar)`
    qDeadline    = new Date(year, 3, 30)   // Apr 30
    qCycleStart  = new Date(year, 0, 1)   // Jan 1
  } else if (month === 6) {
    // July → Q2
    qLabel       = `Q2 ${year} (Apr–Jun)`
    qDeadline    = new Date(year, 6, 31)   // Jul 31
    qCycleStart  = new Date(year, 3, 1)   // Apr 1
  } else {
    // October → Q3
    qLabel       = `Q3 ${year} (Jul–Sep)`
    qDeadline    = new Date(year, 9, 31)   // Oct 31
    qCycleStart  = new Date(year, 6, 1)   // Jul 1
  }

  return {
    period:     qLabel,
    deadline:   qDeadline.toISOString().split('T')[0],
    cycleStart: qCycleStart.toISOString().split('T')[0],
  }
}
