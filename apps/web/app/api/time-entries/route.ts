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
      note, billable, is_running, created_at,
      user:users!time_entries_user_id_fkey ( id, name, initials )
    `)
    .eq('firm_id', userRow.firm_id)
    .order('created_at', { ascending: false })

  if (workflowId) query = query.eq('workflow_id', workflowId)
  if (taskId)     query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (data ?? []).map(entry => {
    let minutes = entry.duration_minutes
    if (!minutes && entry.started_at) {
      const stop = entry.stopped_at ? new Date(entry.stopped_at) : new Date()
      minutes = Math.round((stop.getTime() - new Date(entry.started_at).getTime()) / 60000)
    }
    return {
      ...entry,
      computed_minutes: minutes ?? 0,
      running: entry.is_running === true,
    }
  })

  return NextResponse.json({ data: enriched })
}

// ─── POST /api/time-entries ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('firm_id, name').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { action, workflow_id, task_id, duration_minutes, note, entry_id, billable = true, client_id } = body

  // ── START ────────────────────────────────────────────────────────────────────
  if (action === 'start') {
    if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })

    // Stop any running timer for this user — must set is_running=false for the
    // exclusion constraint: EXCLUDE (user_id WITH =) WHERE (is_running = true)
    const { data: running } = await supabase
      .from('time_entries')
      .select('id, started_at')
      .eq('user_id', user.id)
      .eq('firm_id', userRow.firm_id)
      .eq('is_running', true)

    if (running && running.length > 0) {
      const now = new Date().toISOString()
      for (const r of running) {
        const mins = r.started_at
          ? Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000)
          : 0
        await supabase
          .from('time_entries')
          .update({ stopped_at: now, is_running: false, duration_minutes: mins })
          .eq('id', r.id)
      }
    }

    // Resolve client_id
    let resolvedClientId = client_id
    if (!resolvedClientId) {
      const { data: wf } = await supabase
        .from('workflows').select('client_id').eq('id', workflow_id).single()
      resolvedClientId = wf?.client_id
    }
    if (!resolvedClientId) {
      return NextResponse.json({ error: 'Could not resolve client_id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        firm_id:    userRow.firm_id,
        client_id:  resolvedClientId,
        workflow_id,
        task_id:    task_id ?? null,
        user_id:    user.id,
        started_at: new Date().toISOString(),
        is_running: true,
        note:       note ?? null,
        billable,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, action: 'started' }, { status: 201 })
  }

  // ── STOP ─────────────────────────────────────────────────────────────────────
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
      .update({
        stopped_at:       stoppedAt.toISOString(),
        is_running:       false,
        duration_minutes: durationMinutes,
      })
      .eq('id', entry_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, action: 'stopped', duration_minutes: durationMinutes })
  }

  // ── LOG manual ───────────────────────────────────────────────────────────────
  if (action === 'log') {
    if (!workflow_id || !duration_minutes) {
      return NextResponse.json({ error: 'workflow_id and duration_minutes required' }, { status: 400 })
    }

    let resolvedClientId = client_id
    if (!resolvedClientId) {
      const { data: wf } = await supabase
        .from('workflows').select('client_id').eq('id', workflow_id).single()
      resolvedClientId = wf?.client_id
    }
    if (!resolvedClientId) {
      return NextResponse.json({ error: 'Could not resolve client_id' }, { status: 400 })
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
        is_running:       false,
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
