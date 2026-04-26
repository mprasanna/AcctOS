// app/api/stripe/connect/onboard/route.ts
// POST /api/stripe/connect/onboard
// Creates or retrieves a Stripe Connect account for this firm and returns the onboarding URL.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('firm_id, role').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only firm owners can connect Stripe
  if (userRow.role !== 'owner') {
    return NextResponse.json({ error: 'Only firm owners can connect a Stripe account' }, { status: 403 })
  }

  const { data: firm } = await supabase
    .from('firms')
    .select('id, name, stripe_connect_account_id')
    .eq('id', userRow.firm_id)
    .single()

  if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://acct-os.vercel.app'

  let accountId = firm.stripe_connect_account_id

  // Create a new Connect account if one doesn't exist
  if (!accountId) {
    const account = await stripe.accounts.create({
      type:    'express',
      country: 'CA',
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
      business_profile: {
        name: firm.name,
        url:  appUrl,
      },
      metadata: {
        acct_os_firm_id: firm.id,
      },
    })

    accountId = account.id

    // Store the account ID on the firm
    const admin = createSupabaseAdminClient()
    await admin
      .from('firms')
      .update({ stripe_connect_account_id: accountId })
      .eq('id', firm.id)
  }

  // Create an account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${appUrl}/dashboard?stripe_connect=refresh`,
    return_url:  `${appUrl}/dashboard?stripe_connect=success`,
    type:        'account_onboarding',
  })

  return NextResponse.json({ url: accountLink.url })
}
