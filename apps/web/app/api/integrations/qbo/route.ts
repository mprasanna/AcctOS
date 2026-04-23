import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildQboAuthUrl } from '@/lib/integrations/qbo'
import { randomBytes } from 'crypto'

// ─── GET /api/integrations/qbo/connect ───────────────────────────────────────
// Initiates the QBO OAuth flow.
// 1. Generate a CSRF state token and store in the session
// 2. Redirect to QBO auth URL

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
    return NextResponse.json(
      { error: 'Only owner or senior accountant can connect integrations', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  // Generate CSRF state: encode firm_id + random nonce
  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({
    firm_id:   userRow!.firm_id,
    user_id:   user.id,
    nonce,
    provider:  'qbo',
  })).toString('base64url')

  // Store nonce in DB for verification (expires in 10 minutes)
  await supabase.from('integrations').upsert({
    firm_id:   userRow!.firm_id,
    provider:  'qbo',
    status:    'pending_auth',
    // Store nonce in webhook_secret temporarily during OAuth dance
    webhook_secret: nonce,
  }, { onConflict: 'firm_id,provider' })

  try {
    const authUrl = buildQboAuthUrl(state)
    return NextResponse.redirect(authUrl)
  } catch (err: any) {
    return NextResponse.json({ error: err.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
