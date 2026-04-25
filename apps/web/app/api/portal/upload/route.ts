// app/api/portal/upload/route.ts
// POST /api/portal/upload
// Authenticated portal user — Step 1 of 2 for file upload.
// Returns a presigned R2/Supabase Storage URL for the browser to PUT to directly.

import { NextRequest, NextResponse } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  const body = await req.json()
  const { workflow_id, document_id, filename, content_type } = body

  if (!workflow_id || !document_id || !filename || !content_type) {
    return err('workflow_id, document_id, filename, and content_type are required')
  }

  // Verify the document belongs to this client's workflow
  const { data: doc } = await supabase
    .from('documents')
    .select('id, name, workflow_id')
    .eq('id', document_id)
    .eq('workflow_id', workflow_id)
    .single()

  if (!doc) return err('Document not found', 404)

  // Verify the workflow belongs to this client
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id')
    .eq('id', workflow_id)
    .eq('client_id', portalUser!.client_id)
    .single()

  if (!workflow) return err('Workflow not found', 404)

  // Build storage path: portal-uploads/<firm_id>/<client_id>/<doc_id>/<filename>
  const ext = filename.split('.').pop()
  const storagePath = `portal-uploads/${portalUser!.firm_id}/${portalUser!.client_id}/${document_id}/${Date.now()}.${ext}`

  // Create presigned upload URL via Supabase Storage
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (signedErr || !signedData) {
    return err('Failed to generate upload URL', 500)
  }

  return ok({
    presigned_url: signedData.signedUrl,
    storage_path:  storagePath,
    token:         signedData.token,
  })
}
