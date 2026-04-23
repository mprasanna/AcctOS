import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  PLANS,
  getOrCreateStripeCustomer,
  createCheckoutSession,
} from '@/lib/billing/stripe'

// ─── GET /api/billing ─────────────────────────────────────────────────────────
// Returns current subscription, plan limits, and usage counts.

export async function GET(_req: NextRequest) {
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

  if (userRow?.role !== 'owner') {
    return NextResponse.json({ error: 'Only firm owners can view billing', code: 'FORBIDDEN' }, { status: 403 })
  }

  // Get subscription, firm, and usage in parallel
  const [subResult, firmResult, usageResult] = await Promise.all([
    supabase
      .from('stripe_subscriptions')
      .select('*')
      .eq('firm_id', userRow.firm_id)
      .maybeSingle(),
    supabase
      .from('firms')
      .select('name, plan, primary_email')
      .eq('id', userRow.firm_id)
      .single(),
    supabase
      .from('clients')
      .select('id', { count: 'exact' })
      .eq('firm_id', userRow.firm_id),
  ])

  const subscription = subResult.data
  const firm         = firmResult.data
  const clientCount  = usageResult.count ?? 0

  const currentPlan = PLANS[firm?.plan ?? 'Starter'] ?? PLANS.Starter

  return NextResponse.json({
    firm: { name: firm?.name, email: firm?.primary_email },
    plan: {
      name:        firm?.plan ?? 'Starter',
      max_clients: currentPlan.maxClients,
      max_users:   currentPlan.maxUsers,
      features:    currentPlan.features,
    },
    subscription: subscription ? {
      status:               subscription.status,
      stripe_sub_id:        subscription.stripe_sub_id,
      billing_interval:     subscription.billing_interval,
      current_period_end:   subscription.current_period_end,
      trial_end:            subscription.trial_end,
      cancel_at:            subscription.cancel_at,
    } : null,
    usage: {
      clients: clientCount,
      clients_limit:  currentPlan.maxClients,
      clients_pct:    currentPlan.maxClients === Infinity ? 0 : Math.round((clientCount / currentPlan.maxClients) * 100),
    },
    available_plans: Object.values(PLANS).map(p => ({
      name:         p.name,
      amount_cad:   p.amountCAD,
      max_clients:  p.maxClients,
      max_users:    p.maxUsers,
      features:     p.features,
    })),
  })
}
