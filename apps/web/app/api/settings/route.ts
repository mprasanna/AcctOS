import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'

// ─── GET /api/settings ────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
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

  const [settingsResult, firmResult, usersResult] = await Promise.all([
    supabase
      .from('firm_settings')
      .select('*')
      .eq('firm_id', userRow.firm_id)
      .single(),
    supabase
      .from('firms')
      .select('id, name, plan, primary_email, province')
      .eq('id', userRow.firm_id)
      .single(),
    supabase
      .from('users')
      .select('id, name, initials, email, role')
      .eq('firm_id', userRow.firm_id)
      .order('role'),
  ])

  const s = settingsResult.data

  // ── PORTAL ADDITION — include portal fields in response ──
  const portal = s ? {
    logo_url:       s.portal_logo_url ?? null,
    tagline:        s.portal_tagline ?? 'Your secure accounting portal',
    esign_provider: s.portal_esign_provider ?? 'none',
    // Never return raw keys — return masked indicator only
    esign_key:      s.portal_esign_key    ? '••••••••' : '',
    esign_secret:   s.portal_esign_secret ? '••••••••' : '',
  } : null

  return NextResponse.json({
    firm:     firmResult.data,
    settings: s,
    team:     usersResult.data ?? [],
    portal,   // ── PORTAL ADDITION ──
  })
}

// ─── PATCH /api/settings ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
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

  if (!userRow || userRow.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only firm owners can update settings', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json()

  const firmFields = ['name', 'primary_email', 'province']
  const settingsFields = [
    'auto_create_workflows',
    'doc_reminder_enabled',
    'escalate_on_reminder2',
    'deadline_alert_days',
    'overdue_flag_enabled',
    'notify_owner_on_escalation',
    'notify_assigned_on_advance',
    'dual_review_threshold',
    'require_upload_to_receive',
    'doc_reminder_send_to_client',
    'invoice_on_completion',
    'billing_rates',
  ]

  const firmPatch: Record<string, unknown>     = {}
  const settingsPatch: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(body)) {
    if (firmFields.includes(k))     firmPatch[k]     = v
    if (settingsFields.includes(k)) settingsPatch[k] = v
  }

  // ── PORTAL ADDITION — handle portal settings block ──
  if (body.portal) {
    const p = body.portal
    if (p.tagline !== undefined)        settingsPatch.portal_tagline        = p.tagline
    if (p.esign_provider !== undefined) settingsPatch.portal_esign_provider = p.esign_provider
    // Only update keys if they are real values (not the masked '••••••••')
    if (p.esign_key    && !String(p.esign_key).includes('•'))    settingsPatch.portal_esign_key    = p.esign_key
    if (p.esign_secret && !String(p.esign_secret).includes('•')) settingsPatch.portal_esign_secret = p.esign_secret
    // Clear keys when provider set to none
    if (p.esign_provider === 'none') {
      settingsPatch.portal_esign_key    = null
      settingsPatch.portal_esign_secret = null
    }
  }

  const updates: Promise<any>[] = []

  if (Object.keys(firmPatch).length > 0) {
    updates.push(supabase.from('firms').update(firmPatch).eq('id', userRow.firm_id))
  }

  if (Object.keys(settingsPatch).length > 0) {
    updates.push(supabase.from('firm_settings').update(settingsPatch).eq('firm_id', userRow.firm_id))
  }

  await Promise.all(updates)

  const { data: updatedSettings } = await supabase
    .from('firm_settings').select('*').eq('firm_id', userRow.firm_id).single()

  const { data: updatedFirm } = await supabase
    .from('firms').select('id, name, plan, primary_email, province').eq('id', userRow.firm_id).single()

  return NextResponse.json({ firm: updatedFirm, settings: updatedSettings })
}
