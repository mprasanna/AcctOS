import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPortalSession } from '@/lib/billing/stripe'

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'Only firm owners can access billing portal', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { data: sub } = await supabase
    .from('stripe_subscriptions')
    .select('stripe_customer_id')
    .eq('firm_id', userRow.firm_id)
    .single()

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No active subscription. Complete checkout first.', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.acct-os.com'
  const { url, error } = await createPortalSession({
    customerId: sub.stripe_customer_id,
    returnUrl:  `${appUrl}/dashboard/settings`,
  })

  if (error || !url) {
    return NextResponse.json({ error: error ?? 'Failed to create portal session', code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ portal_url: url })
}
