// app/api/notifications/route.ts
// GET /api/notifications
// Authenticated firm user — lightweight endpoint for the bell icon.
// Returns unread message count scoped to this user's visible clients.

import { NextRequest } from 'next/server'
import { getFirmUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  let query = supabase
    .from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('firm_id', firmUser!.firm_id)
    .eq('sender_type', 'client')
    .is('read_at', null)

  // Accountants only see notifications for their assigned clients
  if (firmUser!.role === 'accountant') {
    const { data: userRecord } = await supabase
      .from('users')
      .select('assigned_client_ids')
      .eq('id', firmUser!.id)
      .single()

    const assignedIds = userRecord?.assigned_client_ids ?? []
    if (assignedIds.length === 0) {
      return ok({ unread_messages: 0 })
    }
    query = query.in('client_id', assignedIds)
  }

  const { count, error: countErr } = await query
  if (countErr) return err('Failed to get notification count', 500)

  return ok({ unread_messages: count ?? 0 })
}
