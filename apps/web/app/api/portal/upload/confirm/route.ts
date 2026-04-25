// app/api/portal/upload/confirm/route.ts
// PATCH /api/portal/upload/confirm
// Authenticated portal user — Step 2 of 2.
// Marks the document as received, logs the event, and checks if all docs
// are now received (which auto-advances Stage 2).

import { NextRequest } from 'next/server'
import { getPortalUser, getAdminClient, err, ok } from '@/lib/portal-auth'

export async function PATCH(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const body = await req.json()
  const { document_id, storage_path } = body

  if (!document_id || !storage_path) {
    return err('document_id and storage_path are required')
  }

  // Verify document belongs to this client
  const { data: doc } = await supabase
    .from('documents')
    .select('id, name, workflow_id, is_t183')
    .eq('id', document_id)
    .single()

  if (!doc) return err('Document not found', 404)

  // Verify workflow belongs to this portal user's client
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, type, cur_stage')
    .eq('id', doc.workflow_id)
    .eq('client_id', portalUser!.client_id)
    .single()

  if (!workflow) return err('Workflow not found', 404)

  const admin = getAdminClient()

  // Mark document received with storage path
  const { error: updateErr } = await admin
    .from('documents')
    .update({
      status:       'received',
      storage_path: storage_path,
      received_at:  new Date().toISOString(),
    })
    .eq('id', document_id)

  if (updateErr) return err('Failed to update document', 500)

  // Log event
  await admin.from('events').insert({
    firm_id:     portalUser!.firm_id,
    client_id:   portalUser!.client_id,
    workflow_id: doc.workflow_id,
    event_type:  'document_received',
    description: `${doc.name} uploaded by client through portal`,
    metadata:    { document_id, storage_path, via: 'portal', is_t183: doc.is_t183 },
  })

  // Check if all documents for this workflow are now received
  const { data: remainingDocs } = await admin
    .from('documents')
    .select('id')
    .eq('workflow_id', doc.workflow_id)
    .eq('status', 'pending')

  const allDocsReceived = (remainingDocs ?? []).length === 0
  let stageAdvanced = false

  // Auto-advance Stage 2 if all docs received and currently in_progress
  if (allDocsReceived && workflow.cur_stage === 2) {
    const { data: stage2 } = await admin
      .from('stages')
      .select('id, status')
      .eq('workflow_id', doc.workflow_id)
      .eq('n', 2)
      .single()

    if (stage2 && stage2.status === 'in_progress') {
      await admin
        .from('stages')
        .update({ status: 'complete', completed_at: new Date().toISOString() })
        .eq('id', stage2.id)

      await admin
        .from('stages')
        .update({ status: 'in_progress' })
        .eq('workflow_id', doc.workflow_id)
        .eq('n', 3)

      await admin
        .from('workflows')
        .update({ cur_stage: 3, updated_at: new Date().toISOString() })
        .eq('id', doc.workflow_id)

      await admin.from('events').insert({
        firm_id:     portalUser!.firm_id,
        client_id:   portalUser!.client_id,
        workflow_id: doc.workflow_id,
        event_type:  'stage_auto_advanced',
        description: 'Stage 2 complete — all documents received via portal. Stage 3 unlocked.',
        metadata:    { from_stage: 2, to_stage: 3, trigger: 'all_docs_received' },
      })

      stageAdvanced = true
    }
  }

  return ok({
    document:      { id: document_id, status: 'received', storage_path },
    stage_advanced: stageAdvanced,
    all_docs_received: allDocsReceived,
  })
}
