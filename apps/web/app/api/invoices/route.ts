import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getOrCreateStripeCustomer, createFilingInvoice } from '@/lib/billing/stripe'

// ─── POST /api/invoices ───────────────────────────────────────────────────────
// Creates and sends a Stripe invoice for a completed workflow.
// Called automatically from the stage 6 completion handler when
// firm_settings.invoice_on_completion = true and billing_rates has an entry
// for this workflow type.
//
// Can also be called manually by Owner / Senior CPA.

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('firm_id, role, name').eq('id', user.id).single()

  if (!['owner', 'senior_accountant'].includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Only Owner or Senior CPA can create invoices', code: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json()
  const { workflow_id, amount_cents, description, override_amount } = body

  if (!workflow_id) return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })

  // Load workflow + client + firm
  const { data: wf } = await supabase
    .from('workflows')
    .select(`
      id, type, label, period,
      client:clients!workflows_client_id_fkey ( id, name, client_email )
    `)
    .eq('id', workflow_id)
    .single()

  if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })

  const { data: firm } = await supabase
    .from('firms').select('id, name, stripe_customer_id').eq('id', userRow.firm_id).single()

  // Load billing rates from firm_settings
  const { data: settings } = await supabase
    .from('firm_settings')
    .select('billing_rates')
    .eq('firm_id', userRow.firm_id)
    .single()

  const billingRates = (settings?.billing_rates ?? {}) as Record<string, number>

  // Resolve amount: manual override > billing_rates entry > error
  const resolvedAmount = override_amount
    ? Number(override_amount)
    : amount_cents
      ? Number(amount_cents)
      : billingRates[wf.type ?? ''] ?? null

  if (!resolvedAmount || resolvedAmount <= 0) {
    return NextResponse.json({
      error: `No billing rate set for ${wf.type}. Go to Settings → Billing → Set rates, or provide an override amount.`,
      code: 'NO_BILLING_RATE',
    }, { status: 422 })
  }

  // Get or create Stripe customer for this firm
  const stripeCustomerId = await getOrCreateStripeCustomer({
    firmId:     userRow.firm_id,
    firmName:   firm?.name ?? 'Accounting Firm',
    email:      (wf.client as any)?.client_email ?? undefined,
  })

  const invoiceDescription = description ?? `${wf.type} — ${wf.label} — ${(wf.client as any)?.name}`

  const { invoiceId, error: invoiceError } = await createFilingInvoice({
    stripeCustomerId,
    amountCents:  resolvedAmount,
    currency:     'cad',
    description:  invoiceDescription,
    metadata: {
      firm_id:     userRow.firm_id,
      workflow_id: wf.id,
      client_id:   (wf.client as any)?.id,
      workflow_type: wf.type ?? '',
    },
  })

  if (invoiceError) return NextResponse.json({ error: invoiceError, code: 'STRIPE_ERROR' }, { status: 500 })

  // Log billing event
  await supabase.from('billing_events').insert({
    firm_id:        userRow.firm_id,
    workflow_id:    wf.id,
    client_id:      (wf.client as any)?.id,
    event_type:     'filing_invoice_created',
    amount_cents:   resolvedAmount,
    currency:       'cad',
    description:    invoiceDescription,
    metadata: { invoice_id: invoiceId, created_by: userRow.name },
  })

  return NextResponse.json({ invoiceId, amount_cents: resolvedAmount, description: invoiceDescription }, { status: 201 })
}

// ─── GET /api/invoices?workflow_id= ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase.from('users').select('firm_id').eq('id', user.id).single()
  const { searchParams } = new URL(req.url)
  const workflowId = searchParams.get('workflow_id')

  let query = supabase
    .from('billing_events')
    .select('*')
    .eq('firm_id', userRow!.firm_id)
    .order('created_at', { ascending: false })

  if (workflowId) query = query.eq('workflow_id', workflowId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
