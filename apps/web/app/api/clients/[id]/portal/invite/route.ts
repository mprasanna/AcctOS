// app/api/clients/[client_id]/portal/invite/route.ts
// POST /api/clients/:client_id/portal/invite
// Authenticated firm user (owner, senior, admin only).
// Creates a portal_invites row and emails the setup link via Resend.

import { NextRequest } from 'next/server'
import { getFirmUser, getAdminClient, err, ok } from '@/lib/portal-auth'

// NOTE: Resend is imported dynamically inside the handler.
// Do NOT move it to module scope — Next.js executes modules at build time
// when collecting page data, and the RESEND_API_KEY env var is not available
// at build time, causing `new Resend(undefined)` to throw and fail the build.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  // Only owner, senior_accountant, admin can send portal invites
  if (!['owner','senior_accountant','admin'].includes(firmUser!.role)) {
    return err('Insufficient permissions', 403)
  }

  const body = await req.json()
  const { email } = body
  if (!email?.trim()) return err('email is required')

  const { id: client_id } = params

  // Verify client belongs to this firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', client_id)
    .eq('firm_id', firmUser!.firm_id)
    .single()

  if (!client) return err('Client not found', 404)

  // Check portal user doesn't already exist
  const { data: existing } = await supabase
    .from('portal_users')
    .select('id')
    .eq('client_id', client_id)
    .single()

  if (existing) return err('A portal account already exists for this client', 409)

  // Get firm branding for email
  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', firmUser!.firm_id)
    .single()

  const { data: settings } = await supabase
    .from('firm_settings')
    .select('portal_logo_url, portal_tagline, from_name, reply_to_email')
    .eq('firm_id', firmUser!.firm_id)
    .single()

  const admin = getAdminClient()

  // Create invite row
  const { data: invite, error: inviteErr } = await admin
    .from('portal_invites')
    .insert({
      firm_id:   firmUser!.firm_id,
      client_id: client_id,
      email:     email.toLowerCase().trim(),
    })
    .select()
    .single()

  if (inviteErr) return err('Failed to create invite', 500)

  const setupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/setup?token=${invite.token}`
  const firmName = firm?.name ?? 'Your accounting firm'
  const logoUrl  = settings?.portal_logo_url
  const tagline  = settings?.portal_tagline ?? 'Your secure accounting portal'
  const fromName = settings?.from_name ?? firmName

  // Dynamic import — avoids top-level Resend instantiation which fails at build time
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from:    process.env.RESEND_DOMAIN
        ? `${fromName} <noreply@${process.env.RESEND_DOMAIN}>`
        : `${fromName} <onboarding@resend.dev>`,
      to:      email.trim(),
      replyTo: settings?.reply_to_email ?? undefined,
      subject: `${firmName} has set up your secure accounting portal`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8FAFC; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0;">

    <!-- Header with firm branding -->
    <div style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #E2E8F0;">
      ${logoUrl
        ? `<img src="${logoUrl}" alt="${firmName}" style="width: 56px; height: 56px; border-radius: 10px; object-fit: contain; margin-bottom: 14px; display: block; margin-left: auto; margin-right: auto;">`
        : `<div style="width: 56px; height: 56px; border-radius: 10px; background: #2563EB; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: white; margin-bottom: 14px;">${firmName.slice(0,2).toUpperCase()}</div>`
      }
      <div style="font-size: 20px; font-weight: 700; color: #0F172A; margin-bottom: 4px;">${firmName}</div>
      <div style="font-size: 13px; color: #475569;">${tagline}</div>
    </div>

    <!-- Body -->
    <div style="padding: 28px 32px;">
      <p style="font-size: 15px; color: #0F172A; margin: 0 0 12px;">Hi ${(client as any).name},</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px;">
        ${firmName} has set up a secure portal for you to upload documents, view your filing status, and message your accountant — all in one place.
      </p>
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        Click the button below to create your account. This link expires in <strong>7 days</strong>.
      </p>

      <div style="text-align: center; margin: 0 0 24px;">
        <a href="${setupUrl}"
           style="display: inline-block; background: #2563EB; color: white; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 28px; border-radius: 9px;">
          Set up my portal account →
        </a>
      </div>

      <p style="font-size: 12px; color: #94A3B8; margin: 0;">
        Or copy this link into your browser:<br>
        <span style="color: #2563EB; word-break: break-all;">${setupUrl}</span>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 16px 32px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
      <p style="font-size: 11px; color: #94A3B8; margin: 0;">
        Secured by AcctOS · This invite was sent by ${firmName}
      </p>
    </div>
  </div>
</body>
</html>
      `,
    })
  } catch (emailErr: any) {
    // Invite was created — log the email failure but don't fail the request
    console.error('Portal invite email failed:', emailErr.message)
    return ok({
      invite:       { id: invite.id, email: invite.email, expires_at: invite.expires_at },
      email_sent:   false,
      email_error:  emailErr.message,
      setup_url:    setupUrl, // Return URL so firm can share manually
    }, 201)
  }

  // Log event
  await admin.from('events').insert({
    firm_id:     firmUser!.firm_id,
    client_id:   client_id,
    event_type:  'portal_invite_sent',
    description: `Portal invite sent to ${email}`,
    metadata:    { invite_id: invite.id, email },
  })

  return ok({
    invite:     { id: invite.id, email: invite.email, expires_at: invite.expires_at },
    email_sent: true,
  }, 201)
}
