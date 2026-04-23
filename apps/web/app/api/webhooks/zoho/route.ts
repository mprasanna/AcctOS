import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { advanceStage1OnReconciliation } from '@/lib/integrations/helpers'

// ─── POST /api/webhooks/zoho ──────────────────────────────────────────────────
// Receives Zoho Books webhook notifications.
// Zoho fires webhooks when bank accounts are reconciled.
// Setup in Zoho Books → Settings → Webhooks

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const authToken = req.headers.get('x-zoho-webhook-token')

  // Verify Zoho webhook token (configured in Zoho webhook setup)
  const expectedToken = process.env.ZOHO_WEBHOOK_TOKEN
  if (expectedToken && authToken !== expectedToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()
  const results = { processed: 0, advanced: 0, skipped: 0 }

  // Zoho webhook format varies — normalize to our structure
  // Key fields: organization_id, event_type, data
  const orgId     = payload?.organization_id as string | undefined
  const eventType = payload?.event_type as string | undefined

  if (!orgId) {
    return NextResponse.json({ ok: true, message: 'No organization_id' })
  }

  const { data: integration } = await admin
    .from('integrations')
    .select('id, firm_id, sync_enabled')
    .eq('realm_id', orgId)
    .eq('provider', 'zoho_books')
    .eq('status', 'connected')
    .maybeSingle()

  if (!integration || !integration.sync_enabled) {
    return NextResponse.json({ ok: true, message: 'Integration not found or disabled' })
  }

  // Log raw event
  await admin.from('qbo_sync_log').insert({
    firm_id:         integration.firm_id,
    integration_id:  integration.id,
    event_type:      eventType ?? 'unknown',
    realm_id:        orgId,
    qbo_entity_type: payload?.entity_type,
    raw_payload:     payload,
  })

  // Process bank reconciliation events
  if (eventType?.toLowerCase().includes('reconcil') || eventType?.toLowerCase().includes('bank')) {
    results.processed++

    const { data: clientMappings } = await admin
      .from('client_integrations')
      .select('client_id, auto_advance_stage1')
      .eq('integration_id', integration.id)
      .eq('auto_advance_stage1', true)

    for (const mapping of (clientMappings ?? [])) {
      const { data: activeWorkflow } = await admin
        .from('workflows')
        .select('deadline')
        .eq('client_id', mapping.client_id)
        .in('computed_status', ['On Track', 'At Risk'])
        .order('deadline', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!activeWorkflow) continue

      const result = await advanceStage1OnReconciliation({
        firmId:        integration.firm_id,
        clientId:      mapping.client_id,
        periodEnd:     activeWorkflow.deadline,
        provider:      'zoho_books',
        integrationId: integration.id,
      })

      if (result.advanced) results.advanced++
      else results.skipped++
    }
  }

  return NextResponse.json({ ok: true, ...results })
}
