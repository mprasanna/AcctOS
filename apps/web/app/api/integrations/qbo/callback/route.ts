import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { exchangeQboCode, getQboCompanyInfo } from '@/lib/integrations/qbo'

// ─── GET /api/integrations/qbo/callback ──────────────────────────────────────
// QBO redirects here after user authorises AcctOS.
// 1. Verify CSRF state
// 2. Exchange code for tokens
// 3. Fetch company info
// 4. Persist integration record
// 5. Redirect to settings page

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { searchParams } = new URL(req.url)

  const code    = searchParams.get('code')
  const state   = searchParams.get('state')
  const realmId = searchParams.get('realmId')  // QBO company ID
  const error   = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // User denied access
  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=${encodeURIComponent(error)}`)
  }

  if (!code || !state || !realmId) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=missing_params`)
  }

  // Decode and verify state
  let stateData: { firm_id: string; user_id: string; nonce: string; provider: string }
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=invalid_state`)
  }

  if (stateData.provider !== 'qbo') {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=wrong_provider`)
  }

  // Verify the nonce matches what we stored
  const { data: integration } = await supabase
    .from('integrations')
    .select('webhook_secret')
    .eq('firm_id', stateData.firm_id)
    .eq('provider', 'qbo')
    .single()

  if (!integration || integration.webhook_secret !== stateData.nonce) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=csrf_mismatch`)
  }

  // Exchange code for tokens
  const { data: tokens, error: tokenError } = await exchangeQboCode(code, realmId)
  if (tokenError || !tokens) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=${encodeURIComponent(tokenError ?? 'token_exchange_failed')}`)
  }

  // Fetch company name from QBO
  const { data: companyInfo } = await getQboCompanyInfo({
    accessToken: tokens.access_token,
    realmId,
  })

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Persist the integration
  const { error: upsertError } = await supabase
    .from('integrations')
    .update({
      status:           'connected',
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token,
      token_expires_at: expiresAt,
      realm_id:         realmId,
      company_name:     companyInfo?.CompanyName ?? 'Unknown Company',
      webhook_secret:   null,   // clear the CSRF nonce
      last_synced_at:   new Date().toISOString(),
      last_sync_error:  null,
      connected_by:     stateData.user_id,
    })
    .eq('firm_id', stateData.firm_id)
    .eq('provider', 'qbo')

  if (upsertError) {
    return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&error=save_failed`)
  }

  // Log event (no specific client — firm-level)
  await supabase.from('events').insert({
    client_id:   '00000000-0000-0000-0000-000000000000',  // sentinel for firm-level events
    firm_id:     stateData.firm_id,
    who:         'System',
    action:      'QuickBooks Online connected',
    detail:      `Company: ${companyInfo?.CompanyName ?? realmId}`,
  }).maybeSingle().catch(() => null)  // best-effort, non-critical

  return NextResponse.redirect(`${appUrl}/dashboard/settings?integration=qbo&status=connected`)
}
