import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

type HealthResult =
  | { state: 'loading' }
  | { state: 'ok'; status: string; checkedAt: string }
  | { state: 'error'; message: string }

function App() {
  const [health, setHealth] = useState<HealthResult>({ state: 'loading' })

  useEffect(() => {
    // Walking-skeleton check: the browser calls a Supabase Edge Function,
    // which reads a row from Postgres and returns it. Proves the full pipe
    // (frontend -> Edge Function -> database) works end to end, deployed.
    supabase.functions
      .invoke('health')
      .then(({ data, error }) => {
        if (error) throw error
        setHealth({
          state: 'ok',
          status: data.db.status,
          checkedAt: data.db.created_at,
        })
      })
      .catch((e: unknown) =>
        setHealth({ state: 'error', message: e instanceof Error ? e.message : String(e) }),
      )
  }, [])

  return (
    <main className="shell">
      <h1>Autonomous Staffing Agent</h1>
      <p className="tagline">Walking skeleton — frontend → Edge Function → database</p>

      <section className="card" aria-live="polite">
        {health.state === 'loading' && <p>Checking the pipe…</p>}
        {health.state === 'ok' && (
          <>
            <p className="badge ok">● pipe healthy</p>
            <dl>
              <dt>DB status</dt>
              <dd>{health.status}</dd>
              <dt>Row created</dt>
              <dd>{new Date(health.checkedAt).toLocaleString()}</dd>
            </dl>
          </>
        )}
        {health.state === 'error' && (
          <>
            <p className="badge err">● pipe down</p>
            <pre className="err-msg">{health.message}</pre>
            <p className="hint">
              Check that <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> are set
              and the <code>health</code> function is deployed.
            </p>
          </>
        )}
      </section>
    </main>
  )
}

export default App
