// lib/supabase/portal.ts
// Portal-specific Supabase client using a DIFFERENT cookie name from the firm client.
//
// Firm session:   sb-<ref>-auth-token         (default Supabase name)
// Portal session: portal-sb-<ref>-auth-token  (prefixed with 'portal')
//
// This means an accountant can be logged into the firm dashboard AND test the
// business owner portal in the same browser without sessions overwriting each other.
//
// All portal API routes MUST use createSupabasePortalClient() from this file.
// All firm API routes use createSupabaseServerClient() from lib/supabase/server.ts.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createSupabasePortalClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: 'portal',  // ← the only difference from createSupabaseServerClient
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}
