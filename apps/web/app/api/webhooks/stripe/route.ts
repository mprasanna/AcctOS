import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { getStripe, PLANS, createFilingInvoice } from '@/lib/billing/stripe'
import type Stripe from 'stripe'

// ─── POST /api/webhooks/stripe ────────────────────────────────────────────────
// Handles Stripe subscription lifecycle events + billing triggers.
// Idempotent: all events are deduplicated by stripe_event_id in billing_events.
//
// Events handled:
//   checkout.session.completed      — subscription activated
//   customer.subscription.updated   — plan change, renewal, past_due
//   customer.subscription.deleted   — cancellation
//   invoice.payment_succeeded       — renewal success, update period
//   invoice.payment_failed          — payment failure, flag firm
//   billing_portal.session.created  — portal access (informational)
//
// Also: filing-complete billing events (from trg_billing_on_stage6) are
// processed daily by a separate cron job (Phase 5).

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const sigHeader = req.headers.get('stripe-signature')
  const secret    = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret || !sigHeader) {
    return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, sigHeader, secret)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 })
  }

  const admin = createSupabaseAdminClient()

  // Idempotency check
  const { data: existing } = await admin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Extract firm_id from metadata or customer lookup
  async function firmIdFromCustomer(customerId: string): Promise<string | null> {
    const { data } = await admin
      .from('stripe_subscriptions')
      .select('firm_id')
      .eq('stripe_customer_id', customerId)
      .single()
    return data?.firm_id ?? null
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const firmId = session.metadata?.firm_id as string | undefined
        if (!firmId) break

        const sub = await getStripe().subscriptions.retrieve(session.subscription as string)
        const priceId = sub.items.data[0]?.price?.id

        // Map price ID back to plan name
        const planName = Object.entries(PLANS).find(([, p]) =>
          p.priceMonthly === priceId || p.priceAnnual === priceId
        )?.[0] ?? 'Starter'

        await admin.from('stripe_subscriptions').upsert({
          firm_id:             firmId,
          stripe_customer_id:  session.customer as string,
          stripe_sub_id:       session.subscription as string,
          plan:                planName,
          status:              sub.status as any,
          billing_interval:    sub.items.data[0]?.plan?.interval === 'year' ? 'annual' : 'monthly',
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:  new Date(sub.current_period_end * 1000).toISOString(),
          trial_end:           sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        }, { onConflict: 'firm_id' })

        // Update firm plan
        await admin.from('firms').update({ plan: planName as any }).eq('id', firmId)
        break
      }

      case 'customer.subscription.updated': {
        const sub    = event.data.object as Stripe.Subscription
        const firmId = await firmIdFromCustomer(sub.customer as string)
        if (!firmId) break

        const priceId  = sub.items.data[0]?.price?.id
        const planName = Object.entries(PLANS).find(([, p]) =>
          p.priceMonthly === priceId || p.priceAnnual === priceId
        )?.[0] ?? 'Starter'

        await admin.from('stripe_subscriptions').update({
          plan:                planName,
          status:              sub.status as any,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end:  new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at:           sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
          canceled_at:         sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        }).eq('firm_id', firmId)

        await admin.from('firms').update({ plan: planName as any }).eq('id', firmId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object as Stripe.Subscription
        const firmId = await firmIdFromCustomer(sub.customer as string)
        if (!firmId) break

        await admin.from('stripe_subscriptions').update({
          status:     'canceled',
          canceled_at: new Date().toISOString(),
        }).eq('firm_id', firmId)

        // Downgrade to Starter on cancellation
        await admin.from('firms').update({ plan: 'Starter' }).eq('id', firmId)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const firmId  = await firmIdFromCustomer(invoice.customer as string)
        if (!firmId) break

        await admin.from('stripe_subscriptions').update({
          status: 'active',
        }).eq('firm_id', firmId)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const firmId  = await firmIdFromCustomer(invoice.customer as string)
        if (!firmId) break

        await admin.from('stripe_subscriptions').update({
          status: 'past_due',
        }).eq('firm_id', firmId)
        break
      }
    }

    // Log to billing_events (idempotency record)
    const obj = event.data.object as any
    await admin.from('billing_events').insert({
      firm_id:         obj?.metadata?.firm_id ?? await firmIdFromCustomer(obj?.customer) ?? '',
      event_type:      event.type,
      stripe_event_id: event.id,
      amount_cents:    obj?.amount_total ?? obj?.amount_paid ?? null,
      description:     `Stripe: ${event.type}`,
      metadata:        { stripe_event_id: event.id },
    })

  } catch (err: any) {
    console.error('[stripe-webhook] Error processing event:', err)
    // Still return 200 — we don't want Stripe to retry
    return NextResponse.json({ ok: false, error: err.message })
  }

  return NextResponse.json({ ok: true, type: event.type })
}
