// ============================================================
// AcctOS — Cloudflare R2 Storage Adapter
// Drop-in replacement for Supabase Storage.
// Activated by setting STORAGE_PROVIDER=r2 in environment.
//
// Uses the S3-compatible API that R2 exposes.
// No egress fees. Lifecycle tiers tracked in r2_objects table.
//
// Required env vars:
//   R2_ACCOUNT_ID       — Cloudflare account ID
//   R2_ACCESS_KEY_ID    — R2 API token (read-write)
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME      — e.g. "acct-os-documents"
//   R2_PUBLIC_DOMAIN    — custom domain for signed URLs (optional)
// ============================================================

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ────────────────────────────────────────────────────────────
// R2 CLIENT
// ────────────────────────────────────────────────────────────

function getR2Client(): S3Client {
  const accountId       = process.env.R2_ACCOUNT_ID
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 credentials missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.'
    )
  }

  return new S3Client({
    region:   'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

const BUCKET = process.env.R2_BUCKET_NAME ?? 'acct-os-documents'

// ────────────────────────────────────────────────────────────
// STORAGE INTERFACE (matches Supabase Storage usage)
// ────────────────────────────────────────────────────────────

export interface PresignedUploadResult {
  uploadUrl:  string
  key:        string
  expiresIn:  number
}

export interface PresignedDownloadResult {
  downloadUrl: string
  expiresIn:   number
}

export interface StorageError {
  message: string
}

// ────────────────────────────────────────────────────────────
// GET PRESIGNED UPLOAD URL
// Client uses this to upload directly to R2 (no server proxy).
// ────────────────────────────────────────────────────────────

export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 300
): Promise<{ data: PresignedUploadResult | null; error: StorageError | null }> {
  try {
    const client = getR2Client()
    const cmd    = new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      ContentType: contentType,
    })

    const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds })

    return {
      data: { uploadUrl, key, expiresIn: expiresInSeconds },
      error: null,
    }
  } catch (err: any) {
    return { data: null, error: { message: err.message } }
  }
}

// ────────────────────────────────────────────────────────────
// GET PRESIGNED DOWNLOAD URL
// ────────────────────────────────────────────────────────────

export async function getDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<{ data: PresignedDownloadResult | null; error: StorageError | null }> {
  try {
    const client = getR2Client()
    const cmd    = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const downloadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds })

    return {
      data: { downloadUrl, expiresIn: expiresInSeconds },
      error: null,
    }
  } catch (err: any) {
    return { data: null, error: { message: err.message } }
  }
}

// ────────────────────────────────────────────────────────────
// DELETE OBJECT
// ────────────────────────────────────────────────────────────

export async function deleteObject(
  key: string
): Promise<{ error: StorageError | null }> {
  try {
    const client = getR2Client()
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    return { error: null }
  } catch (err: any) {
    return { error: { message: err.message } }
  }
}

// ────────────────────────────────────────────────────────────
// UNIFIED STORAGE PROVIDER
// Returns the correct implementation based on STORAGE_PROVIDER env var.
// All API routes use this — swap providers without changing route code.
// ────────────────────────────────────────────────────────────

export type StorageProvider = 'supabase' | 'r2'

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'supabase'
  if (provider !== 'supabase' && provider !== 'r2') {
    console.warn(`Unknown STORAGE_PROVIDER "${provider}" — defaulting to supabase`)
    return 'supabase'
  }
  return provider
}

// ────────────────────────────────────────────────────────────
// UNIFIED PRESIGNED URL (provider-agnostic)
// Used by POST /api/upload
// ────────────────────────────────────────────────────────────

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  provider: StorageProvider,
  supabaseClient?: any  // SupabaseClient, passed when provider === 'supabase'
): Promise<{ uploadUrl: string | null; error: string | null }> {
  if (provider === 'r2') {
    const result = await getUploadUrl(key, contentType)
    return { uploadUrl: result.data?.uploadUrl ?? null, error: result.error?.message ?? null }
  }

  // Supabase Storage
  if (!supabaseClient) return { uploadUrl: null, error: 'Supabase client required for supabase provider' }
  const { data, error } = await supabaseClient.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'client-documents')
    .createSignedUploadUrl(key)

  return { uploadUrl: data?.signedUrl ?? null, error: error?.message ?? null }
}

export async function getPresignedDownloadUrl(
  key: string,
  provider: StorageProvider,
  supabaseClient?: any
): Promise<{ downloadUrl: string | null; error: string | null }> {
  if (provider === 'r2') {
    const result = await getDownloadUrl(key)
    return { downloadUrl: result.data?.downloadUrl ?? null, error: result.error?.message ?? null }
  }

  if (!supabaseClient) return { downloadUrl: null, error: 'Supabase client required' }
  const { data, error } = await supabaseClient.storage
    .from(process.env.SUPABASE_STORAGE_BUCKET ?? 'client-documents')
    .createSignedUrl(key, 3600)

  return { downloadUrl: data?.signedUrl ?? null, error: error?.message ?? null }
}

// ────────────────────────────────────────────────────────────
// LIFECYCLE TIER MANAGEMENT
// CRA requires 7-year document retention.
// Tier transitions are tracked in r2_objects table and executed
// via the Cloudflare R2 API (no automatic lifecycle rules in R2).
//
// Run manually or via a monthly cron job:
//   Standard → Infrequent Access: after 2 years
//   Infrequent → Archive:         after 4 years
// ────────────────────────────────────────────────────────────

export interface TierTransitionCandidate {
  id:           string
  key:          string
  current_tier: string
  target_tier:  string
  created_at:   string
}

export async function getObjectsForTierTransition(
  supabaseAdminClient: any
): Promise<TierTransitionCandidate[]> {
  const now       = new Date()
  const twoYears  = new Date(now.getTime() - 2 * 365.25 * 86_400_000)
  const fourYears = new Date(now.getTime() - 4 * 365.25 * 86_400_000)

  const [standardResult, infrequentResult] = await Promise.all([
    // Standard → Infrequent (> 2 years)
    supabaseAdminClient
      .from('r2_objects')
      .select('id, key, storage_tier, created_at')
      .eq('storage_tier', 'standard')
      .lt('created_at', twoYears.toISOString()),

    // Infrequent → Archive (> 4 years)
    supabaseAdminClient
      .from('r2_objects')
      .select('id, key, storage_tier, created_at')
      .eq('storage_tier', 'infrequent')
      .lt('created_at', fourYears.toISOString()),
  ])

  const candidates: TierTransitionCandidate[] = [
    ...(standardResult.data ?? []).map((o: any) => ({ ...o, current_tier: 'standard', target_tier: 'infrequent' })),
    ...(infrequentResult.data ?? []).map((o: any) => ({ ...o, current_tier: 'infrequent', target_tier: 'archive' })),
  ]

  return candidates
}

// Note: R2 does not have native object tagging-based lifecycle rules.
// Tier transitions are tracked in r2_objects.storage_tier and can be
// enforced by migrating objects to separate R2 buckets per tier
// (standard / infrequent-access / archive) — or by using Cloudflare's
// D1 + Workers to implement lifecycle logic.
// Full implementation in Phase 4 post-PMF.
