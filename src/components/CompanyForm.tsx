import { useState } from 'react'
import { saveCompany } from '../lib/companies'
import {
  TONE_VALUES,
  type CompanyContext,
  type CompanyInput,
  type Tone,
} from '../../supabase/functions/_shared/companies'

type FormState = Record<keyof CompanyInput, string>

const EMPTY: FormState = {
  name: '',
  one_liner: '',
  tone: '',
  about: '',
  culture_values: '',
  hiring_needs: '',
  candidate_profiles: '',
  recruiting_process: '',
  recruiting_goals: '',
}

const PROSE_FIELDS: { key: keyof CompanyInput; label: string }[] = [
  { key: 'about', label: 'About' },
  { key: 'culture_values', label: 'Culture & values' },
  { key: 'hiring_needs', label: 'Hiring needs' },
  { key: 'candidate_profiles', label: 'Candidate profiles' },
  { key: 'recruiting_process', label: 'Recruiting process' },
  { key: 'recruiting_goals', label: 'Recruiting goals' },
]

export function CompanyForm({ onSaved }: { onSaved: (company: CompanyContext) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.one_liner.trim() || !form.tone) {
      setError('Name, one-liner, and tone are required.')
      return
    }
    setSubmitting(true)
    try {
      const payload: CompanyInput = { ...form, tone: form.tone as Tone }
      const saved = await saveCompany(payload)
      setForm(EMPTY)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form card" onSubmit={handleSubmit}>
      <h2>New company</h2>

      <label>
        Name <span className="req">*</span>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} />
      </label>

      <label>
        One-liner <span className="req">*</span>
        <input
          value={form.one_liner}
          onChange={(e) => set('one_liner', e.target.value)}
          placeholder="What the company does, in a sentence"
        />
      </label>

      <label>
        Tone <span className="req">*</span>
        <select value={form.tone} onChange={(e) => set('tone', e.target.value)}>
          <option value="">Select a tone…</option>
          {TONE_VALUES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {PROSE_FIELDS.map(({ key, label }) => (
        <label key={key}>
          {label}
          <textarea
            rows={2}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
          />
        </label>
      ))}

      {error && <p className="badge err">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save company'}
      </button>
    </form>
  )
}
