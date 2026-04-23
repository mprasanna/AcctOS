import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// ─── Browser client ───────────────────────────────────────────────────────────
// Uses anon key — governed by Row Level Security.
// Safe to use in React components and client-side hooks.

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function getSupabaseBrowserClient() {
  if (client) return client
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return client
}

// Convenience export for direct use
export const supabase = getSupabaseBrowserClient()
