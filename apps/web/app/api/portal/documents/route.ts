// app/api/portal/documents/route.ts
// GET /api/portal/documents?workflow_id=<uuid>
// Authenticated portal user — returns documents for a specific workflow
// scoped to their client. Only shows client-relevant docs (pending + received).

import { NextRequest } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const workflowId = req.nextUrl.searchParams.get('workflow_id')
  if (!workflowId) return err('workflow_id is required')

  // Verify this workflow belongs to the portal user's client
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, type, period, deadline, cur_stage')
    .eq('id', workflowId)
    .eq('client_id', portalUser!.client_id)
    .eq('firm_id', portalUser!.firm_id)
    .single()

  if (!workflow) return err('Workflow not found', 404)

  // Fetch documents for this workflow
  const { data: documents, error: docsErr } = await supabase
    .from('documents')
    .select('id, name, status, upload_required, storage_path, is_t183')
    .eq('workflow_id', workflowId)
    .order('name')

  if (docsErr) return err('Failed to load documents', 500)

  return ok({
    documents: documents ?? [],
    workflow: {
      id:           workflow.id,
      type:         workflow.type,
      period_label: workflow.period,
      deadline:     workflow.deadline,
      cur_stage:    workflow.cur_stage,
    },
  })
}
