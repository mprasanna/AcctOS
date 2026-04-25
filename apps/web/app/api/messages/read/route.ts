// app/api/messages/read/route.ts
// PATCH /api/messages/read
// Authenticated firm user — marks one or more messages as read.

import { NextRequest } from 'next/server'
import { getFirmUser, getAdminClient, err, ok } from '@/lib/portal-auth'

export async function PATCH(req: NextRequest) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  const body = await req.json()
  const { message_ids } = body

  if (!Array.isArray(message_ids) || message_ids.length === 0) {
    return err('message_ids array is required')
  }

  const admin = getAdminClient()

  const { data, error: updateErr } = await admin
    .from('portal_messages')
    .update({ read_at: new Date().toISOString() })
    .in('id', message_ids)
    .eq('firm_id', firmUser!.firm_id)  // RLS safety — only mark within own firm
    .is('read_at', null)               // Only update unread messages
    .select('id')

  if (updateErr) return err('Failed to mark messages read', 500)

  return ok({ updated: (data ?? []).length })
}
