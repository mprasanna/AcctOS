import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { refresh_token } = await req.json()

  if (!refresh_token) {
    return NextResponse.json(
      { error: 'refresh_token is required', code: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token })

  if (error || !data.session) {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  return NextResponse.json({
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
  })
}
