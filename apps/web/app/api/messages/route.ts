// app/api/messages/route.ts
// GET /api/messages?all=true|false&client_id=<uuid>
// Authenticated firm user — returns messages across all clients (or filtered).
// Default: unread only. ?all=true returns full history.
// Scoped by role: accountants see only their assigned clients,
// owners and senior CPAs see all.

import { NextRequest } from 'next/server'
import { getFirmUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  const showAll  = req.nextUrl.searchParams.get('all') === 'true'
  const clientId = req.nextUrl.searchParams.get('client_id')

  // Build base query
  let query = supabase
    .from('portal_messages')
    .select(`
      id,
      client_id,
      workflow_id,
      sender_type,
      sender_id,
      body,
      read_at,
      created_at,
      clients ( name ),
      workflows ( type, period )
    `)
    .eq('firm_id', firmUser!.firm_id)
    .order('created_at', { ascending: false })

  // Filter to unread client messages by default
  if (!showAll) {
    query = query.eq('sender_type', 'client').is('read_at', null)
  }

  // Filter to specific client if requested
  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  // Scope accountants to their assigned clients only
  if (firmUser!.role === 'accountant') {
    const { data: userRecord } = await supabase
      .from('users')
      .select('assigned_client_ids')
      .eq('id', firmUser!.id)
      .single()

    const assignedIds = userRecord?.assigned_client_ids ?? []
    if (assignedIds.length === 0) {
      return ok({ messages: [], unread_count: 0 })
    }
    query = query.in('client_id', assignedIds)
  }

  const { data: messages, error: msgErr } = await query
  if (msgErr) return err('Failed to load messages', 500)

  // Resolve portal user display names for client messages
  const clientSenderIds = [...new Set(
    (messages ?? [])
      .filter(m => m.sender_type === 'client')
      .map(m => m.sender_id)
  )]

  let portalNames: Record<string, string> = {}
  if (clientSenderIds.length > 0) {
    const { data: portalUsers } = await supabase
      .from('portal_users')
      .select('id, display_name, email')
      .in('id', clientSenderIds)
    portalNames = Object.fromEntries(
      (portalUsers ?? []).map(u => [u.id, u.display_name || u.email])
    )
  }

  // Resolve accountant names for accountant messages
  const accountantIds = [...new Set(
    (messages ?? [])
      .filter(m => m.sender_type === 'accountant')
      .map(m => m.sender_id)
  )]

  let accountantNames: Record<string, string> = {}
  if (accountantIds.length > 0) {
    const { data: accountants } = await supabase
      .from('users')
      .select('id, name')
      .in('id', accountantIds)
    accountantNames = Object.fromEntries(
      (accountants ?? []).map(u => [u.id, u.name])
    )
  }

  const formatted = (messages ?? []).map(m => ({
    id:             m.id,
    client_id:      m.client_id,
    client_name:    (m.clients as any)?.name ?? 'Unknown client',
    workflow_id:    m.workflow_id,
    workflow_label: m.workflow_id && m.workflows
                      ? `${(m.workflows as any).type} — ${(m.workflows as any).period}`
                      : null,
    sender_type:    m.sender_type,
    sender_name:    m.sender_type === 'client'
                      ? (portalNames[m.sender_id] ?? 'Client')
                      : (accountantNames[m.sender_id] ?? 'Accountant'),
    body:           m.body,
    read_at:        m.read_at,
    created_at:     m.created_at,
  }))

  const unreadCount = formatted.filter(m => m.sender_type === 'client' && !m.read_at).length

  return ok({ messages: formatted, unread_count: unreadCount })
}
