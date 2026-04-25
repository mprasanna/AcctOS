// app/api/settings/portal/logo/route.ts
// POST /api/settings/portal/logo  — upload firm logo
// DELETE /api/settings/portal/logo — remove firm logo

import { NextRequest, NextResponse } from 'next/server'
import { getFirmUser, getAdminClient, err, ok } from '@/lib/portal-auth'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export async function POST(req: NextRequest) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  // Only owners and senior CPAs can update branding
  if (!['owner', 'senior_accountant'].includes(firmUser!.role)) {
    return err('Insufficient permissions', 403)
  }

  const formData = await req.formData()
  const file = formData.get('logo') as File | null

  if (!file) return err('No file provided')
  if (!ALLOWED_TYPES.includes(file.type)) return err('Invalid file type. PNG, JPG, or SVG only.')
  if (file.size > MAX_SIZE_BYTES) return err('File too large. Maximum size is 2MB.')

  const ext = file.type === 'image/svg+xml' ? 'svg'
              : file.type === 'image/png' ? 'png' : 'jpg'

  const storagePath = `firm-logos/${firmUser!.firm_id}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Upload to Supabase Storage (public bucket 'firm-logos')
  const { error: uploadErr } = await supabase.storage
    .from('firm-logos')
    .upload(storagePath, buffer, {
      contentType:  file.type,
      upsert:       true,  // overwrite if exists
    })

  if (uploadErr) return err(`Upload failed: ${uploadErr.message}`, 500)

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('firm-logos')
    .getPublicUrl(storagePath)

  const logoUrl = urlData.publicUrl

  // Update firm_settings
  const admin = getAdminClient()
  const { error: updateErr } = await admin
    .from('firm_settings')
    .update({ portal_logo_url: logoUrl })
    .eq('firm_id', firmUser!.firm_id)

  if (updateErr) return err('Failed to save logo URL', 500)

  return ok({ logo_url: logoUrl })
}

export async function DELETE(req: NextRequest) {
  const { supabase, firmUser, error } = await getFirmUser(req)
  if (error) return err(error, 401)

  if (!['owner', 'senior_accountant'].includes(firmUser!.role)) {
    return err('Insufficient permissions', 403)
  }

  // Try to remove all logo variants from storage
  for (const ext of ['png', 'jpg', 'svg']) {
    await supabase.storage
      .from('firm-logos')
      .remove([`firm-logos/${firmUser!.firm_id}.${ext}`])
  }

  // Clear the URL in firm_settings
  const admin = getAdminClient()
  await admin
    .from('firm_settings')
    .update({ portal_logo_url: null })
    .eq('firm_id', firmUser!.firm_id)

  return ok({ ok: true })
}
