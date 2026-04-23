import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

type RouteParams = { params: { token: string } }

// ─── GET /api/portal/[token] ──────────────────────────────────────────────────
// Public endpoint — no Supabase Auth required.
// The token itself is the authentication mechanism.
//
// Returns:
//   - Client name and firm name (for display)
//   - Pending documents to upload
//   - Current workflow status (if can_view_status)
//   - Upload URL if can_upload

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const admin = createSupabaseAdminClient()

  // Validate token
  const { data: portalToken, error: tokenError } = await admin
    .from('client_portal_tokens')
    .select(`
      id, client_id, firm_id, expires_at, revoked_at,
      can_upload, can_view_status,
      client:clients!client_portal_tokens_client_id_fkey (
        id, name, type
      )
    `)
    .eq('token', params.token)
    .single()

  if (tokenError || !portalToken) {
    return NextResponse.json({ error: 'Invalid or expired portal link', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Check revocation
  if (portalToken.revoked_at) {
    return NextResponse.json({ error: 'This portal link has been revoked', code: 'FORBIDDEN' }, { status: 403 })
  }

  // Check expiry
  if (new Date(portalToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This portal link has expired. Please contact your accountant for a new link.', code: 'EXPIRED' }, { status: 410 })
  }

  // Update last_used_at and use_count
  await admin
    .from('client_portal_tokens')
    .update({ last_used_at: new Date().toISOString(), use_count: admin.rpc('increment', {}) as any })
    .eq('id', portalToken.id)
    .then(() => null)  // fire-and-forget

  // Actually increment use_count with raw SQL
  await admin.rpc('increment_portal_token_use', { token_id: portalToken.id }).catch(() => null)

  // Get firm name
  const { data: firm } = await admin
    .from('firms')
    .select('name')
    .eq('id', portalToken.firm_id)
    .single()

  // Get pending documents across all active workflows for this client
  const { data: workflows } = await admin
    .from('workflows')
    .select(`
      id, label, period, deadline, cur_stage, computed_status,
      documents ( id, name, status, reminder_count )
    `)
    .eq('client_id', portalToken.client_id)
    .in('computed_status', ['On Track', 'At Risk', 'Overdue'])
    .order('deadline', { ascending: true })

  const activeWorkflows = (workflows ?? []).map(wf => ({
    id:              wf.id,
    label:           wf.label,
    period:          wf.period,
    deadline:        wf.deadline,
    cur_stage:       wf.cur_stage,
    status:          wf.computed_status,
    pending_documents: (wf.documents ?? [])
      .filter((d: any) => d.status === 'pending')
      .map((d: any) => ({ id: d.id, name: d.name })),
    all_documents_received: (wf.documents ?? []).every((d: any) => d.status === 'received'),
  }))

  const totalPendingDocs = activeWorkflows.reduce((sum, wf) => sum + wf.pending_documents.length, 0)

  return NextResponse.json({
    client: {
      id:   portalToken.client_id,
      name: (portalToken.client as any)?.name ?? 'Client',
      type: (portalToken.client as any)?.type,
    },
    firm_name:      firm?.name ?? 'Your Accounting Firm',
    can_upload:     portalToken.can_upload,
    can_view_status: portalToken.can_view_status,
    workflows:      portalToken.can_view_status ? activeWorkflows : [],
    pending_documents_count: totalPendingDocs,
    expires_at:     portalToken.expires_at,
  })
}
