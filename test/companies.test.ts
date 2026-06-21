import { describe, expect, it } from 'vitest'
import {
  makeContextStore,
  validateCompanyInput,
  ValidationError,
  type CompaniesPort,
  type CompanyContext,
  type CompanyInput,
} from '../supabase/functions/_shared/companies'

// In-memory CompaniesPort so ContextStore can be tested without a database.
function fakePort(): CompaniesPort & { rows: CompanyContext[] } {
  const rows: CompanyContext[] = []
  let n = 0
  return {
    rows,
    async insert(input: CompanyInput) {
      const row: CompanyContext = { id: `id-${++n}`, created_at: `2026-01-0${n}T00:00:00Z`, ...input }
      rows.unshift(row)
      return row
    },
    async selectById(id: string) {
      return rows.find((r) => r.id === id) ?? null
    },
    async selectAll() {
      return [...rows]
    },
  }
}

const valid = (): Record<string, unknown> => ({
  name: 'Acme',
  one_liner: 'We build rockets',
  tone: 'direct',
})

describe('validateCompanyInput', () => {
  it('accepts required fields and normalizes optionals to null', () => {
    const result = validateCompanyInput(valid())
    expect(result.ok).toBe(true)
    expect(result.value).toMatchObject({ name: 'Acme', one_liner: 'We build rockets', tone: 'direct' })
    expect(result.value?.about).toBeNull()
    expect(result.value?.recruiting_goals).toBeNull()
  })

  it('trims whitespace and keeps non-empty optionals', () => {
    const result = validateCompanyInput({ ...valid(), name: '  Acme  ', about: '  cool place  ' })
    expect(result.value?.name).toBe('Acme')
    expect(result.value?.about).toBe('cool place')
  })

  it('rejects missing required fields', () => {
    const result = validateCompanyInput({ tone: 'warm' })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('name is required')
    expect(result.errors).toContain('one_liner is required')
  })

  it('rejects a tone outside the enum', () => {
    const result = validateCompanyInput({ ...valid(), tone: 'sarcastic' })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.startsWith('tone must be one of'))).toBe(true)
  })

  it('treats a whitespace-only name as missing', () => {
    const result = validateCompanyInput({ ...valid(), name: '   ' })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('name is required')
  })
})

describe('makeContextStore', () => {
  it('saves and reads back by id (round-trip)', async () => {
    const store = makeContextStore(fakePort())
    const saved = await store.save(valid())
    expect(saved.id).toBeTruthy()
    const fetched = await store.getById(saved.id)
    expect(fetched).toEqual(saved)
  })

  it('throws ValidationError on malformed input and persists nothing', async () => {
    const port = fakePort()
    const store = makeContextStore(port)
    await expect(store.save({ tone: 'nope' })).rejects.toBeInstanceOf(ValidationError)
    expect(port.rows).toHaveLength(0)
  })

  it('lists saved companies', async () => {
    const store = makeContextStore(fakePort())
    await store.save(valid())
    await store.save({ ...valid(), name: 'Globex' })
    const all = await store.list()
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.name)).toContain('Globex')
  })

  it('returns null from getById when absent', async () => {
    const store = makeContextStore(fakePort())
    expect(await store.getById('missing')).toBeNull()
  })
})
