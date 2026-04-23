import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'

// ─── GET /auth/accept-invite ──────────────────────────────────────────────────
// Supabase Auth redirects here after the invited user clicks the invite link
// and sets their password. At this point:
//   1. The user is authenticated (session exists)
//   2. Their auth.users row has user_metadata: { firm_id, role, name, invite_token }
//   3. We create their users table profile row
//   4. We mark the invitation as accepted
//   5. Redirect to /dashboard

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login?error=invalid_invite', req.url))
  }

  const firmId = user.user_metadata?.firm_id
  const role   = user.user_metadata?.role ?? 'accountant'
  const name   = user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'New User'

  if (!firmId) {
    return NextResponse.redirect(new URL('/login?error=no_firm', req.url))
  }

  // Check if profile already exists (idempotent)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (!existing) {
    const initials = name
      .split(' ')
      .map((w: string) => w[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2)

    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id:       user.id,
        firm_id:  firmId,
        name,
        initials,
        email:    user.email ?? '',
        role,
      })

    if (profileError) {
      console.error('[accept-invite] Failed to create user profile:', profileError)
      return NextResponse.redirect(new URL('/login?error=profile_error', req.url))
    }
  }

  // Mark invitation as accepted
  if (token) {
    await supabase
      .from('user_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', token)
      .is('accepted_at', null)
  }

  return NextResponse.redirect(new URL('/dashboard', req.url))
}
