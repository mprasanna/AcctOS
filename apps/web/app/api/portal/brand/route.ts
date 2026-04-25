import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const token = req.nextUrl.searchParams.get('token')

  if (token) {
    const { data: invite } = await supabase
      .from('portal_invites')
      .select('firm_id, client_id, email, expires_at, used_at, clients(name), firms(name)')
      .eq('token', token)
      .single()

    if (!invite) return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 404 })
    if (invite.used_at) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 })
    if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })

    const { data: settings } = await supabase
      .from('firm_settings')
      .select('portal_logo_url, portal_tagline')
      .eq('firm_id', invite.firm_id)
      .single()

    return NextResponse.json({
      firm_name:   (invite.firms as any)?.name ?? '',
      logo_url:    settings?.portal_logo_url ?? null,
      tagline:     settings?.portal_tagline ?? 'Your secure accounting portal',
      client_name: (invite.clients as any)?.name ?? null,
      email:       invite.email,
    })
  }

  return NextResponse.json({ firm_name: null, logo_url: null, tagline: 'Your secure accounting portal', client_name: null })
}
