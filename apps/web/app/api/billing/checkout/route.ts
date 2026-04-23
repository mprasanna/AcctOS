import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  PLANS,
  getOrCreateStripeCustomer,
  createCheckoutSession,
} from '@/lib/billing/stripe'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role, email')
    .eq('id', user.id)
    .single()

  if (userRow?.role !== 'owner') {
    return NextResponse.json({ error: 'Only firm owners can manage billing', code: 'FORBIDDEN' }, { status: 403 })
  }

  const body = await req.json()
  const { plan, interval = 'monthly' } = body as { plan: string; interval: 'monthly' | 'annual' }

  const planConfig = PLANS[plan]
  if (!planConfig) {
    return NextResponse.json({ error: `Unknown plan: ${plan}`, code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const priceId = interval === 'annual' ? planConfig.priceAnnual : planConfig.priceMonthly
  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe Price ID for ${plan} ${interval} not configured`, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Get firm email for Stripe customer
  const { data: firm } = await supabase
    .from('firms')
    .select('name, primary_email')
    .eq('id', userRow.firm_id)
    .single()

  const { customerId, error: custError } = await getOrCreateStripeCustomer(
    userRow.firm_id,
    firm?.name ?? 'AcctOS Firm',
    firm?.primary_email ?? userRow.email ?? user.email ?? ''
  )

  if (custError) {
    return NextResponse.json({ error: custError, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Persist customer ID
  await supabase.from('stripe_subscriptions').upsert({
    firm_id:             userRow.firm_id,
    stripe_customer_id:  customerId,
    plan,
    status:              'incomplete',
    billing_interval:    interval,
  }, { onConflict: 'firm_id' })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.acct-os.com'

  const { url, error: sessionError } = await createCheckoutSession({
    customerId,
    priceId,
    firmId:     userRow.firm_id,
    successUrl: `${appUrl}/dashboard/settings?billing=success`,
    cancelUrl:  `${appUrl}/dashboard/settings?billing=cancelled`,
    trialDays:  14,   // 14-day free trial on first subscription
  })

  if (sessionError || !url) {
    return NextResponse.json({ error: sessionError ?? 'Failed to create checkout', code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ checkout_url: url }, { status: 201 })
}
