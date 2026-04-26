// app/api/clients/[client_id]/portal/user/route.ts
// DELETE /api/clients/:client_id/portal/user
// Owner only — revokes portal access for a client.
// Deletes portal_users row and disables the Supabase Auth user.

import { NextRequest } from 'next/server'
import { getFirmUser, getAdminClient, err, ok } from '@/lib/portal-auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  if (firmUser!.role !== 'owner') {
    return err('Only firm owners can revoke portal access', 403)
  }

  const { id: client_id } = params

  // Find the portal user
  const { data: portalUser } = await supabase
    .from('portal_users')
    .select('id, auth_user_id, email')
    .eq('client_id', client_id)
    .eq('firm_id', firmUser!.firm_id)
    .single()

  if (!portalUser) return err('No portal account found for this client', 404)

  const admin = getAdminClient()

  // Delete portal_users row
  await admin
    .from('portal_users')
    .delete()
    .eq('id', portalUser.id)

  // Disable / delete the Supabase Auth user
  if (portalUser.auth_user_id) {
    await admin.auth.admin.deleteUser(portalUser.auth_user_id)
  }

  // Log event
  await admin.from('events').insert({
    firm_id:   firmUser!.firm_id,
    client_id: client_id,
    event_type: 'portal_access_revoked',
    description: `Portal access revoked for ${portalUser.email} by ${firmUser!.name}`,
    metadata:  { portal_user_id: portalUser.id },
  })

  return ok({ ok: true })
}
