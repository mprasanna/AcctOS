import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()
  return new NextResponse(null, { status: 204 })
}
