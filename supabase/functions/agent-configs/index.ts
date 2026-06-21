// Agent-config Edge Function (Deno). Infers and persists an agent persona.
//   POST /agent-configs { company_id }   -> generate + save a persona (201)
//   GET  /agent-configs?company_id=...    -> latest saved persona (404 if none)
// The model is called here, server-side, through the ProviderClient seam — the
// OpenAI key never leaves the Edge runtime. If no key is configured the
// inference degrades to a neutral, low-confidence persona instead of failing.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createSupabasePort } from '../_shared/companies.ts'
import {
  createSupabaseAgentConfigsPort,
  makeAgentConfigStore,
  makePersonalityInference,
} from '../_shared/personality.ts'
import { createOpenAIProvider } from '../_shared/provider.ts'

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
  const companies = createSupabasePort(client)

  // Real model when a key is present; null (→ neutral persona) when it is not.
  const key = Deno.env.get('OPENAI_API_KEY')
  const provider = key ? createOpenAIProvider(key) : null
  const inference = makePersonalityInference(provider)
  const store = makeAgentConfigStore(createSupabaseAgentConfigsPort(client), inference)

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const companyId = typeof body?.company_id === 'string' ? body.company_id : ''
      if (!companyId) return json({ error: 'company_id is required' }, 400)

      const company = await companies.selectById(companyId)
      if (!company) return json({ error: 'company not found' }, 404)

      const config = await store.generate(company)
      return json(config, 201)
    }

    if (req.method === 'GET') {
      const companyId = new URL(req.url).searchParams.get('company_id')
      if (!companyId) return json({ error: 'company_id is required' }, 400)
      const config = await store.getByCompany(companyId)
      return config ? json(config) : json({ error: 'no config for company' }, 404)
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
