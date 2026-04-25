import { NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import { err, ok } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, email, password, display_name } = body

  if (!token || !email || !password) return err('token, email, and password are required')
  if (password.length < 8) return err('Password must be at least 8 characters')

  const supabase = createSupabaseServerClient()

  const { data: invite, error: inviteErr } = await supabase
    .from('portal_invites')
    .select('id, firm_id, client_id, email, expires_at, used_at')
    .eq('token', token)
    .single()

  if (inviteErr || !invite) return err('Invalid invite link', 404)
  if (invite.used_at) return err('This invite has already been used', 410)
  if (new Date(invite.expires_at) < new Date()) return err('This invite has expired', 410)
  if (invite.email.toLowerCase() !== email.toLowerCase()) return err('Email does not match the invite')

  const { data: existing } = await supabase
    .from('portal_users')
    .select('id')
    .eq('client_id', invite.client_id)
    .single()

  if (existing) return err('A portal account already exists for this client', 409)

  const admin = createSupabaseAdminClient()

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: display_name || email, portal_user: true, firm_id: invite.firm_id, client_id: invite.client_id },
  })

  if (authErr) {
    if (authErr.message.includes('already been registered')) return err('An account with this email already exists. Try signing in.')
    return err(authErr.message, 500)
  }

  const authUserId = authData.user.id

  const { data: portalUser, error: puErr } = await admin
    .from('portal_users')
    .insert({ firm_id: invite.firm_id, client_id: invite.client_id, auth_user_id: authUserId, email: email.toLowerCase(), display_name: display_name || email })
    .select()
    .single()

  if (puErr) {
    await admin.auth.admin.deleteUser(authUserId)
    return err('Failed to create portal account', 500)
  }

  await admin.from('portal_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id)
  await admin.from('events').insert({ firm_id: invite.firm_id, client_id: invite.client_id, event_type: 'portal_user_registered', description: `Portal account created for ${email}`, metadata: { portal_user_id: portalUser.id } })

  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) return ok({ portal_user: portalUser, signed_in: false })

  await admin.from('portal_users').update({ last_login_at: new Date().toISOString() }).eq('id', portalUser.id)
  return ok({ portal_user: portalUser, signed_in: true }, 201)
}
