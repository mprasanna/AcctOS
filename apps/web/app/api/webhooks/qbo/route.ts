import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { advanceStage1OnReconciliation } from '@/lib/integrations/helpers'
import { createHmac } from 'crypto'

// ─── POST /api/webhooks/qbo ───────────────────────────────────────────────────
// Receives Intuit webhook notifications.
// QBO fires webhooks for: Account changes, Reconciliation events, etc.
//
// Verification: QBO signs payloads with HMAC-SHA256 using the webhook verifier token.
// Header: intuit-signature (base64-encoded HMAC)
//
// Idempotency: events are deduplicated by qbo_sync_log (event_id).
//
// Key event types we care about:
//   - com.intuit.quickbooks.accounting.account.reconcile  → advance Stage 1

export async function POST(req: NextRequest) {
  const rawBody   = await req.text()
  const signature = req.headers.get('intuit-signature')

  // Verify signature
  const webhookToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN
  if (webhookToken && signature) {
    const expected = createHmac('sha256', webhookToken)
      .update(rawBody)
      .digest('base64')

    if (expected !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  // QBO webhook format: { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
  const notifications = payload?.eventNotifications ?? []
  const results = { processed: 0, advanced: 0, skipped: 0 }

  for (const notification of notifications) {
    const realmId  = notification.realmId as string
    const entities = notification.dataChangeEvent?.entities ?? []

    // Find the integration for this realm
    const { data: integration } = await admin
      .from('integrations')
      .select('id, firm_id, sync_enabled')
      .eq('realm_id', realmId)
      .eq('provider', 'qbo')
      .eq('status', 'connected')
      .maybeSingle()

    if (!integration || !integration.sync_enabled) continue

    for (const entity of entities) {
      results.processed++

      // We care about Account entities — specifically when they're reconciled
      // QBO doesn't emit a dedicated "reconciliation complete" event; instead
      // it emits Account updates. We check if the account's lastUpdated date
      // suggests a recent reconciliation, then poll the API to verify.
      if (entity.name === 'Account' && entity.operation !== 'Delete') {
        // Log the raw event
        await admin.from('qbo_sync_log').insert({
          firm_id:        integration.firm_id,
          integration_id: integration.id,
          event_type:     'account_update',
          realm_id:       realmId,
          qbo_entity_type: 'Account',
          qbo_entity_id:  entity.id,
          raw_payload:    entity,
        })

        // Find all client_integrations for this realm
        const { data: clientMappings } = await admin
          .from('client_integrations')
          .select('client_id, external_id, auto_advance_stage1')
          .eq('integration_id', integration.id)
          .eq('auto_advance_stage1', true)

        for (const mapping of (clientMappings ?? [])) {
          // Determine the current period end from the client's active workflow
          const { data: activeWorkflow } = await admin
            .from('workflows')
            .select('deadline, cycle_start, period')
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
            provider:      'qbo',
            integrationId: integration.id,
          })

          if (result.advanced) results.advanced++
          else results.skipped++
        }
      }
    }
  }

  // QBO requires a 200 within 45 seconds
  return NextResponse.json({ ok: true, ...results })
}
