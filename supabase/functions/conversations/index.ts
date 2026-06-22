// Conversations Edge Function (Deno). Runs the decision loop for turn 0 — the
// agent's opening outreach — server-side, where the OpenAI key stays.
//   POST /conversations { company_id, candidate: { name, role?, context? } }
//        -> interpret (decide) -> ground-check -> write -> persist
//        -> 201 { conversation, message, decision, grounding }
//   GET  /conversations?id=...   -> { conversation, messages } (404 if absent)
// No message is ever sent to a real channel; it is stored for display only.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { createSupabasePort } from '../_shared/companies.ts'
import { createSupabaseAgentConfigsPort } from '../_shared/personality.ts'
import {
  createSupabaseConversationsPort,
  makeConversationEngineFromProvider,
  type CandidateInput,
} from '../_shared/conversation.ts'
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

function parseCandidate(raw: unknown): CandidateInput | null {
  const c = (raw ?? {}) as Record<string, unknown>
  const name = typeof c.name === 'string' ? c.name.trim() : ''
  if (!name) return null
  const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { name, role: opt(c.role), context: opt(c.context) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const companies = createSupabasePort(client)
  const agentConfigs = createSupabaseAgentConfigsPort(client)
  const conversationsPort = createSupabaseConversationsPort(client)

  const key = Deno.env.get('OPENAI_API_KEY')
  const provider = key ? createOpenAIProvider(key) : null
  const engine = makeConversationEngineFromProvider(provider, conversationsPort)

  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))

      // Reply turn: an existing conversation + a new candidate message.
      const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : ''
      if (conversationId) {
        const candidateMessage =
          typeof body?.candidate_message === 'string' ? body.candidate_message.trim() : ''
        if (!candidateMessage) return json({ error: 'candidate_message is required' }, 400)

        const conversation = await conversationsPort.getConversation(conversationId)
        if (!conversation) return json({ error: 'conversation not found' }, 404)
        if (conversation.status === 'stopped') {
          return json({ error: 'conversation has ended' }, 409)
        }

        const company = await companies.selectById(conversation.company_id)
        if (!company) return json({ error: 'company not found' }, 404)
        const config = await agentConfigs.selectLatestByCompany(conversation.company_id)
        if (!config) return json({ error: 'no agent configured for this company' }, 409)

        const result = await engine.replyTurn({
          conversationId,
          company,
          persona: config.persona,
          candidateMessage,
        })
        return json(result, 201)
      }

      // Opening turn: a company + a candidate to reach out to.
      const companyId = typeof body?.company_id === 'string' ? body.company_id : ''
      if (!companyId) return json({ error: 'company_id is required' }, 400)

      const candidate = parseCandidate(body?.candidate)
      if (!candidate) return json({ error: 'candidate.name is required' }, 400)

      const company = await companies.selectById(companyId)
      if (!company) return json({ error: 'company not found' }, 404)

      const config = await agentConfigs.selectLatestByCompany(companyId)
      if (!config) return json({ error: 'no agent configured for this company; generate one first' }, 409)

      const result = await engine.openingTurn({
        company,
        persona: config.persona,
        agentConfigId: config.id,
        candidate,
      })
      return json(result, 201)
    }

    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('id')
      if (!id) return json({ error: 'id is required' }, 400)
      const conversation = await conversationsPort.getConversation(id)
      if (!conversation) return json({ error: 'conversation not found' }, 404)
      const messages = await conversationsPort.listMessages(id)
      return json({ conversation, messages })
    }

    return json({ error: 'method not allowed' }, 405)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
