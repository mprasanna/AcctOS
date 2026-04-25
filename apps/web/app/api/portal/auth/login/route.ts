import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import { err, ok } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, password } = body
  if (!email || !password) return err('email and password are required')

  const supabase = createSupabaseServerClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  })
  if (error) return err('Invalid email or password', 401)

  // Verify this is a portal user, not a firm staff member
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, firm_id, client_id, email, display_name')
    .eq('auth_user_id', data.user.id)
    .single()

  if (!portalUser) {
    await supabase.auth.signOut()
    return err('No portal account found for this email', 403)
  }

  const admin = createSupabaseAdminClient()
  await admin.from('portal_users').update({ last_login_at: new Date().toISOString() }).eq('id', portalUser.id)

  return ok({ portal_user: portalUser })
}
