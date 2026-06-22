// Personality inference: turn a saved company context into a structured agent
// persona. Pure TypeScript (no Deno/Node APIs) so it is shared by the Edge
// Function (Deno), the frontend (Vite), and unit tests (Vitest).
//
// Two seams make this testable in isolation:
//   - ProviderClient  — the model call, swappable (real OpenAI vs. fake).
//   - AgentConfigsPort — persistence, swappable (Supabase vs. in-memory).
//
// Honesty guardrail: sparse context never fabricates a persona. With only the
// required fields present we skip the model entirely and return a neutral,
// low-confidence default; with partial context we clamp how confident the model
// is allowed to be. Known facts are kept separate from inferred assumptions.

import type { CompanyContext, Tone } from './companies.ts'

// --- contract --------------------------------------------------------------

export const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const
export type Confidence = (typeof CONFIDENCE_VALUES)[number]

/** The structured personality the agent gives itself. */
export interface Persona {
  traits: string[]
  voice_rules: string[]
  language_style: string
  approaches_to_avoid: string[]
  recruiting_guidelines: string[]
}

/** What the agent treats as told-to-it fact vs. its own reasonable guesses. */
export interface Assumptions {
  known_facts: string[]
  inferred_assumptions: string[]
}

/** The inference result, before it is persisted. */
export interface InferredPersona {
  persona: Persona
  confidence: Confidence
  assumptions: Assumptions
  rationale: string
}

export type NewAgentConfig = InferredPersona & { company_id: string }
export type AgentConfig = NewAgentConfig & { id: string; created_at: string }

// --- the model seam --------------------------------------------------------

/**
 * The single model call, abstracted so it can be swapped. The Edge Function
 * supplies a real OpenAI-backed client; tests supply a fake. A null provider
 * (no key configured) is a valid state — inference degrades to the neutral
 * default rather than failing.
 */
export interface ProviderClient {
  complete(req: {
    system: string
    user: string
    /**
     * Optional response shaping. With `schema`, the provider requests strict
     * structured output conforming to it. With `text: true`, plain natural-language
     * output (no JSON). With neither, a JSON object (the default this module relies on).
     */
    schema?: { name: string; schema: Record<string, unknown> }
    text?: boolean
  }): Promise<string>
}

// --- inference -------------------------------------------------------------

const VOICE_BY_TONE: Record<Tone, string> = {
  warm: 'Friendly and human; lead with empathy, keep it personable.',
  formal: 'Polished and precise; full sentences, no slang.',
  casual: 'Relaxed and conversational; plain words, light contractions.',
  direct: 'Concise and candid; say the point first, no padding.',
  playful: 'Light and upbeat; a touch of personality, never flippant.',
}

const PROSE_FIELDS: (keyof CompanyContext)[] = [
  'about',
  'culture_values',
  'hiring_needs',
  'candidate_profiles',
  'recruiting_process',
  'recruiting_goals',
]

/** How much optional context the company actually gave us (0–6). */
export function contextRichness(company: CompanyContext): number {
  return PROSE_FIELDS.filter((f) => {
    const v = company[f]
    return typeof v === 'string' && v.trim().length > 0
  }).length
}

/** A safe, non-fabricated persona derived only from required fields + tone. */
export function neutralPersona(company: CompanyContext): InferredPersona {
  return {
    persona: {
      traits: ['professional', 'clear', 'respectful'],
      voice_rules: [VOICE_BY_TONE[company.tone], 'Stay grounded in what the company actually told us.'],
      language_style: `Neutral professional, in a ${company.tone} tone.`,
      approaches_to_avoid: [
        'Making claims the company context does not support',
        'Over-promising on compensation, timelines, or outcomes',
      ],
      recruiting_guidelines: [
        'Represent the company accurately and modestly',
        'Ask clarifying questions when information is missing',
        'Escalate to a human recruiter when unsure',
      ],
    },
    confidence: 'low',
    assumptions: {
      known_facts: [`Name: ${company.name}`, `One-liner: ${company.one_liner}`, `Preferred tone: ${company.tone}`],
      inferred_assumptions: [
        'Limited company context was provided — defaulted to a neutral, professional persona to avoid unsupported specifics.',
      ],
    },
    rationale: 'Sparse context: used a neutral, professional default rather than inventing personality details.',
  }
}

