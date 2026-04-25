import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email } = body
  if (!email) return NextResponse.json({ ok: true })

  const supabase = createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/portal/reset-password`,
  })
  return NextResponse.json({ ok: true })
}
