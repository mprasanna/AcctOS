import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildZohoAuthUrl } from '@/lib/integrations/zoho'
import { randomBytes } from 'crypto'

// ─── GET /api/integrations/zoho/connect ──────────────────────────────────────

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 })
  }

  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({
    firm_id:  userRow!.firm_id,
    user_id:  user.id,
    nonce,
    provider: 'zoho_books',
  })).toString('base64url')

  await supabase.from('integrations').upsert({
    firm_id:        userRow!.firm_id,
    provider:       'zoho_books',
    status:         'pending_auth',
    webhook_secret: nonce,
  }, { onConflict: 'firm_id,provider' })

  try {
    return NextResponse.redirect(buildZohoAuthUrl(state))
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
