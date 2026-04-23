import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { createHmac } from 'crypto'

// ─── POST /api/webhooks/resend ────────────────────────────────────────────────
// Receives delivery events from Resend:
//   email.delivered, email.opened, email.bounced, email.complained
//
// Verifies Resend's webhook signature before processing.
// Updates notification_log with delivery status.
// On bounce: flags the notification + logs a warning event.

export async function POST(req: NextRequest) {
  // ── Signature verification ───────────────────────────────
  const signature = req.headers.get('svix-signature')
  const msgId     = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const secret    = process.env.RESEND_WEBHOOK_SECRET

  if (!signature || !msgId || !timestamp) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  const rawBody = await req.text()

  if (secret) {
    // Svix signature format: v1,<base64-hmac>
    const expectedSig = computeSignature(secret, msgId, timestamp, rawBody)
    const sigs        = signature.split(' ').map(s => s.split(',')[1])
    if (!sigs.includes(expectedSig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, data } = event

  // data.email_id is the Resend message ID we stored in notification_log.resend_id
  const resendId = data?.email_id as string | undefined
  if (!resendId) {
    return NextResponse.json({ ok: true, message: 'No email_id — skipping' })
  }

  // Use admin client — webhook has no user JWT
  const admin = createSupabaseAdminClient()

  // Map Resend event type to our status field
  const statusMap: Record<string, string> = {
    'email.delivered':  'delivered',
    'email.opened':     'opened',
    'email.bounced':    'bounced',
    'email.complained': 'complained',
    'email.clicked':    'clicked',
  }

  const deliveryStatus = statusMap[type]
  if (!deliveryStatus) {
    return NextResponse.json({ ok: true, message: `Unhandled event type: ${type}` })
  }

  // Update notification_log
  const updatePayload: Record<string, any> = { delivery_status: deliveryStatus }
  if (deliveryStatus === 'delivered') updatePayload.delivered_at = new Date().toISOString()
  if (deliveryStatus === 'opened')    updatePayload.opened_at    = new Date().toISOString()
  if (deliveryStatus === 'bounced')   updatePayload.bounced_at   = new Date().toISOString()

  const { data: updated, error: updateError } = await admin
    .from('notification_log')
    .update(updatePayload)
    .eq('resend_id', resendId)
    .select('id, firm_id, client_id, workflow_id, recipient_email, type')
    .single()

  if (updateError) {
    console.error('[resend-webhook] Failed to update notification_log:', updateError)
    // Return 200 so Resend doesn't retry — log the error for investigation
    return NextResponse.json({ ok: false, error: updateError.message })
  }

  // On bounce: log an event in the activity feed so the firm can see it
  if (deliveryStatus === 'bounced' && updated?.client_id) {
    await admin.from('events').insert({
      client_id:   updated.client_id,
      firm_id:     updated.firm_id,
      workflow_id: updated.workflow_id,
      who:         'System',
      action:      'Email bounced',
      detail:      `${updated.type} email bounced for ${updated.recipient_email} — verify client email address`,
    })
  }

  return NextResponse.json({ ok: true, resend_id: resendId, status: deliveryStatus })
}

function computeSignature(secret: string, msgId: string, timestamp: string, body: string): string {
  // Resend uses Svix signature scheme
  const signedContent = `${msgId}.${timestamp}.${body}`
  const hmac = createHmac('sha256', Buffer.from(secret.split('_')[1] ?? secret, 'base64'))
  hmac.update(signedContent)
  return hmac.digest('base64')
}
