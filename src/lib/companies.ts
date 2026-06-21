import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { CompanyContext, CompanyInput } from '../../supabase/functions/_shared/companies'

/** Read a useful message out of a non-2xx Edge Function response. */
async function describeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.details?.length) return body.details.join(', ')
    if (body?.error) return String(body.error)
  }
  return error instanceof Error ? error.message : 'Request failed'
}

/** Persist a company context. Throws with a readable message on validation/HTTP error. */
export async function saveCompany(input: CompanyInput): Promise<CompanyContext> {
  const { data, error } = await supabase.functions.invoke('companies', { body: input })
  if (error) throw new Error(await describeError(error))
  return data as CompanyContext
}

/** List saved companies, newest first. */
export async function listCompanies(): Promise<CompanyContext[]> {
  const { data, error } = await supabase.functions.invoke('companies', { method: 'GET' })
  if (error) throw new Error(await describeError(error))
  return (data as CompanyContext[]) ?? []
}
