// app/api/messages/[message_id]/reply/route.ts
// POST /api/messages/:message_id/reply
// Authenticated firm user — accountant sends a reply to a client message thread.

import { NextRequest } from 'next/server'
import { getFirmUser, getAdminClient, err, ok } from '@/lib/portal-auth'

export async function POST(
  req: NextRequest,
  { params }: { params: { message_id: string } }
) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  const body = await req.json()
  const { body: messageBody, workflow_id, client_id } = body

  if (!messageBody?.trim()) return err('Message body is required')
  if (messageBody.length > 4000) return err('Message too long (max 4000 characters)')

  // Resolve client_id — either passed directly or looked up from the original message
  let resolvedClientId = client_id
  let resolvedWorkflowId = workflow_id

  if (!resolvedClientId && params.message_id !== 'new') {
    const { data: originalMsg } = await supabase
      .from('portal_messages')
      .select('client_id, workflow_id, firm_id')
      .eq('id', params.message_id)
      .eq('firm_id', firmUser!.firm_id)
      .single()

    if (!originalMsg) return err('Original message not found', 404)
    resolvedClientId   = originalMsg.client_id
    resolvedWorkflowId = resolvedWorkflowId ?? originalMsg.workflow_id
  }

  if (!resolvedClientId) return err('client_id is required')

  // Verify this client belongs to the firm
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', resolvedClientId)
    .eq('firm_id', firmUser!.firm_id)
    .single()

  if (!client) return err('Client not found', 404)

  const admin = getAdminClient()

  const { data: message, error: insertErr } = await admin
    .from('portal_messages')
    .insert({
      firm_id:     firmUser!.firm_id,
      client_id:   resolvedClientId,
      workflow_id: resolvedWorkflowId ?? null,
      sender_type: 'accountant',
      sender_id:   firmUser!.id,
      body:        messageBody.trim(),
    })
    .select()
    .single()

  if (insertErr) return err('Failed to send reply', 500)

  // Log event
  await admin.from('events').insert({
    firm_id:     firmUser!.firm_id,
    client_id:   resolvedClientId,
    workflow_id: resolvedWorkflowId ?? null,
    event_type:  'portal_message_reply',
    description: `${firmUser!.name} replied to ${(client as any).name} via portal`,
    metadata:    { message_id: message.id, preview: messageBody.slice(0, 80) },
  })

  return ok({
    message: {
      id:          message.id,
      body:        message.body,
      sender_type: 'accountant',
      sender_name: firmUser!.name,
      workflow_id: message.workflow_id,
      read_at:     null,
      created_at:  message.created_at,
    }
  }, 201)
}
