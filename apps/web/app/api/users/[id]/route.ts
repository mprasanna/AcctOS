import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

type RouteParams = { params: { id: string } }

// ─── GET /api/users/:id ───────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, name, initials, email, role, created_at')
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: invokerRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const body = await req.json()
  const { name, initials, role } = body as { name?: string; initials?: string; role?: UserRole }

  // Role changes require owner permission
  if (role && invokerRow?.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only firm owners can change user roles', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  // Users can update their own name/initials; owners can update anyone
  const isSelf    = params.id === user.id
  const isOwner   = invokerRow?.role === 'owner'

  if (!isSelf && !isOwner) {
    return NextResponse.json(
      { error: 'You can only update your own profile', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  // Cannot downgrade the only owner
  if (role && role !== 'owner' && params.id === user.id) {
    return NextResponse.json(
      { error: 'You cannot change your own role', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const patch: Record<string, unknown> = {}
  if (name)     patch.name     = name
  if (initials) patch.initials = initials
  if (role)     patch.role     = role

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: 'No patchable fields provided', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, initials, email, role')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return NextResponse.json(updated)
}

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
// Soft-deactivate: reassign their clients, remove from firm.
// Hard delete of auth.users is done via Supabase dashboard.

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  if (params.id === user.id) {
    return NextResponse.json(
      { error: 'You cannot remove yourself from the firm', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const { data: invokerRow } = await supabase
    .from('users')
    .select('role, firm_id')
    .eq('id', user.id)
    .single()

  if (invokerRow?.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only firm owners can remove team members', code: 'FORBIDDEN' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const reassign_to = body.reassign_to as string | undefined

  // Reassign clients if requested
  if (reassign_to) {
    await supabase
      .from('clients')
      .update({ assigned_to: reassign_to })
      .eq('assigned_to', params.id)

    await supabase
      .from('tasks')
      .update({ assigned_to: reassign_to })
      .eq('assigned_to', params.id)
  } else {
    // Set to null — unassigned
    await supabase
      .from('clients')
      .update({ assigned_to: null })
      .eq('assigned_to', params.id)

    await supabase
      .from('tasks')
      .update({ assigned_to: null })
      .eq('assigned_to', params.id)
  }

  // Delete the user profile (auth.users remains for audit; admin can clean up)
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
