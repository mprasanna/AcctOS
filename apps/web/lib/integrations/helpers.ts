// ============================================================
// AcctOS — Integration Helpers
// Shared logic used by both QBO and Zoho integrations:
//   - ensureValidToken()   — refresh if expiring in < 5 minutes
//   - advanceStage1()      — auto-complete Stage 1 on reconciliation
//   - getIntegrationToken() — fetch + decrypt tokens from DB
// ============================================================

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { refreshQboToken }   from './qbo'
import { refreshZohoToken }  from './zoho'

// ────────────────────────────────────────────────────────────
// TOKEN REFRESH GUARD
// Called before every API request. If token expires within 5
// minutes, refreshes and persists the new token.
// Returns the current valid access token.
// ────────────────────────────────────────────────────────────

export async function ensureValidToken(integrationId: string): Promise<{
  accessToken: string | null
  error:       string | null
}> {
  const admin = createSupabaseAdminClient()

  const { data: integration, error: fetchError } = await admin
    .from('integrations')
    .select('id, provider, access_token, refresh_token, token_expires_at, firm_id')
    .eq('id', integrationId)
    .single()

  if (fetchError || !integration) {
    return { accessToken: null, error: fetchError?.message ?? 'Integration not found' }
  }

  const expiresAt   = integration.token_expires_at ? new Date(integration.token_expires_at) : null
  const now         = new Date()
  const fiveMinutes = 5 * 60 * 1000

  // Token is still valid with margin
  if (expiresAt && expiresAt.getTime() - now.getTime() > fiveMinutes) {
    return { accessToken: integration.access_token, error: null }
  }

  // Needs refresh
  if (!integration.refresh_token) {
    return { accessToken: null, error: 'No refresh token — reconnect required' }
  }

  let newToken: { access_token: string; refresh_token: string; expires_in: number } | null = null
  let refreshError: string | null = null

  if (integration.provider === 'qbo') {
    const result = await refreshQboToken(integration.refresh_token)
    newToken     = result.data
    refreshError = result.error
  } else if (integration.provider === 'zoho_books') {
    const result = await refreshZohoToken(integration.refresh_token)
    newToken     = result.data
    refreshError = result.error
  }

  if (refreshError || !newToken) {
    // Mark integration as error state
    await admin
      .from('integrations')
      .update({ status: 'error', last_sync_error: refreshError ?? 'Token refresh failed' })
      .eq('id', integrationId)
    return { accessToken: null, error: refreshError ?? 'Token refresh failed' }
  }

  // Persist new tokens
  const newExpiry = new Date(Date.now() + newToken.expires_in * 1000).toISOString()
  await admin
    .from('integrations')
    .update({
      access_token:     newToken.access_token,
      refresh_token:    newToken.refresh_token ?? integration.refresh_token,
      token_expires_at: newExpiry,
      status:           'connected',
      last_sync_error:  null,
    })
    .eq('id', integrationId)

  return { accessToken: newToken.access_token, error: null }
}

// ────────────────────────────────────────────────────────────
// AUTO-ADVANCE STAGE 1
// Called when a reconciliation event is detected.
// Finds the matching workflow and advances Stage 1 if pending.
// ────────────────────────────────────────────────────────────

export async function advanceStage1OnReconciliation(params: {
  firmId:      string
  clientId:    string
  periodEnd:   string   // ISO date "2025-10-31"
  provider:    string
  integrationId: string
}): Promise<{ advanced: boolean; workflowId: string | null; error: string | null }> {
  const admin = createSupabaseAdminClient()

  // Find the active workflow for this client whose cycle covers the period
  const { data: workflow } = await admin
    .from('workflows')
    .select('id, label, cur_stage, computed_status')
    .eq('client_id', params.clientId)
    .eq('firm_id', params.firmId)
    .in('computed_status', ['On Track', 'At Risk'])
    .lte('cycle_start', params.periodEnd)
    .gte('deadline', params.periodEnd)
    .order('deadline', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!workflow) {
    return { advanced: false, workflowId: null, error: 'No matching active workflow found for this period' }
  }

  if (workflow.cur_stage > 1) {
    return { advanced: false, workflowId: workflow.id, error: 'Stage 1 already complete' }
  }

  // Check Stage 1 status directly
  const { data: stage1 } = await admin
    .from('stages')
    .select('id, status')
    .eq('workflow_id', workflow.id)
    .eq('n', 1)
    .single()

  if (!stage1 || stage1.status === 'complete') {
    return { advanced: false, workflowId: workflow.id, error: 'Stage 1 already complete or not found' }
  }

  // Advance Stage 1 to complete
  await admin
    .from('stages')
    .update({
      status:       'complete',
      completed_at: new Date().toISOString(),
      note:         `Auto-completed via ${params.provider} reconciliation — ${new Date().toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`,
    })
    .eq('id', stage1.id)

  // Set Stage 2 to in_progress
  await admin
    .from('stages')
    .update({ status: 'in_progress' })
    .eq('workflow_id', workflow.id)
    .eq('n', 2)
    .eq('status', 'pending')

  // Advance workflow cur_stage
  await admin
    .from('workflows')
    .update({ cur_stage: 2 })
    .eq('id', workflow.id)
    .eq('cur_stage', 1)

  // Log to auto_advance_log
  await admin.from('auto_advance_log').insert({
    firm_id:         params.firmId,
    workflow_id:     workflow.id,
    stage_n:         1,
    trigger_type:    'bookkeeping_linked',
    trigger_detail:  `Reconciliation detected via ${params.provider} integration`,
    previous_status: 'pending',
    new_status:      'complete',
  })

  // Log event
  await admin.from('events').insert({
    client_id:   params.clientId,
    firm_id:     params.firmId,
    workflow_id: workflow.id,
    who:         'System',
    action:      `Stage 1 auto-completed via ${params.provider}`,
    detail:      `Bookkeeping reconciliation detected for period ending ${params.periodEnd}`,
  })

  // Log to qbo_sync_log
  await admin.from('qbo_sync_log').insert({
    firm_id:        params.firmId,
    integration_id: params.integrationId,
    client_id:      params.clientId,
    workflow_id:    workflow.id,
    event_type:     'reconciliation_complete',
    period_end:     params.periodEnd,
    stage_advanced: true,
  })

  return { advanced: true, workflowId: workflow.id, error: null }
}
