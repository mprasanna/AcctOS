import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { exchangeZohoCode, getZohoOrgInfo } from '@/lib/integrations/zoho'

// ─── GET /api/integrations/zoho/callback ─────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { searchParams } = new URL(req.url)

  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&error=missing_params`)
  }

  let stateData: { firm_id: string; user_id: string; nonce: string; provider: string }
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&error=invalid_state`)
  }

  // Verify nonce
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, webhook_secret')
    .eq('firm_id', stateData.firm_id)
    .eq('provider', 'zoho_books')
    .single()

  if (!integration || integration.webhook_secret !== stateData.nonce) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&error=csrf_mismatch`)
  }

  const { data: tokens, error: tokenError } = await exchangeZohoCode(code)
  if (tokenError || !tokens) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&error=${encodeURIComponent(tokenError ?? 'token_exchange_failed')}`)
  }

  // Zoho org info — use a dummy orgId first; real one comes from the user's profile
  const { data: orgInfo } = await getZohoOrgInfo({
    accessToken: tokens.access_token,
    orgId:       '',  // empty triggers the /organizations endpoint without filter
  })

  const orgId   = orgInfo?.org_id ?? ''
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await supabase
    .from('integrations')
    .update({
      status:           'connected',
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token,
      token_expires_at: expiresAt,
      realm_id:         orgId,
      company_name:     orgInfo?.name ?? 'Zoho Books',
      webhook_secret:   null,
      last_synced_at:   new Date().toISOString(),
      last_sync_error:  null,
      connected_by:     stateData.user_id,
    })
    .eq('id', integration.id)

  return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=zoho&status=connected`)
}
