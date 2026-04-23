import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getStorageProvider,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
} from '@/lib/storage/r2'

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25MB
const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed',
]

// ─── POST /api/upload ─────────────────────────────────────────────────────────
// Provider-agnostic presigned upload URL.
// STORAGE_PROVIDER=supabase → Supabase Storage (Phase 2 default)
// STORAGE_PROVIDER=r2       → Cloudflare R2 (Phase 3 migration)
//
// After upload: PATCH /api/documents/:id { status: 'received', storage_path }

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('firm_id, name')
    .eq('id', user.id)
    .single()

  if (!userRow) {
    return NextResponse.json({ error: 'User not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const body = await req.json()
  const { workflow_id, document_id, file_name, content_type, size_bytes } = body

  if (!workflow_id || !file_name || !content_type) {
    return NextResponse.json(
      { error: 'workflow_id, file_name, and content_type are required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  if (!ALLOWED_CONTENT_TYPES.includes(content_type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: PDF, images, CSV, Excel, ZIP', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  if (size_bytes && size_bytes > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File exceeds 25MB maximum', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // Verify workflow belongs to this firm
  const { data: workflow } = await supabase
    .from('workflows')
    .select('id, client_id, firm_id')
    .eq('id', workflow_id)
    .single()

  if (!workflow || workflow.firm_id !== userRow.firm_id) {
    return NextResponse.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Build object key: {firm_id}/{client_id}/{workflow_id}/{timestamp}_{filename}
  const sanitisedName = file_name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200)
  const objectKey     = [
    userRow.firm_id, workflow.client_id, workflow_id,
    `${Date.now()}_${sanitisedName}`,
  ].join('/')

  const provider = getStorageProvider()

  // Get presigned URL from the active storage provider
  const { uploadUrl, error: urlError } = await getPresignedUploadUrl(
    objectKey,
    content_type,
    provider,
    provider === 'supabase' ? supabase : undefined
  )

  if (urlError || !uploadUrl) {
    return NextResponse.json(
      { error: urlError ?? 'Failed to generate upload URL', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Record in the appropriate table
  let storageObjectId: string | null = null

  if (provider === 'r2') {
    const { data: r2Obj } = await supabase
      .from('r2_objects')
      .insert({
        firm_id:       userRow.firm_id,
        client_id:     workflow.client_id,
        workflow_id,
        document_id:   document_id ?? null,
        bucket:        process.env.R2_BUCKET_NAME ?? 'acct-os-documents',
        key:           objectKey,
        original_name: file_name,
        content_type,
        size_bytes:    size_bytes ?? null,
        uploaded_by:   user.id,
        upload_source: 'manual',
        storage_tier:  'standard',
      })
      .select('id')
      .single()
    storageObjectId = r2Obj?.id ?? null
  } else {
    const { data: supObj } = await supabase
      .from('storage_objects')
      .insert({
        firm_id:       userRow.firm_id,
        client_id:     workflow.client_id,
        workflow_id,
        document_id:   document_id ?? null,
        bucket:        'client-documents',
        storage_path:  objectKey,
        original_name: file_name,
        content_type,
        size_bytes:    size_bytes ?? null,
        uploaded_by:   user.id,
        upload_source: 'manual',
      })
      .select('id')
      .single()
    storageObjectId = supObj?.id ?? null
  }

  return NextResponse.json({
    upload_url:        uploadUrl,
    path:              objectKey,
    storage_object_id: storageObjectId,
    provider,
    expires_in:        provider === 'r2' ? 300 : 60,
  }, { status: 201 })
}

// ─── GET /api/upload?path=... ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const path     = searchParams.get('path')
  const provider = (searchParams.get('provider') as 'supabase' | 'r2' | null) ?? getStorageProvider()

  if (!path) {
    return NextResponse.json({ error: 'path is required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const { downloadUrl, error: dlError } = await getPresignedDownloadUrl(
    path, provider, provider === 'supabase' ? supabase : undefined
  )

  if (dlError || !downloadUrl) {
    return NextResponse.json(
      { error: dlError ?? 'File not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  return NextResponse.json({ download_url: downloadUrl, provider, expires_in: 3600 })
}
