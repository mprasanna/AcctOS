// lib/portal-auth.ts
// Helpers for portal API routes.
// getPortalUser() uses createSupabasePortalClient() — reads the portal cookie,
// completely separate from the firm session cookie.

import { createSupabasePortalClient } from '@/lib/supabase/portal'
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── Portal user (business owner) ─────────────────────────────────────────────
export async function getPortalUser(_req: NextRequest) {
  const supabase = createSupabasePortalClient()   // ← portal cookie

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

// ── Firm user (accountant) ────────────────────────────────────────────────────
export async function getFirmUser(_req: NextRequest) {
  const supabase = createSupabaseServerClient()   // ← firm cookie (default)

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

// ── Admin client ──────────────────────────────────────────────────────────────
export function getAdminClient() {
  return createSupabaseAdminClient()
}

// ── Response helpers ──────────────────────────────────────────────────────────
export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function ok(data: object, status = 200) {
  return NextResponse.json(data, { status })
}
