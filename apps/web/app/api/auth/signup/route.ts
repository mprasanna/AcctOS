import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Creates:
//   1. auth.users row (Supabase Auth)
//   2. firms row
//   3. users row (profile)
//   4. firm_settings row (via trigger)
//
// Uses the admin client because we need to create auth.users and
// firms in a single atomic operation before RLS is active.
// This endpoint is public (no auth required) — rate-limited at infra.

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, password, firm_name, your_name } = body

  if (!email || !password || !firm_name || !your_name) {
    return NextResponse.json(
      { error: 'email, password, firm_name, and your_name are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const admin = createSupabaseAdminClient()

  // Check if email already registered
  const { data: existing } = await admin.auth.admin.listUsers()
  const alreadyExists = existing?.users?.some(u => u.email === email)
  if (alreadyExists) {
    return NextResponse.json(
      { error: 'An account with this email already exists', code: 'CONFLICT' },
      { status: 409 }
    )
  }

  try {
    // 1. Create firm
    const { data: firm, error: firmError } = await admin
      .from('firms')
      .insert({ name: firm_name, plan: 'Starter', primary_email: email })
      .select()
      .single()

    if (firmError || !firm) throw firmError ?? new Error('Failed to create firm')

    // 2. Create auth user with firm_id + role in metadata
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        firm_id: firm.id,
        role:    'owner',
        name:    your_name,
      },
    })

    if (authError || !authUser.user) {
      // Rollback firm creation
      await admin.from('firms').delete().eq('id', firm.id)
      throw authError ?? new Error('Failed to create auth user')
    }

    // 3. Create user profile
    const initials = your_name
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    const { error: profileError } = await admin
      .from('users')
      .insert({
        id:       authUser.user.id,
        firm_id:  firm.id,
        name:     your_name,
        initials,
        email,
        role:     'owner',
      })

    if (profileError) {
      // Rollback
      await admin.auth.admin.deleteUser(authUser.user.id)
      await admin.from('firms').delete().eq('id', firm.id)
      throw profileError
    }

    // 4. Sign in immediately to return a session
    // (We can't use admin.auth.signIn, so we use the regular client)
    // Return user + firm info; client calls /api/auth/login for session
    return NextResponse.json({
      user: {
        id:      authUser.user.id,
        email,
        firm_id: firm.id,
        name:    your_name,
        initials,
        role:    'owner',
      },
      firm: {
        id:   firm.id,
        name: firm_name,
        plan: 'Starter',
      },
      next: 'Call POST /api/auth/login with your credentials to get a session token.',
    }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/auth/signup]', err)
    return NextResponse.json(
      { error: err.message ?? 'Signup failed', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
