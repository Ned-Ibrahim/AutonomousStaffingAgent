import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AgentConfig } from '../../supabase/functions/_shared/personality'

/** Read a useful message out of a non-2xx Edge Function response. */
async function describeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) return String(body.error)
  }
  return error instanceof Error ? error.message : 'Request failed'
}

/** Generate (infer + persist) an agent persona for a company. */
export async function generateAgent(companyId: string): Promise<AgentConfig> {
  const { data, error } = await supabase.functions.invoke('agent-configs', {
    body: { company_id: companyId },
  })
  if (error) throw new Error(await describeError(error))
  return data as AgentConfig
}

/** Fetch the latest saved persona for a company, or null if none exists yet. */
export async function getAgentConfig(companyId: string): Promise<AgentConfig | null> {
  const { data, error } = await supabase.functions.invoke(
    `agent-configs?company_id=${encodeURIComponent(companyId)}`,
    { method: 'GET' },
  )
  if (error) {
    // 404 = no persona generated yet; that is an expected, non-error state.
    if (error instanceof FunctionsHttpError && error.context.status === 404) return null
    throw new Error(await describeError(error))
  }
  return (data as AgentConfig) ?? null
}
