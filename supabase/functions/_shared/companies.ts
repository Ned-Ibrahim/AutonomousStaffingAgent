// Shared company-context contract + ContextStore. Pure TypeScript — no Deno or
// Node APIs — so it is imported by the Edge Function (Deno), the React frontend
// (Vite), and the unit tests (Vitest) alike. The published data contract for the
// company-context feature lives here.

export const TONE_VALUES = ['warm', 'formal', 'casual', 'direct', 'playful'] as const
export type Tone = (typeof TONE_VALUES)[number]

/** A persisted company context record. */
export interface CompanyContext {
  id: string
  created_at: string
  name: string
  one_liner: string
  about: string | null
  culture_values: string | null
  hiring_needs: string | null
  candidate_profiles: string | null
  recruiting_process: string | null
  tone: Tone
  recruiting_goals: string | null
}

/** The writable fields of a company context (everything except server-set id/created_at). */
export type CompanyInput = Omit<CompanyContext, 'id' | 'created_at'>

export interface ValidationResult {
  ok: boolean
  errors: string[]
  /** Present only when ok: the normalized input ready to persist. */
  value?: CompanyInput
}

const optionalFields = [
  'about',
  'culture_values',
  'hiring_needs',
  'candidate_profiles',
  'recruiting_process',
  'recruiting_goals',
] as const

/**
 * Validate and normalize raw intake. Required: name, one_liner, tone (in enum).
 * Everything else is optional — thin context is allowed (the agent degrades
 * gracefully later). Trims strings; empty optional fields become null.
 */
export function validateCompanyInput(raw: unknown): ValidationResult {
  const errors: string[] = []
  const input = (raw ?? {}) as Record<string, unknown>

  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const name = str(input.name)
  const one_liner = str(input.one_liner)
  const tone = str(input.tone)

  if (!name) errors.push('name is required')
  if (!one_liner) errors.push('one_liner is required')
  if (!tone) errors.push('tone is required')
  else if (!(TONE_VALUES as readonly string[]).includes(tone)) {
    errors.push(`tone must be one of: ${TONE_VALUES.join(', ')}`)
  }

  if (errors.length) return { ok: false, errors }

  const value: CompanyInput = {
    name,
    one_liner,
    tone: tone as Tone,
    about: null,
    culture_values: null,
    hiring_needs: null,
    candidate_profiles: null,
    recruiting_process: null,
    recruiting_goals: null,
  }
  for (const field of optionalFields) {
    const v = str(input[field])
    value[field] = v ? v : null
  }

  return { ok: true, errors: [], value }
}

/** Thrown by ContextStore.save when input fails validation. */
export class ValidationError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(errors.join('; '))
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/**
 * Persistence port. The Edge Function supplies a Supabase-backed implementation;
 * tests supply an in-memory fake. Keeps ContextStore's logic decoupled from any
 * particular database client so it can be unit-tested in isolation.
 */
export interface CompaniesPort {
  insert(input: CompanyInput): Promise<CompanyContext>
  selectById(id: string): Promise<CompanyContext | null>
  selectAll(): Promise<CompanyContext[]>
}

export interface ContextStore {
  save(raw: unknown): Promise<CompanyContext>
  getById(id: string): Promise<CompanyContext | null>
  list(): Promise<CompanyContext[]>
}

/** ContextStore: validates on save, then delegates persistence to the port. */
export function makeContextStore(port: CompaniesPort): ContextStore {
  return {
    async save(raw) {
      const result = validateCompanyInput(raw)
      if (!result.ok || !result.value) throw new ValidationError(result.errors)
      return port.insert(result.value)
    },
    getById(id) {
      return port.selectById(id)
    },
    list() {
      return port.selectAll()
    },
  }
}

/** Minimal shape of the Supabase client methods the adapter uses. */
export interface SupabaseLike {
  // The query builder is intentionally left untyped: this module must stay free
  // of the supabase-js import so Deno can bundle it for the Edge runtime. The
  // adapter below is exercised by live integration checks, not unit tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

/** Supabase-backed CompaniesPort used by the Edge Function. */
export function createSupabasePort(client: SupabaseLike): CompaniesPort {
  const table = () => client.from('companies')
  return {
    async insert(input) {
      const { data, error } = await table().insert(input).select().single()
      if (error) throw new Error(error.message)
      return data as CompanyContext
    },
    async selectById(id) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as CompanyContext) ?? null
    },
    async selectAll() {
      const { data, error } = await table().select('*').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as CompanyContext[]) ?? []
    },
  }
}
