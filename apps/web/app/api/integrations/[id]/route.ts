import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revokeQboToken } from '@/lib/integrations/qbo'

type RouteParams = { params: { id: string } }

// ─── DELETE /api/integrations/:id ────────────────────────────────────────────
// Disconnects an integration:
//   1. Revokes tokens at the provider
//   2. Clears tokens from DB
//   3. Sets status to disconnected

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userRow?.role !== 'owner') {
    return NextResponse.json({ error: 'Only firm owners can disconnect integrations', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, provider, refresh_token')
    .eq('id', params.id)
    .single()

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Best-effort token revocation at provider
  if (integration.refresh_token) {
    if (integration.provider === 'qbo') {
      await revokeQboToken(integration.refresh_token, 'refresh_token').catch(() => null)
    }
    // Zoho doesn't have a standard revocation endpoint in the same way
  }

  // Clear tokens and mark disconnected
  const { error: updateError } = await supabase
    .from('integrations')
    .update({
      status:           'disconnected',
      access_token:     null,
      refresh_token:    null,
      token_expires_at: null,
      last_sync_error:  'Disconnected by user',
    })
    .eq('id', params.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
