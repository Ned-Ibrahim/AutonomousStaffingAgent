import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client. Only the public URL and anon key live here —
// both are safe to expose to the browser. Server-only secrets (service-role
// key, LLM provider keys) never touch the frontend; they live in Edge
// Function secrets and are used server-side only.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loud in dev rather than sending undefined to the SDK.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

export const supabase = createClient(url, anonKey)
