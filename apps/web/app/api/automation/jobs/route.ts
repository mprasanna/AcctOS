import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/automation/jobs ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const workflowId = searchParams.get('workflow_id')
  const clientId   = searchParams.get('client_id')
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  let query = supabase
    .from('automation_jobs')
    .select(`
      id, type, status, scheduled_at, processed_at,
      attempts, max_attempts, last_error, payload,
      client:clients!automation_jobs_client_id_fkey ( id, name ),
      workflow:workflows!automation_jobs_workflow_id_fkey ( id, label )
    `)
    .order('scheduled_at', { ascending: false })
    .limit(limit)

  if (status)     query = query.eq('status', status)
  if (workflowId) query = query.eq('workflow_id', workflowId)
  if (clientId)   query = query.eq('client_id', clientId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Summary counts
  const { data: counts } = await supabase
    .from('automation_jobs')
    .select('status')

  const summary = (counts ?? []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({ data: data ?? [], summary })
}
