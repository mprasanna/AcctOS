// app/api/portal/invoices/route.ts
// GET /api/portal/invoices
// Authenticated portal user — returns all invoices for their client.

import { NextRequest } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  // client_invoices table — created when firm sends invoice via Stripe
  const { data: invoices, error: invErr } = await supabase
    .from('client_invoices')
    .select(`
      id,
      stripe_invoice_id,
      workflow_id,
      amount_cents,
      status,
      due_date,
      stripe_hosted_url,
      created_at,
      workflows ( type, period )
    `)
    .eq('client_id', portalUser!.client_id)
    .eq('firm_id', portalUser!.firm_id)
    .order('created_at', { ascending: false })

  if (invErr) return err('Failed to load invoices', 500)

  const formatted = (invoices ?? []).map(inv => ({
    id:                inv.id,
    stripe_invoice_id: inv.stripe_invoice_id,
    workflow_id:       inv.workflow_id,
    workflow_type:     (inv.workflows as any)?.type ?? null,
    period_label:      (inv.workflows as any)?.period ?? null,
    amount_cad:        inv.amount_cents,   // stored in cents
    status:            inv.status,         // open | paid | void
    due_date:          inv.due_date,
    stripe_hosted_url: inv.stripe_hosted_url,
    created_at:        inv.created_at,
  }))

  return ok({ invoices: formatted })
}
