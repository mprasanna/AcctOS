// app/api/portal/me/route.ts
// GET /api/portal/me
// Authenticated portal user — returns their profile + firm branding + client info.
// Called on every portal page load to hydrate the app shell.

import { NextRequest } from 'next/server'
import { getPortalUser, err, ok } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const { supabase, portalUser, error } = await getPortalUser(req)
  if (error) return err(error, 401)

  // Get firm branding
  const { data: settings } = await supabase
    .from('firm_settings')
    .select('portal_logo_url, portal_tagline')
    .eq('firm_id', portalUser!.firm_id)
    .single()

  // Get firm name
  const { data: firm } = await supabase
    .from('firms')
    .select('name')
    .eq('id', portalUser!.firm_id)
    .single()

  // Get client name
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, type')
    .eq('id', portalUser!.client_id)
    .single()

  return ok({
    portal_user: portalUser,
    firm: {
      name:     firm?.name ?? '',
      logo_url: settings?.portal_logo_url ?? null,
      tagline:  settings?.portal_tagline ?? 'Your secure accounting portal',
    },
    client: client ?? null,
  })
}
