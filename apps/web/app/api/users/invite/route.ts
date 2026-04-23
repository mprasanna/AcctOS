import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

// ─── POST /api/users/invite ───────────────────────────────────────────────────
// Sends a Supabase Auth invite email. The invited user clicks the link,
// sets their password, and is automatically added to the firm.

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  // Only owners can invite
  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, role, name')
    .eq('id', user.id)
    .single()

  if (!userRow || userRow.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only firm owners can invite team members', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const { email, name, role } = body as { email: string; name: string; role: UserRole }

  if (!email || !name || !role) {
    return NextResponse.json(
      { error: 'email, name, and role are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const validRoles: UserRole[] = ['senior_accountant', 'accountant', 'admin']
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${validRoles.join(', ')}`, code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // Check for existing user with this email in the firm
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    return NextResponse.json(
      { error: 'A user with this email already exists in your firm', code: 'CONFLICT' },
      { status: 409 }
    )
  }

  // Check for pending invitation
  const { data: existingInvite } = await supabase
    .from('user_invitations')
    .select('id, expires_at')
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle()

  if (existingInvite) {
    const expired = new Date(existingInvite.expires_at) < new Date()
    if (!expired) {
      return NextResponse.json(
        { error: 'A pending invitation already exists for this email', code: 'CONFLICT' },
        { status: 409 }
      )
    }
    // Delete expired invitation
    await supabase.from('user_invitations').delete().eq('id', existingInvite.id)
  }

  // Record the invitation
  const token = generateToken()
  const { data: invitation, error: inviteError } = await supabase
    .from('user_invitations')
    .insert({
      firm_id:    userRow.firm_id,
      email,
      role,
      invited_by: user.id,
      token,
    })
    .select()
    .single()

  if (inviteError || !invitation) {
    return NextResponse.json(
      { error: inviteError?.message ?? 'Failed to create invitation', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Send invite via Supabase Auth admin
  // The user receives an email with a magic link.
  // When they click, we create their users row in the auth callback.
  const admin = createSupabaseAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/accept-invite?token=${token}`,
    data: {
      firm_id:     userRow.firm_id,
      role,
      name,
      invite_token: token,
    },
  })

  if (sendError) {
    // Clean up invitation record on failure
    await supabase.from('user_invitations').delete().eq('id', invitation.id)
    return NextResponse.json(
      { error: sendError.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Log event (no client — this is a firm-level event)
  // We don't have a firm_events table yet, so we skip logging here
  // or log to a system client placeholder in Phase 3

  return NextResponse.json({
    invited:      true,
    email,
    role,
    invite_id:    invitation.id,
    expires_at:   invitation.expires_at,
  }, { status: 201 })
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}
