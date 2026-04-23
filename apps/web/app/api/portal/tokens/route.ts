import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

// ─── POST /api/portal/tokens ──────────────────────────────────────────────────
// Creates a secure portal token for a client.
// Returns the portal URL to share with the client.
//
// The token is single-use scoped to one client — no login required.
// Clients open the URL, see their pending documents and filing status,
// and upload directly.

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role, name')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const {
    client_id,
    label,
    expires_days = 30,
    can_upload   = true,
    can_view_status = true,
  } = body

  if (!client_id) {
    return NextResponse.json({ error: 'client_id is required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Verify client belongs to this firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', client_id)
    .single()

  if (!client) {
    return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Generate 48-byte (96-hex-char) token
  const token     = randomBytes(48).toString('hex')
  const expiresAt = new Date(Date.now() + expires_days * 86_400_000).toISOString()

  const { data: portalToken, error: insertError } = await supabase
    .from('client_portal_tokens')
    .insert({
      firm_id:         userRow.firm_id,
      client_id,
      token,
      label:           label ?? `${client.name} — Portal Access`,
      expires_at:      expiresAt,
      can_upload,
      can_view_status,
      created_by:      user.id,
    })
    .select('id, token, expires_at, label')
    .single()

  if (insertError || !portalToken) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create token', code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.acct-os.com'
  const portalUrl = `${appUrl}/portal/${portalToken.token}`

  return NextResponse.json({
    id:          portalToken.id,
    token:       portalToken.token,
    portal_url:  portalUrl,
    expires_at:  portalToken.expires_at,
    label:       portalToken.label,
    client_name: client.name,
    // Instructions for sending to client:
    suggested_email_body: `Hi ${client.name},\n\nPlease use the following secure link to view the documents needed for your upcoming tax filing and upload them directly:\n\n${portalUrl}\n\nThis link expires on ${new Date(expiresAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.\n\nIf you have any questions, please reply to this email.\n\n${userRow.name}`,
  }, { status: 201 })
}

// ─── GET /api/portal/tokens ───────────────────────────────────────────────────
// List portal tokens for the firm.

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('client_portal_tokens')
    .select(`
      id, label, expires_at, revoked_at, last_used_at, use_count,
      can_upload, can_view_status, created_at,
      client:clients!client_portal_tokens_client_id_fkey ( id, name )
    `)
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Add status field
  const now = new Date()
  const enriched = (data ?? []).map(t => ({
    ...t,
    // Never return the raw token in list view
    token: undefined,
    status: t.revoked_at
      ? 'revoked'
      : new Date(t.expires_at) < now
        ? 'expired'
        : 'active',
  }))

  return NextResponse.json({ data: enriched })
}
