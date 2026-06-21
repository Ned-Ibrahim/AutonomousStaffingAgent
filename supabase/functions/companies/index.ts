// Companies Edge Function (Deno). Persists and reads company context.
//   POST /companies        -> create from JSON body, returns the saved record (201)
//   GET  /companies         -> list all, newest first
//   GET  /companies?id=...  -> fetch one by id (404 if absent)
// Validation lives in the shared ContextStore; malformed input returns 400.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  createSupabasePort,
  makeContextStore,
  ValidationError,
} from '../_shared/companies.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const store = makeContextStore(createSupabasePort(client))

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const record = await store.save(body)
      return json(record, 201)
    }

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id')
      if (id) {
        const record = await store.getById(id)
        return record ? json(record) : json({ error: 'not found' }, 404)
      }
      return json(await store.list())
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: 'validation failed', details: e.errors }, 400)
    return json({ error: String(e) }, 500)
  }
})