function buildPrompt(company: CompanyContext): { system: string; user: string } {
  const system = [
    'You configure an autonomous recruiting agent by inferring its personality from a company context.',
    'Return ONLY a JSON object, no markdown, with this exact shape:',
    '{',
    '  "persona": { "traits": string[], "voice_rules": string[], "language_style": string,',
    '    "approaches_to_avoid": string[], "recruiting_guidelines": string[] },',
    '  "confidence": "high" | "medium" | "low",',
    '  "assumptions": { "known_facts": string[], "inferred_assumptions": string[] },',
    '  "rationale": string',
    '}',
    'Rules: ground every trait in the supplied context. Put things the company stated in known_facts',
    'and your own reasonable guesses in inferred_assumptions. Never invent compensation, perks, or',
    'specifics that are not implied by the context. Be honest in "confidence": low if context is thin.',
    `The company asked for a ${company.tone} tone — respect it in voice_rules.`,
  ].join('\n')

  const user = JSON.stringify({
    name: company.name,
    one_liner: company.one_liner,
    tone: company.tone,
    about: company.about,
    culture_values: company.culture_values,
    hiring_needs: company.hiring_needs,
    candidate_profiles: company.candidate_profiles,
    recruiting_process: company.recruiting_process,
    recruiting_goals: company.recruiting_goals,
  })

  return { system, user }
}

const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Strip ```json fences if the model added them, then JSON.parse. */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned)
}

/**
 * Validate + coerce a model response into an InferredPersona. Returns null if
 * the response is unusable (caller falls back to the neutral persona).
 */
export function parseInferred(text: string): InferredPersona | null {
  let raw: Record<string, unknown>
  try {
    raw = parseJsonLoose(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null

  const p = (raw.persona ?? {}) as Record<string, unknown>
  const traits = asStrArray(p.traits)
  // A persona with no traits at all is not usable.
  if (traits.length === 0) return null

  const a = (raw.assumptions ?? {}) as Record<string, unknown>
  const conf = asStr(raw.confidence).toLowerCase()
  const confidence: Confidence = (CONFIDENCE_VALUES as readonly string[]).includes(conf)
    ? (conf as Confidence)
    : 'medium'

  return {
    persona: {
      traits,
      voice_rules: asStrArray(p.voice_rules),
      language_style: asStr(p.language_style),
      approaches_to_avoid: asStrArray(p.approaches_to_avoid),
      recruiting_guidelines: asStrArray(p.recruiting_guidelines),
    },
    confidence,
    assumptions: {
      known_facts: asStrArray(a.known_facts),
      inferred_assumptions: asStrArray(a.inferred_assumptions),
    },
    rationale: asStr(raw.rationale),
  }
}

/** A model may not claim more confidence than the available context warrants. */
export function clampConfidence(modelConfidence: Confidence, richness: number): Confidence {
  if (richness === 0) return 'low'
  if (richness <= 2 && modelConfidence === 'high') return 'medium'
  return modelConfidence
}

export interface PersonalityInference {
  infer(company: CompanyContext): Promise<InferredPersona>
}

/**
 * Build the inference engine. `provider` may be null (no model configured), in
 * which case every company gets the neutral persona. With a provider, sparse
 * context still short-circuits to neutral (no fabrication), and the model's
 * confidence is clamped to what the context supports.
 */
export function makePersonalityInference(provider: ProviderClient | null): PersonalityInference {
  return {
    async infer(company) {
      const richness = contextRichness(company)
      // No optional context, or no model: don't invent — return the safe default.
      if (richness === 0 || !provider) return neutralPersona(company)

      let text: string
      try {
        text = await provider.complete(buildPrompt(company))
      } catch {
        return neutralPersona(company)
      }

      const parsed = parseInferred(text)
      if (!parsed) return neutralPersona(company)

      return { ...parsed, confidence: clampConfidence(parsed.confidence, richness) }
    },
  }
}

// --- persistence -----------------------------------------------------------

/**
 * Persistence port. The Edge Function supplies a Supabase-backed implementation;
 * tests supply an in-memory fake.
 */
export interface AgentConfigsPort {
  insert(config: NewAgentConfig): Promise<AgentConfig>
  selectLatestByCompany(companyId: string): Promise<AgentConfig | null>
}

export interface AgentConfigStore {
  generate(company: CompanyContext): Promise<AgentConfig>
  getByCompany(companyId: string): Promise<AgentConfig | null>
}

/** Store: infer a persona, then persist it. Latest config per company wins. */
export function makeAgentConfigStore(
  port: AgentConfigsPort,
  inference: PersonalityInference,
): AgentConfigStore {
  return {
    async generate(company) {
      const inferred = await inference.infer(company)
      return port.insert({ company_id: company.id, ...inferred })
    },
    getByCompany(companyId) {
      return port.selectLatestByCompany(companyId)
    },
  }
}

/** Minimal shape of the Supabase client methods the adapter uses. */
export interface SupabaseLike {
  // Left untyped so this module stays free of the supabase-js import (Deno must
  // bundle it). Exercised by live integration checks, not unit tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

/** Supabase-backed AgentConfigsPort used by the Edge Function. */
export function createSupabaseAgentConfigsPort(client: SupabaseLike): AgentConfigsPort {
  const table = () => client.from('agent_configs')
  return {
    async insert(config) {
      const { data, error } = await table().insert(config).select().single()
      if (error) throw new Error(error.message)
      return data as AgentConfig
    },
    async selectLatestByCompany(companyId) {
      const { data, error } = await table()
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as AgentConfig) ?? null
    },
  }
}
