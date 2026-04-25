import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/time-entries?workflow_id=&task_id= ──────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('firm_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflow_id')
  const taskId     = searchParams.get('task_id')

  let query = supabase
    .from('time_entries')
    .select(`
      id, task_id, user_id, started_at, stopped_at, duration_minutes,
      note, billable, created_at,
      user:users!time_entries_user_id_fkey ( id, name, initials )
    `)
    .eq('firm_id', userRow.firm_id)
    .order('created_at', { ascending: false })

  if (workflowId) query = query.eq('workflow_id', workflowId)
  if (taskId)     query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute elapsed for any running timers
  const enriched = (data ?? []).map(entry => {
    let minutes = entry.duration_minutes
    if (!minutes && entry.started_at) {
      const stop = entry.stopped_at ? new Date(entry.stopped_at) : new Date()
      minutes = Math.round((stop.getTime() - new Date(entry.started_at).getTime()) / 60000)
    }
    return { ...entry, computed_minutes: minutes ?? 0, running: !entry.stopped_at && !!entry.started_at }
  })

  return NextResponse.json({ data: enriched })
}

// ─── POST /api/time-entries ───────────────────────────────────────────────────
// Three modes:
//   { action: 'start', workflow_id, task_id?, note? }  → starts stopwatch
//   { action: 'stop',  entry_id }                      → stops running timer
//   { action: 'log',   workflow_id, task_id?, duration_minutes, note? } → manual entry
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('firm_id, name').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { action, workflow_id, task_id, duration_minutes, note, entry_id, billable = true, client_id } = body

  // ── START timer ─────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })

    // Stop any currently running timer for this user first
    await supabase
      .from('time_entries')
      .update({ stopped_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('firm_id', userRow.firm_id)
      .is('stopped_at', null)
      .not('started_at', 'is', null)

    // Get client_id from workflow if not provided
    let resolvedClientId = client_id
    if (!resolvedClientId) {
      const { data: wf } = await supabase.from('workflows').select('client_id').eq('id', workflow_id).single()
      resolvedClientId = wf?.client_id
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        firm_id:     userRow.firm_id,
        client_id:   resolvedClientId,
        workflow_id,
        task_id:     task_id ?? null,
        user_id:     user.id,
        started_at:  new Date().toISOString(),
        note:        note ?? null,
        billable,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, action: 'started' }, { status: 201 })
  }

  // ── STOP timer ──────────────────────────────────────────────────────────────
  if (action === 'stop') {
    if (!entry_id) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

    const stoppedAt = new Date()
    const { data: entry } = await supabase
      .from('time_entries').select('started_at').eq('id', entry_id).single()

    const durationMinutes = entry?.started_at
      ? Math.round((stoppedAt.getTime() - new Date(entry.started_at).getTime()) / 60000)
      : null

    const { data, error } = await supabase
      .from('time_entries')
      .update({ stopped_at: stoppedAt.toISOString(), duration_minutes: durationMinutes })
      .eq('id', entry_id)
      .eq('user_id', user.id) // can only stop your own timer
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, action: 'stopped', duration_minutes: durationMinutes })
  }

  // ── LOG manual entry ─────────────────────────────────────────────────────────
  if (action === 'log') {
    if (!workflow_id || !duration_minutes) {
      return NextResponse.json({ error: 'workflow_id and duration_minutes required' }, { status: 400 })
    }

    let resolvedClientId = client_id
    if (!resolvedClientId) {
      const { data: wf } = await supabase.from('workflows').select('client_id').eq('id', workflow_id).single()
      resolvedClientId = wf?.client_id
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        firm_id:          userRow.firm_id,
        client_id:        resolvedClientId,
        workflow_id,
        task_id:          task_id ?? null,
        user_id:          user.id,
        duration_minutes: Number(duration_minutes),
        note:             note ?? null,
        billable,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, action: 'logged' }, { status: 201 })
  }

  return NextResponse.json({ error: 'action must be start | stop | log' }, { status: 400 })
}

// ─── DELETE /api/time-entries?entry_id= ──────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const entryId = searchParams.get('entry_id')
  if (!entryId) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

  const { error } = await supabase
    .from('time_entries').delete().eq('id', entryId).eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
