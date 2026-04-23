import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Map Supabase error codes to our format
    if (error.message.includes('Invalid login')) {
      return NextResponse.json(
        { error: 'Invalid email or password', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }
    return NextResponse.json({ error: error.message, code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Fetch user profile for the response
  const { data: userRow } = await supabase
    .from('users')
    .select('id, firm_id, name, initials, role, email')
    .eq('id', data.user.id)
    .single()

  return NextResponse.json({
    access_token:  data.session?.access_token,
    refresh_token: data.session?.refresh_token,
    expires_at:    data.session?.expires_at,
    user: userRow ?? {
      id:       data.user.id,
      email:    data.user.email,
      firm_id:  data.user.user_metadata?.firm_id,
      name:     data.user.user_metadata?.name ?? data.user.email,
      initials: '?',
      role:     data.user.user_metadata?.role ?? 'accountant',
    },
  })
}
