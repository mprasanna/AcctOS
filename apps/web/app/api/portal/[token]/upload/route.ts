import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import {
  getStorageProvider,
  getPresignedUploadUrl,
} from '@/lib/storage/r2'

type RouteParams = { params: { token: string } }

// ─── POST /api/portal/[token]/upload ─────────────────────────────────────────
// Allows the business client (not firm staff) to upload a document.
// No Supabase Auth required — the portal token is the credential.
//
// Flow:
//   1. Client visits portal URL, sees pending documents
//   2. Client selects file and POSTs here with document_id + file metadata
//   3. This endpoint returns a presigned upload URL
//   4. Client PUTs file directly to Storage
//   5. Client POSTs to /api/portal/[token]/confirm with the storage path

const MAX_SIZE    = 25 * 1024 * 1024  // 25MB
const ALLOWED_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv', 'application/zip', 'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

export async function POST(req: NextRequest, { params }: RouteParams) {
  const admin = createSupabaseAdminClient()

  // Validate portal token
  const { data: portalToken } = await admin
    .from('client_portal_tokens')
    .select('id, client_id, firm_id, expires_at, revoked_at, can_upload')
    .eq('token', params.token)
    .single()

  if (!portalToken?.can_upload) {
    return NextResponse.json({ error: 'Upload not permitted', code: 'FORBIDDEN' }, { status: 403 })
  }

  if (portalToken.revoked_at || new Date(portalToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Portal link expired or revoked', code: 'EXPIRED' }, { status: 410 })
  }

  const body = await req.json()
  const { document_id, workflow_id, file_name, content_type, size_bytes } = body

  if (!document_id || !workflow_id || !file_name || !content_type) {
    return NextResponse.json(
      { error: 'document_id, workflow_id, file_name, and content_type are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  if (!ALLOWED_TYPES.includes(content_type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Upload PDF, images, CSV, Excel, or ZIP.', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  if (size_bytes > MAX_SIZE) {
    return NextResponse.json({ error: 'File exceeds 25MB limit', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Verify document belongs to this client's workflow
  const { data: doc } = await admin
    .from('documents')
    .select('id, name, workflow_id')
    .eq('id', document_id)
    .eq('workflow_id', workflow_id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Build object key
  const sanitised = file_name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200)
  const objectKey = [
    portalToken.firm_id,
    portalToken.client_id,
    workflow_id,
    `portal_${Date.now()}_${sanitised}`,
  ].join('/')

  const provider = getStorageProvider()
  const { uploadUrl, error: urlError } = await getPresignedUploadUrl(
    objectKey, content_type, provider
  )

  if (urlError || !uploadUrl) {
    return NextResponse.json(
      { error: urlError ?? 'Failed to generate upload URL', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Pre-register storage object
  if (provider === 'r2') {
    await admin.from('r2_objects').insert({
      firm_id:       portalToken.firm_id,
      client_id:     portalToken.client_id,
      workflow_id,
      document_id,
      bucket:        process.env.R2_BUCKET_NAME ?? 'acct-os-documents',
      key:           objectKey,
      original_name: file_name,
      content_type,
      size_bytes:    size_bytes ?? null,
      upload_source: 'client_portal',
      storage_tier:  'standard',
    })
  } else {
    await admin.from('storage_objects').insert({
      firm_id:       portalToken.firm_id,
      client_id:     portalToken.client_id,
      workflow_id,
      document_id,
      bucket:        'client-documents',
      storage_path:  objectKey,
      original_name: file_name,
      content_type,
      size_bytes:    size_bytes ?? null,
      upload_source: 'client_portal',
    })
  }

  return NextResponse.json({
    upload_url:  uploadUrl,
    path:        objectKey,
    document_id,
    expires_in:  provider === 'r2' ? 300 : 60,
    // After uploading, call this endpoint with the path to confirm:
    confirm_url: `/api/portal/${params.token}/confirm`,
  }, { status: 201 })
}

// ─── PATCH (confirm upload) ───────────────────────────────────────────────────
// After the client uploads the file, they call this to mark the document received.

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const admin = createSupabaseAdminClient()

  const { data: portalToken } = await admin
    .from('client_portal_tokens')
    .select('id, client_id, firm_id, expires_at, revoked_at, can_upload')
    .eq('token', params.token)
    .single()

  if (!portalToken?.can_upload || portalToken.revoked_at || new Date(portalToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 })
  }

  const { document_id, storage_path } = await req.json()
  if (!document_id) {
    return NextResponse.json({ error: 'document_id required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Mark document as received
  const { data: doc } = await admin
    .from('documents')
    .update({
      status:        'received',
      uploaded_at:   new Date().toISOString(),
      storage_path:  storage_path ?? null,
      upload_source: 'Client portal',
    })
    .eq('id', document_id)
    .select('workflow_id, name')
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Log event
  await admin.from('events').insert({
    client_id:   portalToken.client_id,
    firm_id:     portalToken.firm_id,
    workflow_id: doc.workflow_id,
    who:         'Client (portal)',
    action:      `Document uploaded via portal: ${doc.name}`,
    detail:      'Uploaded by client through the secure portal link',
  })

  // Check if all docs now received — if so, unblock Stage 2
  const { data: allDocs } = await admin
    .from('documents')
    .select('status')
    .eq('workflow_id', doc.workflow_id)

  const allReceived = (allDocs ?? []).every(d => d.status === 'received')
  if (allReceived) {
    await admin
      .from('stages')
      .update({ status: 'complete', completed_at: new Date().toISOString(), blocked: false, block_reason: null })
      .eq('workflow_id', doc.workflow_id)
      .eq('n', 2)

    await admin
      .from('stages')
      .update({ blocked: false, block_reason: null })
      .eq('workflow_id', doc.workflow_id)
      .in('n', [3, 4, 5])
      .eq('blocked', true)

    await admin
      .from('workflows')
      .update({ cur_stage: 3 })
      .eq('id', doc.workflow_id)
      .lte('cur_stage', 2)
  }

  return NextResponse.json({ received: true, all_documents_received: allReceived })
}
