import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// POST /api/auth/logout
// Signs out the current user, clears the Supabase session cookie server-side,
// and redirects to /login. Must be called via fetch with credentials: 'include'
// so the Set-Cookie response headers are applied by the browser.
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()

  // Determine redirect destination — honour ?redirectTo if present
  const { searchParams } = new URL(req.url)
  const redirectTo = searchParams.get('redirectTo') ?? '/login'

  // Return a redirect response so the browser follows it automatically.
  // The createSupabaseServerClient() call above already attached Set-Cookie
  // headers (clearing the session) to the response via the SSR cookie handler.
  const response = NextResponse.redirect(new URL(redirectTo, req.url))

  // Belt-and-suspenders: explicitly expire the Supabase auth cookies in case
  // the SSR client missed any (e.g. project ref varies between environments).
  const cookiesToClear = [
    `sb-${process.env.SUPABASE_PROJECT_REF}-auth-token`,
    `sb-${process.env.SUPABASE_PROJECT_REF}-auth-token.0`,
    `sb-${process.env.SUPABASE_PROJECT_REF}-auth-token.1`,
  ]
  for (const name of cookiesToClear) {
    response.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}
