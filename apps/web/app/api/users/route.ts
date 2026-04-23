import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

// ─── GET /api/users ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, name, initials, email, role, created_at')
    .order('role', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  // Also fetch pending invitations (owner only)
  const { data: invokerRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  let pending_invitations: any[] = []
  if (invokerRow?.role === 'owner') {
    const { data: invites } = await supabase
      .from('user_invitations')
      .select('id, email, role, created_at, expires_at, accepted_at')
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    pending_invitations = invites ?? []
  }

  return NextResponse.json({
    data:                data ?? [],
    pending_invitations,
  })
}

// ─── POST /api/users ──────────────────────────────────────────────────────────
// Alias for /api/users/invite — kept here for REST symmetry.
// See /api/users/invite/route.ts for full implementation.

export async function POST(req: NextRequest) {
  return NextResponse.redirect(new URL('/api/users/invite', req.url), 307)
}
