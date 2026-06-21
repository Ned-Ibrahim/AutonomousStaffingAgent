import { useEffect, useState } from 'react'
import { CompanyForm } from './components/CompanyForm'
import { PersonaPanel } from './components/PersonaPanel'
import { listCompanies } from './lib/companies'
import { generateAgent, getAgentConfig } from './lib/personality'
import type { CompanyContext } from '../supabase/functions/_shared/companies'
import type { AgentConfig } from '../supabase/functions/_shared/personality'
import './App.css'

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
    <main className="shell">
      <header>
        <h1>Autonomous Staffing Agent</h1>
        <p className="tagline">Capture a company's context, then let its recruiting agent configure itself.</p>
      </header>

      <div className="layout">
        <CompanyForm onSaved={(c) => setCompanies((prev) => [c, ...prev])} />

        <section className="card">
          <h2>Saved companies</h2>
          {loadError && <p className="badge err">{loadError}</p>}
          {!loadError && companies.length === 0 && <p className="muted">None yet.</p>}
          <ul className="company-list">
            {companies.map((c) => {
              const config = configs[c.id]
              const busy = generating[c.id]
              return (
                <li key={c.id}>
                  <div className="company-head">
                    <strong>{c.name}</strong>
                    <span className="tone-pill">{c.tone}</span>
                  </div>
                  <p className="muted">{c.one_liner}</p>

                  {config && <PersonaPanel config={config} />}
                  {genError[c.id] && <p className="badge err">{genError[c.id]}</p>}

                  <button className="generate-btn" disabled={busy} onClick={() => handleGenerate(c.id)}>
                    {busy ? 'Generating…' : config ? 'Regenerate agent' : 'Generate agent'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </main>
  )
}

export default App
