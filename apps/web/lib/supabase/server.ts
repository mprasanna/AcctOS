import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// ─── Server client ────────────────────────────────────────────────────────────
// Uses the anon key + cookie-based session (for Server Components / Route Handlers)
// Still governed by RLS. Use for all normal data access.

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // Read-only cookie store in middleware — safe to ignore
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Same as above
          }
        },
      },
    }
  )
}

// ─── Admin client ─────────────────────────────────────────────────────────────
// Uses SERVICE_ROLE_KEY — BYPASSES all Row Level Security.
// Use ONLY for:
//   • Edge Functions that run outside user context
//   • Admin operations (e.g., creating firm + first user atomically)
//   • NEVER accessible from the browser bundle
//
// If you find yourself reaching for this in a React component, STOP.

export function createSupabaseAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Admin client cannot be initialised.'
    )
  }
  // Import createClient directly (not SSR variant) since service role ignores cookies
  const { createClient } = require('@supabase/supabase-js')
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
