import { useEffect, useState } from 'react'
import { CompanyForm } from './components/CompanyForm'
import { listCompanies } from './lib/companies'
import type { CompanyContext } from '../supabase/functions/_shared/companies'
import './App.css'

function App() {
  const [companies, setCompanies] = useState<CompanyContext[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    listCompanies()
      .then(setCompanies)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <main className="shell">
      <header>
        <h1>Autonomous Staffing Agent</h1>
        <p className="tagline">Capture a company's context to configure its recruiting agent.</p>
      </header>

      <div className="layout">
        <CompanyForm onSaved={(c) => setCompanies((prev) => [c, ...prev])} />

        <section className="card">
          <h2>Saved companies</h2>
          {loadError && <p className="badge err">{loadError}</p>}
          {!loadError && companies.length === 0 && <p className="muted">None yet.</p>}
          <ul className="company-list">
            {companies.map((c) => (
              <li key={c.id}>
                <div className="company-head">
                  <strong>{c.name}</strong>
                  <span className="tone-pill">{c.tone}</span>
                </div>
                <p className="muted">{c.one_liner}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}

export default App
