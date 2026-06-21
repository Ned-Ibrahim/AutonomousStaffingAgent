import { describe, expect, it } from 'vitest'
import type { CompanyContext } from '../supabase/functions/_shared/companies'
import {
  clampConfidence,
  contextRichness,
  makeAgentConfigStore,
  makePersonalityInference,
  neutralPersona,
  parseInferred,
  type AgentConfig,
  type AgentConfigsPort,
  type NewAgentConfig,
  type ProviderClient,
} from '../supabase/functions/_shared/personality'

// --- fixtures --------------------------------------------------------------

const company = (over: Partial<CompanyContext> = {}): CompanyContext => ({
  id: 'co-1',
  created_at: '2026-01-01T00:00:00Z',
  name: 'Acme',
  one_liner: 'We build rockets',
  about: null,
  culture_values: null,
  hiring_needs: null,
  candidate_profiles: null,
  recruiting_process: null,
  tone: 'direct',
  recruiting_goals: null,
  ...over,
})

const richCompany = () =>
  company({
    about: 'A 40-person launch-vehicle startup',
    culture_values: 'Ownership, candor, speed',
    hiring_needs: 'Senior propulsion and avionics engineers',
  })

const GOOD_JSON = JSON.stringify({
  persona: {
    traits: ['bold', 'technical'],
    voice_rules: ['Say the point first'],
    language_style: 'Crisp and candid',
    approaches_to_avoid: ['Corporate fluff'],
    recruiting_guidelines: ['Move quickly'],
  },
  confidence: 'high',
  assumptions: {
    known_facts: ['Builds launch vehicles'],
    inferred_assumptions: ['Engineers here value autonomy'],
  },
  rationale: 'Matches a direct, fast-moving rocket startup',
})

/** A provider returning a fixed response, recording whether it was called. */
function fakeProvider(response: string) {
  const state = { called: false }
  const provider: ProviderClient = {
    async complete() {
      state.called = true
      return response
    },
  }
  return { provider, state }
}

/** In-memory AgentConfigsPort so the store can be tested without a database. */
function fakePort(): AgentConfigsPort & { rows: AgentConfig[] } {
  const rows: AgentConfig[] = []
  let n = 0
  return {
    rows,
    async insert(config: NewAgentConfig) {
      const row: AgentConfig = { id: `cfg-${++n}`, created_at: `2026-02-0${n}T00:00:00Z`, ...config }
      rows.unshift(row)
      return row
    },
    async selectLatestByCompany(companyId: string) {
      return rows.find((r) => r.company_id === companyId) ?? null
    },
  }
}

// --- contextRichness -------------------------------------------------------

describe('contextRichness', () => {
  it('counts only non-empty prose fields', () => {
    expect(contextRichness(company())).toBe(0)
    expect(contextRichness(richCompany())).toBe(3)
    expect(contextRichness(company({ about: '   ' }))).toBe(0) // whitespace doesn't count
  })
})

// --- parseInferred ---------------------------------------------------------

describe('parseInferred', () => {
  it('parses a valid model response', () => {
    const out = parseInferred(GOOD_JSON)
    expect(out?.persona.traits).toEqual(['bold', 'technical'])
    expect(out?.confidence).toBe('high')
    expect(out?.assumptions.known_facts).toContain('Builds launch vehicles')
  })

  it('strips ```json fences before parsing', () => {
    const out = parseInferred('```json\n' + GOOD_JSON + '\n```')
    expect(out?.persona.traits).toEqual(['bold', 'technical'])
  })

  it('returns null for non-JSON', () => {
    expect(parseInferred('I think the persona should be...')).toBeNull()
  })

  it('returns null when the persona has no traits', () => {
    expect(parseInferred(JSON.stringify({ persona: { traits: [] } }))).toBeNull()
  })

  it('defaults an out-of-enum confidence to medium', () => {
    const out = parseInferred(JSON.stringify({ persona: { traits: ['x'] }, confidence: 'certain' }))
    expect(out?.confidence).toBe('medium')
  })
})

