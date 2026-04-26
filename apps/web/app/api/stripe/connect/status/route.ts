// app/api/stripe/connect/status/route.ts
// GET /api/stripe/connect/status
// Returns whether the firm has a connected Stripe account for client invoicing.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('firm_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if firm has a Stripe Connect account ID stored
  const { data: firm } = await supabase
    .from('firms')
    .select('stripe_connect_account_id')
    .eq('id', userRow.firm_id)
    .single()

  if (!firm?.stripe_connect_account_id) {
    return NextResponse.json({ connected: false })
  }

  // Verify with Stripe that the account is actually active
  try {
    const account = await stripe.accounts.retrieve(firm.stripe_connect_account_id)
    const connected = account.charges_enabled && account.payouts_enabled
    return NextResponse.json({
      connected,
      account_id:      account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    })
  } catch (e: any) {
    // Account may have been deleted from Stripe side
    return NextResponse.json({ connected: false, error: e.message })
  }
}
