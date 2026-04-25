import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type RouteParams = { params: { id: string } }

// ─── GET /api/clients/:id/events ─────────────────────────────────────────────
// Returns the activity feed for a client, newest first.
// Used by the ActivityTab in AccountingOS.jsx.

export async function GET(req: NextRequest, { params }: RouteParams) {
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

  // Verify client belongs to this firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, firm_id')
    .eq('id', params.id)
    .single()

  if (!client || client.firm_id !== userRow.firm_id) {
    return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const { data: events, error } = await supabase
    .from('events')
    .select('id, who, action, detail, created_at, workflow_id')
    .eq('client_id', params.id)
    .eq('firm_id', userRow.firm_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[GET /api/clients/:id/events]', error)
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({
    data: events ?? [],
    meta: { total: events?.length ?? 0 },
  })
}