// --- clampConfidence -------------------------------------------------------

describe('clampConfidence', () => {
  it('forces low when there is no optional context', () => {
    expect(clampConfidence('high', 0)).toBe('low')
  })
  it('caps thin context at medium', () => {
    expect(clampConfidence('high', 2)).toBe('medium')
    expect(clampConfidence('low', 1)).toBe('low')
  })
  it('trusts the model once context is rich', () => {
    expect(clampConfidence('high', 3)).toBe('high')
  })
})

// --- inference -------------------------------------------------------------

describe('makePersonalityInference', () => {
  it('returns a structured persona from a valid model response', async () => {
    const { provider, state } = fakeProvider(GOOD_JSON)
    const out = await makePersonalityInference(provider).infer(richCompany())
    expect(state.called).toBe(true)
    expect(out.persona.traits).toEqual(['bold', 'technical'])
    expect(out.confidence).toBe('high')
    // facts vs. assumptions stay separated
    expect(out.assumptions.known_facts).not.toEqual(out.assumptions.inferred_assumptions)
  })

  it('skips the model entirely for sparse context and stays low-confidence', async () => {
    const { provider, state } = fakeProvider(GOOD_JSON)
    const out = await makePersonalityInference(provider).infer(company()) // richness 0
    expect(state.called).toBe(false)
    expect(out.confidence).toBe('low')
    expect(out.persona.traits).toEqual(neutralPersona(company()).persona.traits)
  })

  it('falls back to neutral when the model returns garbage (no crash)', async () => {
    const { provider } = fakeProvider('not json at all')
    const out = await makePersonalityInference(provider).infer(richCompany())
    expect(out.confidence).toBe('low')
    expect(out.persona.traits).toEqual(neutralPersona(richCompany()).persona.traits)
  })

  it('falls back to neutral when the model throws', async () => {
    const provider: ProviderClient = {
      async complete() {
        throw new Error('network down')
      },
    }
    const out = await makePersonalityInference(provider).infer(richCompany())
    expect(out.confidence).toBe('low')
  })

  it('uses the neutral persona when no provider is configured', async () => {
    const out = await makePersonalityInference(null).infer(richCompany())
    expect(out.confidence).toBe('low')
    expect(out.assumptions.known_facts.some((f) => f.includes('Acme'))).toBe(true)
  })

  it('clamps an over-confident model when context is thin', async () => {
    const { provider } = fakeProvider(GOOD_JSON) // claims "high"
    const out = await makePersonalityInference(provider).infer(company({ about: 'small team' })) // richness 1
    expect(out.confidence).toBe('medium')
  })
})

// --- store -----------------------------------------------------------------

describe('makeAgentConfigStore', () => {
  it('generates, persists, and reads back the latest persona', async () => {
    const port = fakePort()
    const store = makeAgentConfigStore(port, makePersonalityInference(fakeProvider(GOOD_JSON).provider))

    const generated = await store.generate(richCompany())
    expect(generated.id).toBeTruthy()
    expect(generated.company_id).toBe('co-1')

    const fetched = await store.getByCompany('co-1')
    expect(fetched).toEqual(generated)
  })

  it('returns the most recent persona after a regeneration', async () => {
    const port = fakePort()
    const store = makeAgentConfigStore(port, makePersonalityInference(fakeProvider(GOOD_JSON).provider))
    await store.generate(richCompany())
    const second = await store.generate(richCompany())
    expect(await store.getByCompany('co-1')).toEqual(second)
    expect(port.rows).toHaveLength(2)
  })

  it('returns null for a company with no persona', async () => {
    const store = makeAgentConfigStore(fakePort(), makePersonalityInference(null))
    expect(await store.getByCompany('missing')).toBeNull()
  })
})
