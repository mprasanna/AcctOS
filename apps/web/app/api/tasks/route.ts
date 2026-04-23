import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/tasks ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflow_id')
  const assignedTo = searchParams.get('assigned_to')
  const status     = searchParams.get('status')
  const stageN     = searchParams.get('stage_n')

  let query = supabase
    .from('tasks')
    .select('*, assigned_user:users!tasks_assigned_to_fkey ( id, name, initials )')
    .order('sort_order', { ascending: true })

  if (workflowId) query = query.eq('workflow_id', workflowId)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)
  if (status)     query = query.eq('status', status)
  if (stageN)     query = query.eq('stage_n', parseInt(stageN))

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
