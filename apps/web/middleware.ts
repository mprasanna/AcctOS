import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ─── Public route patterns ────────────────────────────────────────────────────
// These routes are accessible without a Supabase JWT.
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/portal/',        // token-gated, not JWT-gated
  '/api/webhooks/',      // signed by provider — not user JWT
]

const PUBLIC_PAGE_PREFIXES = [
  '/login',
  '/signup',
  '/portal/',            // client portal page
  '/auth/',              // accept-invite, etc.
]

function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p)) ||
    PUBLIC_PAGE_PREFIXES.some(p => pathname.startsWith(p))
  )
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const pathname = request.nextUrl.pathname

  // Public routes bypass Supabase session refresh
  if (isPublicRoute(pathname)) {
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Unauthenticated API request
  if (pathname.startsWith('/api/') && !user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // Unauthenticated page request → redirect to login
  if (!pathname.startsWith('/api/') && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user visiting login/signup → redirect to dashboard
  if ((pathname === '/login' || pathname === '/signup') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
