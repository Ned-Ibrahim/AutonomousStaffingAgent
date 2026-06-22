import { useMemo, useState } from 'react'
import { Bot, ShieldCheck } from 'lucide-react'
import { ReasoningPanel } from '@/components/ReasoningPanel'
import { Badge, EmptyState } from '@/components/ui'
import { startConversation } from '@/lib/conversations'
import type {
  AgentConfig,
  CompanyContext,
  ConversationStatus,
  OpeningTurnResult,
  SessionState,
} from '@/lib/types'

/**
 * The Agent Test Area: a sandbox where an operator points a configured agent at
 * a hypothetical candidate and watches it plan + write the OPENING outreach
 * (turn 0). There is no candidate reply here — that is a later slice. Nothing is
 * ever sent to a real channel; the message and its reasoning are shown for
 * inspection only.
 */
export function TestArea({
  companies,
  configs,
}: {
  companies: CompanyContext[]
  configs: Record<string, AgentConfig>
}) {
  // Only companies that already have a generated agent are pickable.
  const ready = useMemo(() => companies.filter((c) => configs[c.id]), [companies, configs])

  const [companyId, setCompanyId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [context, setContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OpeningTurnResult | null>(null)

  const selectedId = companyId || ready[0]?.id || ''
  const selectedCompany = ready.find((c) => c.id === selectedId)

  function reset() {
    setResult(null)
    setError(null)
    setName('')
    setRole('')
    setContext('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !selectedId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await startConversation(selectedId, {
        name: trimmedName,
        role: role.trim() || null,
        context: context.trim() || null,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the conversation.')
    } finally {
      setLoading(false)
    }
  }

  if (!ready.length) {
    return (
      <EmptyState
        title="Generate an agent first"
        description="The test area needs a configured agent. Add a company in the company section and generate its agent, then come back to try its opening outreach."
      />
    )
  }

  if (result) {
    return <Result result={result} company={selectedCompany} onReset={reset} />
  }

  return (
    <form onSubmit={onSubmit} className="card animate-fade-in flex flex-col gap-4">
      <div>
        <h2 className="section-title">Agent Test Area</h2>
        <p className="hint">
          Pick a configured agent and a hypothetical candidate. The agent will plan and write its
          opening outreach. Nothing is sent — this is a sandbox.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="label" htmlFor="ta-agent">
          Agent
        </label>
        <select
          id="ta-agent"
          className="input"
          value={selectedId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          {ready.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.one_liner}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="label" htmlFor="ta-name">
          Candidate name <span className="text-accent-500">*</span>
        </label>
        <input
          id="ta-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Lee"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="label" htmlFor="ta-role">
          Role <span className="hint">(optional)</span>
        </label>
        <input
          id="ta-role"
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="label" htmlFor="ta-context">
          Context / notes <span className="hint">(optional)</span>
        </label>
        <textarea
          id="ta-context"
          className="input min-h-[88px]"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Anything the agent should know about this candidate."
        />
      </div>

      {error && (
        <span className="chip border-red-200 bg-red-50 text-red-600">{error}</span>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
          {loading ? 'Starting…' : 'Start conversation'}
        </button>
        <span className="hint inline-flex items-center gap-1.5">
          <ShieldCheck size={13} /> Sandbox — nothing sent
        </span>
      </div>
    </form>
  )
}

// --- result view -----------------------------------------------------------

function Result({
  result,
  company,
  onReset,
}: {
  result: OpeningTurnResult
  company: CompanyContext | undefined
  onReset: () => void
}) {
  const { conversation, message, decision, grounding } = result
  const session = conversation.session_state as SessionState
  const candidateRole = conversation.candidate_role
  const companyName = company?.name ?? 'Company'

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{conversation.candidate_name}</h2>
          <p className="text-xs text-ink-400">
            {candidateRole ? `${candidateRole} · ` : ''}
            {companyName} agent
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="green" className="gap-1.5">
            <ShieldCheck size={13} /> Sandbox — nothing sent
          </Badge>
          <Badge tone={statusTone(conversation.status)} className="capitalize">
            {conversation.status}
          </Badge>
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            Start another
          </button>
        </div>
      </div>

      {/* Session state strip */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-ink-200/70 bg-white px-4 py-3">
        <SessionPill label="Stage" value={session.stage.replace(/-/g, ' ')} />
        <SessionPill label="Intent" value={session.intent.replace(/-/g, ' ')} />
        <SessionPill label="Sentiment" value={session.sentiment} />
        <SessionPill label="Engagement" value={session.engagement} />
        <SessionPill label="Next action" value={session.nextAction.replace(/-/g, ' ')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Chat — the single opening message */}
        <div className="flex flex-col rounded-2xl border border-ink-200/70 bg-white shadow-soft">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: '60vh' }}>
            <div className="flex justify-start">
              <div className="flex max-w-[85%] gap-2.5">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                  <Bot size={16} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="animate-fade-in whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-ink-50 px-4 py-2.5 text-sm leading-relaxed text-ink-800">
                    {message.content}
                  </div>
                  {!grounding.proceed && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700">
                      <span className="font-semibold">Withheld for review</span> — grounding
                      self-check did not pass. {grounding.reason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reasoning panel */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Agent reasoning
          </h3>
          <ReasoningPanel decision={decision} />
        </div>
      </div>
    </div>
  )
}

// --- helpers ---------------------------------------------------------------

function SessionPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
      <span className="text-sm font-medium capitalize text-ink-700">{value}</span>
    </div>
  )
}

function statusTone(status: ConversationStatus): 'green' | 'amber' | 'red' | 'violet' {
  switch (status) {
    case 'active':
      return 'green'
    case 'paused':
      return 'amber'
    case 'escalated':
      return 'violet'
    default:
      return 'red'
  }
}
