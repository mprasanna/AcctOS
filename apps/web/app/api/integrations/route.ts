import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revokeQboToken } from '@/lib/integrations/qbo'

// ─── GET /api/integrations ────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('integrations')
    .select(`
      id, provider, status, company_name, realm_id,
      last_synced_at, last_sync_error, sync_enabled,
      token_expires_at, connected_by,
      connected_user:users!integrations_connected_by_fkey ( id, name )
    `)
    .order('provider')

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Mask tokens — never return them to the client
  const sanitized = (data ?? []).map(i => ({
    ...i,
    // Add derived fields
    token_status: (() => {
      if (i.status !== 'connected') return i.status
      if (!i.token_expires_at) return 'connected'
      const expiresIn = new Date(i.token_expires_at).getTime() - Date.now()
      if (expiresIn < 0)                    return 'token_expired'
      if (expiresIn < 5 * 60 * 1000)       return 'token_expiring'
      return 'connected'
    })(),
  }))

  // Also include client mapping counts
  const { data: mappings } = await supabase
    .from('client_integrations')
    .select('integration_id')

  const mappingCounts = (mappings ?? []).reduce((acc, m) => {
    acc[m.integration_id] = (acc[m.integration_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return NextResponse.json({
    data: sanitized.map(i => ({
      ...i,
      clients_mapped: mappingCounts[i.id] ?? 0,
    })),
  })
}
