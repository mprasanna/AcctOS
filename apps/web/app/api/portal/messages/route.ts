// app/api/portal/messages/route.ts
// GET /api/portal/messages?workflow_id=<uuid|null>
// POST /api/portal/messages
// Authenticated portal user.

import { NextRequest } from 'next/server'
import { getPortalUser, getAdminClient, err, ok } from '@/lib/portal-auth'

// GET — fetch message thread for this client
// workflow_id filter: specific filing thread or all messages
export async function GET(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const workflowId = req.nextUrl.searchParams.get('workflow_id')

  let query = supabase
    .from('portal_messages')
    .select(`
      id,
      sender_type,
      sender_id,
      body,
      workflow_id,
      read_at,
      created_at,
      workflows ( type, period )
    `)
    .eq('client_id', portalUser!.client_id)
    .eq('firm_id', portalUser!.firm_id)
    .order('created_at', { ascending: true })

  if (workflowId) {
    query = query.eq('workflow_id', workflowId)
  }

  const { data: messages, error: msgErr } = await query
  if (msgErr) return err('Failed to load messages', 500)

  // Resolve sender names
  // For accountant messages, look up users table
  // For client messages, use portal_users display_name
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
    sender_type:    m.sender_type,
    sender_name:    m.sender_type === 'accountant'
                      ? (accountantNames[m.sender_id] ?? 'Your accountant')
                      : (portalUser!.display_name ?? 'You'),
    body:           m.body,
    workflow_id:    m.workflow_id,
    workflow_label: m.workflow_id && m.workflows
                      ? `${(m.workflows as any).type} — ${(m.workflows as any).period}`
                      : null,
    read_at:        m.read_at,
    created_at:     m.created_at,
  }))

  // Mark all accountant messages as read now that client has fetched them
  const unreadAccountantIds = (messages ?? [])
    .filter(m => m.sender_type === 'accountant' && !m.read_at)
    .map(m => m.id)

  if (unreadAccountantIds.length > 0) {
    const admin = getAdminClient()
    await admin
      .from('portal_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadAccountantIds)
  }

  return ok({ messages: formatted })
}

// POST — client sends a new message
export async function POST(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const body = await req.json()
  const { body: messageBody, workflow_id } = body

  if (!messageBody?.trim()) return err('Message body is required')
  if (messageBody.length > 4000) return err('Message too long (max 4000 characters)')

  // If workflow_id provided, verify it belongs to this client
  if (workflow_id) {
    const { data: wf } = await supabase
      .from('workflows')
      .select('id')
      .eq('id', workflow_id)
      .eq('client_id', portalUser!.client_id)
      .single()
    if (!wf) return err('Workflow not found', 404)
  }

  const admin = getAdminClient()

  const { data: message, error: insertErr } = await admin
    .from('portal_messages')
    .insert({
      firm_id:     portalUser!.firm_id,
      client_id:   portalUser!.client_id,
      workflow_id: workflow_id || null,
      sender_type: 'client',
      sender_id:   portalUser!.id,
      body:        messageBody.trim(),
    })
    .select()
    .single()

  if (insertErr) return err('Failed to send message', 500)

  // Log event in activity feed
  await admin.from('events').insert({
    firm_id:     portalUser!.firm_id,
    client_id:   portalUser!.client_id,
    workflow_id: workflow_id || null,
    event_type:  'portal_message_sent',
    description: `Message received from client through portal`,
    metadata:    { message_id: message.id, preview: messageBody.slice(0, 80) },
  })

  return ok({
    message: {
      id:          message.id,
      body:        message.body,
      sender_type: 'client',
      sender_name: portalUser!.display_name ?? 'You',
      workflow_id: message.workflow_id,
      read_at:     null,
      created_at:  message.created_at,
    }
  }, 201)
}
