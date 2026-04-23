// ============================================================
// AcctOS — Stripe Billing Client
// Subscription management for firm plans.
//
// Plans (CAD pricing):
//   Starter: $49/month  — up to 50 clients, 2 users
//   Growth:  $149/month — up to 150 clients, 5 users
//   Scale:   $299/month — unlimited
//
// Phase 4 adds:
//   - Checkout session creation
//   - Stripe Customer Portal (self-serve plan changes)
//   - Webhook handler for subscription lifecycle
//   - Billing trigger on Stage 6 (filing complete)
// ============================================================

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

// ────────────────────────────────────────────────────────────
// PLAN CONFIG
// Stripe Price IDs — create these in Stripe dashboard and
// set the env vars below.
// ────────────────────────────────────────────────────────────

export interface PlanConfig {
  name:         string
  priceMonthly: string   // Stripe Price ID
  priceAnnual:  string   // Stripe Price ID (20% discount)
  amountCAD:    number   // cents
  maxClients:   number
  maxUsers:     number
  features:     string[]
}

export const PLANS: Record<string, PlanConfig> = {
  Starter: {
    name:         'Starter',
    priceMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    priceAnnual:  process.env.STRIPE_PRICE_STARTER_ANNUAL  ?? '',
    amountCAD:    4900,
    maxClients:   50,
    maxUsers:     2,
    features: [
      'Up to 50 clients',
      '2 team members',
      'GST/HST + T1 workflows',
      'Document reminders',
      'CRA deadline tracking',
    ],
  },
  Growth: {
    name:         'Growth',
    priceMonthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? '',
    priceAnnual:  process.env.STRIPE_PRICE_GROWTH_ANNUAL  ?? '',
    amountCAD:    14900,
    maxClients:   150,
    maxUsers:     5,
    features: [
      'Up to 150 clients',
      '5 team members',
      'All workflow types',
      'QBO + Zoho integration',
      'Client portal',
      'Intelligence dashboard',
    ],
  },
  Scale: {
    name:         'Scale',
    priceMonthly: process.env.STRIPE_PRICE_SCALE_MONTHLY ?? '',
    priceAnnual:  process.env.STRIPE_PRICE_SCALE_ANNUAL  ?? '',
    amountCAD:    29900,
    maxClients:   Infinity,
    maxUsers:     Infinity,
    features: [
      'Unlimited clients',
      'Unlimited team members',
      'All features',
      'Priority support',
      'Custom workflows',
      'Dedicated onboarding',
    ],
  },
}

// ────────────────────────────────────────────────────────────
// GET OR CREATE STRIPE CUSTOMER
// ────────────────────────────────────────────────────────────

export async function getOrCreateStripeCustomer(
  firmId:    string,
  firmName:  string,
  email:     string
): Promise<{ customerId: string; error: string | null }> {
  const stripe = getStripe()

  // Search for existing customer by metadata
  const existing = await stripe.customers.search({
    query: `metadata['firm_id']:'${firmId}'`,
    limit: 1,
  })

  if (existing.data.length > 0) {
    return { customerId: existing.data[0].id, error: null }
  }

  try {
    const customer = await stripe.customers.create({
      name:     firmName,
      email,
      currency: 'cad',
      metadata: { firm_id: firmId },
    })
    return { customerId: customer.id, error: null }
  } catch (err: any) {
    return { customerId: '', error: err.message }
  }
}

// ────────────────────────────────────────────────────────────
// CREATE CHECKOUT SESSION
// ────────────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  customerId:    string
  priceId:       string
  firmId:        string
  successUrl:    string
  cancelUrl:     string
  trialDays?:    number
}): Promise<{ url: string | null; error: string | null }> {
  const stripe = getStripe()

  try {
    const session = await stripe.checkout.sessions.create({
      customer:             params.customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      currency:             'cad',
      line_items: [{
        price:    params.priceId,
        quantity: 1,
      }],
      subscription_data: params.trialDays
        ? { trial_period_days: params.trialDays, metadata: { firm_id: params.firmId } }
        : { metadata: { firm_id: params.firmId } },
      success_url: params.successUrl,
      cancel_url:  params.cancelUrl,
      metadata:    { firm_id: params.firmId },
      allow_promotion_codes: true,
    })

    return { url: session.url, error: null }
  } catch (err: any) {
    return { url: null, error: err.message }
  }
}

// ────────────────────────────────────────────────────────────
// CREATE CUSTOMER PORTAL SESSION
// ────────────────────────────────────────────────────────────

export async function createPortalSession(params: {
  customerId: string
  returnUrl:  string
}): Promise<{ url: string | null; error: string | null }> {
  const stripe = getStripe()

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   params.customerId,
      return_url: params.returnUrl,
    })
    return { url: session.url, error: null }
  } catch (err: any) {
    return { url: null, error: err.message }
  }
}

// ────────────────────────────────────────────────────────────
// CREATE INVOICE FOR FILING COMPLETION
// Called when a workflow reaches Stage 6 (Confirmation).
// ────────────────────────────────────────────────────────────

export async function createFilingInvoice(params: {
  customerId:     string
  firmId:         string
  clientName:     string
  workflowLabel:  string
  period:         string
  amountCents:    number   // e.g. 19900 = $199 CAD filing fee
  dueDate?:       Date
}): Promise<{ invoiceId: string | null; error: string | null }> {
  const stripe = getStripe()

  try {
    // Create invoice item
    await stripe.invoiceItems.create({
      customer:    params.customerId,
      amount:      params.amountCents,
      currency:    'cad',
      description: `${params.workflowLabel} — ${params.clientName} · ${params.period}`,
      metadata:    { firm_id: params.firmId },
    })

    // Create and finalize the invoice
    const invoice = await stripe.invoices.create({
      customer:         params.customerId,
      collection_method: 'send_invoice',
      days_until_due:   params.dueDate
        ? Math.ceil((params.dueDate.getTime() - Date.now()) / 86_400_000)
        : 14,
      metadata: { firm_id: params.firmId },
    })

    await stripe.invoices.finalizeInvoice(invoice.id)
    await stripe.invoices.sendInvoice(invoice.id)

    return { invoiceId: invoice.id, error: null }
  } catch (err: any) {
    return { invoiceId: null, error: err.message }
  }
}
