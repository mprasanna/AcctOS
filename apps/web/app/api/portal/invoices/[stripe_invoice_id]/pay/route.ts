// app/api/portal/invoices/[stripe_invoice_id]/pay/route.ts
// POST /api/portal/invoices/:stripe_invoice_id/pay
// Authenticated portal user — returns the Stripe hosted invoice URL.
// Payment itself is handled by Stripe — we just surface the URL.

import { NextRequest } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

export async function POST(
  req: NextRequest,
  { params }: { params: { stripe_invoice_id: string } }
) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const { stripe_invoice_id } = params

  // Verify this invoice belongs to this client
  const { data: invoice } = await supabase
    .from('client_invoices')
    .select('id, stripe_invoice_id, status, stripe_hosted_url')
    .eq('stripe_invoice_id', stripe_invoice_id)
    .eq('client_id', portalUser!.client_id)
    .single()

  if (!invoice) return err('Invoice not found', 404)
  if (invoice.status === 'paid') return err('This invoice has already been paid', 400)
  if (invoice.status === 'void') return err('This invoice has been voided', 400)

  // If we already have a hosted URL stored, return it directly
  if (invoice.stripe_hosted_url) {
    return ok({ payment_url: invoice.stripe_hosted_url })
  }

  // Otherwise fetch fresh from Stripe
  try {
    const stripeInvoice = await stripe.invoices.retrieve(stripe_invoice_id)
    const paymentUrl = stripeInvoice.hosted_invoice_url

    if (!paymentUrl) return err('Payment URL not available', 500)

    // Cache the URL in our DB
    const supabaseAdmin = (await import('@/lib/portal-auth')).getAdminClient()
    await supabaseAdmin
      .from('client_invoices')
      .update({ stripe_hosted_url: paymentUrl })
      .eq('id', invoice.id)

    return ok({ payment_url: paymentUrl })
  } catch (stripeErr: any) {
    return err(stripeErr.message || 'Failed to retrieve payment URL', 500)
  }
}
