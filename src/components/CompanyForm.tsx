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

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-700">
        {label}
        {required && <span className="text-accent-500"> *</span>}
      </span>
      {children}
    </label>
  )
}

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
    <form className="card flex flex-col gap-4 p-5" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-base font-semibold text-ink-900">New company</h2>
        <p className="hint">Capture a company's context. Required: name, one-liner, tone.</p>
      </div>

      <Field label="Name" required>
        <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
      </Field>

      <Field label="One-liner" required>
        <input
          className="input"
          value={form.one_liner}
          onChange={(e) => set('one_liner', e.target.value)}
          placeholder="What the company does, in a sentence"
        />
      </Field>

      <Field label="Tone" required>
        <select className="input capitalize" value={form.tone} onChange={(e) => set('tone', e.target.value)}>
          <option value="">Select a tone…</option>
          {TONE_VALUES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      {PROSE_FIELDS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <textarea
            className="input min-h-[64px]"
            rows={2}
            value={form[key]}
            onChange={(e) => set(key, e.target.value)}
          />
        </Field>
      ))}

      {error && <span className="chip border border-red-200 bg-red-50 text-red-600">{error}</span>}

      <button type="submit" className="btn btn-primary self-start" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save company'}
      </button>
    </form>
  )
}
