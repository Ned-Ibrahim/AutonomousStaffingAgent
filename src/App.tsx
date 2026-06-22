import { useEffect, useState } from 'react'
import { CompanyForm } from './components/CompanyForm'
import { PersonaPanel } from './components/PersonaPanel'
import { TestArea } from './components/TestArea'
import { Badge } from '@/components/ui'
import { listCompanies } from './lib/companies'
import { generateAgent, getAgentConfig } from './lib/personality'
import type { CompanyContext } from '../supabase/functions/_shared/companies'
import type { AgentConfig } from '../supabase/functions/_shared/personality'

function App() {
  const [companies, setCompanies] = useState<CompanyContext[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<Record<string, AgentConfig>>({})
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [genError, setGenError] = useState<Record<string, string>>({})

  useEffect(() => {
    listCompanies()
      .then(async (list) => {
        setCompanies(list)
        // Load any personas already generated, so they survive a reload.
        const entries = await Promise.all(
          list.map(async (c) => [c.id, await getAgentConfig(c.id).catch(() => null)] as const),
        )
        setConfigs(Object.fromEntries(entries.filter(([, cfg]) => cfg) as [string, AgentConfig][]))
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function handleGenerate(companyId: string) {
    setGenError((prev) => ({ ...prev, [companyId]: '' }))
    setGenerating((prev) => ({ ...prev, [companyId]: true }))
    try {
      const config = await generateAgent(companyId)
      setConfigs((prev) => ({ ...prev, [companyId]: config }))
    } catch (e) {
      setGenError((prev) => ({ ...prev, [companyId]: e instanceof Error ? e.message : 'Generation failed' }))
    } finally {
      setGenerating((prev) => ({ ...prev, [companyId]: false }))
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-ink-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-6">
          <h1 className="text-xl font-bold tracking-tight text-ink-900">Autonomous Staffing Agent</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
            Capture a company's context, configure its recruiting agent, then watch the agent plan and
            write candidate outreach — reasoning out loud, grounded in what the company actually told it.
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-8">
        {/* Companies: intake + saved list with inferred personas */}
        <section className="grid gap-6 lg:grid-cols-2">
          <CompanyForm onSaved={(c) => setCompanies((prev) => [c, ...prev])} />

          <div className="card flex flex-col gap-4 p-5">
            <h2 className="text-base font-semibold text-ink-900">Companies</h2>
            {loadError && (
              <span className="chip border border-red-200 bg-red-50 text-red-600">{loadError}</span>
            )}
            {!loadError && companies.length === 0 && (
              <p className="text-sm text-ink-400">No companies yet — add one to begin.</p>
            )}
            <ul className="flex flex-col gap-4">
              {companies.map((c) => {
                const config = configs[c.id]
                const busy = generating[c.id]
                return (
                  <li key={c.id} className="rounded-xl border border-ink-200/70 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-ink-900">{c.name}</strong>
                      <Badge className="capitalize">{c.tone}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">{c.one_liner}</p>

                    {config && <PersonaPanel config={config} />}
                    {genError[c.id] && (
                      <span className="chip mt-3 border border-red-200 bg-red-50 text-red-600">
                        {genError[c.id]}
                      </span>
                    )}

                    <button
                      className="btn btn-subtle mt-3"
                      disabled={busy}
                      onClick={() => handleGenerate(c.id)}
                    >
                      {busy ? 'Generating…' : config ? 'Regenerate agent' : 'Generate agent'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>

        {/* Agent Test Area: point a configured agent at a candidate, watch turn 0 */}
        <section>
          <TestArea companies={companies} configs={configs} />
        </section>
      </main>
    </div>
  )
}

export default App
