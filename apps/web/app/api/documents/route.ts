import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/documents ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflow_id')
  const status     = searchParams.get('status')

  if (!workflowId) {
    return NextResponse.json({ error: 'workflow_id is required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  let query = supabase
    .from('documents')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: true })

  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
