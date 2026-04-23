import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/workflow-links ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('workflow_links')
    .select(`
      id, active, created_at,
      source_stage_n, target_stage_n,
      source:workflows!workflow_links_source_workflow_id_fkey ( id, label, type, computed_status ),
      target:workflows!workflow_links_target_workflow_id_fkey ( id, label, type, computed_status )
    `)
    .order('created_at', { ascending: false })

  if (clientId) {
    // Filter where either side belongs to this client — requires a join
    // Simpler: fetch all and filter in JS for now; optimize in Phase 3
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

// ─── POST /api/workflow-links ─────────────────────────────────────────────────
// Link a Bookkeeping workflow's sign-off stage to a GST workflow's Stage 1.
// When Bookkeeping Stage 6 completes → GST Stage 1 auto-completes.

export async function POST(req: NextRequest) {
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

  if (!['owner', 'senior_accountant'].includes(userRow?.role ?? '')) {
    return NextResponse.json(
      { error: 'Only owner and senior accountant can create workflow links', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const {
    source_workflow_id,
    source_stage_n = 6,    // Default: Bookkeeping sign-off
    target_workflow_id,
    target_stage_n = 1,    // Default: GST Stage 1 bookkeeping gate
  } = body

  if (!source_workflow_id || !target_workflow_id) {
    return NextResponse.json(
      { error: 'source_workflow_id and target_workflow_id are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // Verify both workflows belong to this firm
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, type, client_id')
    .in('id', [source_workflow_id, target_workflow_id])

  if ((workflows ?? []).length !== 2) {
    return NextResponse.json(
      { error: 'One or both workflows not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const source = workflows!.find(w => w.id === source_workflow_id)
  const target = workflows!.find(w => w.id === target_workflow_id)

  // Warn if types look wrong (but don't block — allow flexibility)
  if (source?.type !== 'Bookkeeping') {
    console.warn(`Workflow link: source ${source_workflow_id} is type ${source?.type}, not Bookkeeping`)
  }

  const { data: link, error: linkError } = await supabase
    .from('workflow_links')
    .insert({
      firm_id:            userRow!.firm_id,
      source_workflow_id,
      source_stage_n,
      target_workflow_id,
      target_stage_n,
      active:             true,
    })
    .select()
    .single()

  if (linkError) {
    if (linkError.code === '23505') { // unique violation
      return NextResponse.json(
        { error: 'A link between these workflows already exists', code: 'CONFLICT' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: linkError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json(link, { status: 201 })
}
