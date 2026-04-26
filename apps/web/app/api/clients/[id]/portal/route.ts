// app/api/clients/[client_id]/portal/route.ts
// GET /api/clients/:client_id/portal
// Authenticated firm user — returns portal account status for a client.
// Shows whether a portal user exists, or if there's a pending invite.

import { NextRequest } from 'next/server'
import { getFirmUser, err, ok } from '@/lib/portal-auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  const { id: client_id } = params

  // Verify client belongs to this firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, client_email')
    .eq('id', client_id)
    .eq('firm_id', firmUser!.firm_id)
    .single()

  if (!client) return err('Client not found', 404)

  // Check for existing portal user
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, email, display_name, last_login_at, created_at')
    .eq('client_id', client_id)
    .eq('firm_id', firmUser!.firm_id)
    .single()

  // Check for pending (unused, non-expired) invite
  const { data: pendingInvite } = await supabase
    .from('portal_invites')
    .select('id, email, expires_at, created_at')
    .eq('client_id', client_id)
    .eq('firm_id', firmUser!.firm_id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return ok({
    client:         { id: client.id, name: client.name, email: client.client_email },
    portal_user:    portalUser ?? null,
    pending_invite: pendingInvite ?? null,
  })
}
