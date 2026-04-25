// lib/portal-auth.ts
// Shared helpers for portal API routes.
// Uses the project's existing createSupabaseServerClient / createSupabaseAdminClient pattern.

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Firm-side: resolve the authenticated firm user from the session cookie ────
export async function getFirmUser(_req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, firmUser: null, error: 'Unauthorized' }

  const { data: firmUser } = await supabase
    .from('users')
    .select('id, firm_id, role, name, email')
    .eq('id', user.id)
    .single()

  if (!firmUser) return { supabase, firmUser: null, error: 'User not found' }
  return { supabase, firmUser, error: null }
}

// ── Portal-side: resolve the authenticated portal user from the session cookie ─
// Portal users are in Supabase Auth just like firm users.
// Their profile row is in portal_users (not users).
export async function getPortalUser(_req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, portalUser: null, error: 'Unauthorized' }

  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, firm_id, client_id, email, display_name, last_login_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!portalUser) return { supabase, portalUser: null, error: 'Portal user not found' }
  return { supabase, portalUser, error: null }
}

// ── Admin client shortcut ─────────────────────────────────────────────────────
// Wraps the project's existing createSupabaseAdminClient
export function getAdminClient() {
  return createSupabaseAdminClient()
}

// ── Standard JSON response helpers ───────────────────────────────────────────
export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function ok(data: object, status = 200) {
  return NextResponse.json(data, { status })
}
