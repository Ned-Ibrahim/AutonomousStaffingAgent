import { useMemo, useState } from 'react'
import { Bot, Send, ShieldCheck, User } from 'lucide-react'
import { ReasoningPanel } from '@/components/ReasoningPanel'
import { Badge, EmptyState } from '@/components/ui'
import { replyConversation, startConversation } from '@/lib/conversations'
import type {
  AgentConfig,
  AgentDecision,
  CompanyContext,
  ConversationStatus,
  Message,
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
  const [recruiter, setRecruiter] = useState('')
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
    setRecruiter('')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || !selectedId || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await startConversation(
        selectedId,
        {
          name: trimmedName,
          role: role.trim() || null,
          context: context.trim() || null,
        },
        recruiter.trim() || null,
      )
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
        <label className="label" htmlFor="ta-recruiter">
          Recruiter name <span className="hint">(optional)</span>
        </label>
        <input
          id="ta-recruiter"
          className="input"
          value={recruiter}
          onChange={(e) => setRecruiter(e.target.value)}
          placeholder="Who the agent signs as — e.g. Sam Rivera"
        />
        <p className="hint">Used to sign the agent's messages. Left blank, it signs as the company.</p>
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
  // The live thread accumulates as the candidate replies. Seed it from turn 0.
  const [messages, setMessages] = useState<Message[]>([result.message])
  const [session, setSession] = useState<SessionState>(result.conversation.session_state as SessionState)
  const [status, setStatus] = useState<ConversationStatus>(result.conversation.status)
  const [decision, setDecision] = useState<AgentDecision>(result.decision)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conversationId = result.conversation.id
  const candidateRole = result.conversation.candidate_role
  const companyName = company?.name ?? 'Company'
  const ended = status === 'stopped'

  async function sendReply(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending || ended) return
    setSending(true)
    setError(null)
    try {
      const res = await replyConversation(conversationId, trimmed)
      setMessages((prev) => [...prev, res.candidateMessage, res.agentMessage])
      setSession(res.session)
      setStatus(res.conversation.status)
      setDecision(res.decision)
      setReply('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reply.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-900">{result.conversation.candidate_name}</h2>
          <p className="text-xs text-ink-400">
            {candidateRole ? `${candidateRole} · ` : ''}
            {companyName} agent
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="green" className="gap-1.5">
            <ShieldCheck size={13} /> Sandbox — nothing sent
          </Badge>
          <Badge tone={statusTone(status)} className="capitalize">
            {status}
          </Badge>
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            Start another
          </button>
        </div>
      </div>

      {/* Session state strip — the running memory, updated every turn */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-ink-200/70 bg-white px-4 py-3">
        <SessionPill label="Stage" value={session.stage.replace(/-/g, ' ')} />
        <SessionPill label="Intent" value={session.intent.replace(/-/g, ' ')} />
        <SessionPill label="Sentiment" value={session.sentiment} />
        <SessionPill label="Engagement" value={session.engagement} />
        <SessionPill label="Next action" value={session.nextAction.replace(/-/g, ' ')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Chat thread + candidate reply composer */}
        <div className="flex flex-col rounded-2xl border border-ink-200/70 bg-white shadow-soft">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: '52vh' }}>
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <Bot size={14} /> Agent is deciding and writing…
                </div>
              </div>
            )}
          </div>

          {/* Composer — type a candidate reply to drive the next turn */}
          <div className="border-t border-ink-200/70 p-3">
            {error && (
              <span className="chip mb-2 border-red-200 bg-red-50 text-red-600">{error}</span>
            )}
            {ended ? (
              <p className="px-1 py-2 text-center text-xs text-ink-400">
                The agent ended this conversation. Start another to keep exploring.
              </p>
            ) : (
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendReply(reply)
                }}
              >
                <textarea
                  className="input min-h-[44px] flex-1 resize-none"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendReply(reply)
                    }
                  }}
                  placeholder="Reply as the candidate…  (Enter to send)"
                  rows={1}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="btn btn-primary gap-1.5"
                  disabled={sending || !reply.trim()}
                >
                  <Send size={14} /> Send
                </button>
              </form>
            )}
            {!ended && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="chip border border-ink-200 bg-white text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                    disabled={sending}
                    onClick={() => void sendReply(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reasoning panel — reflects the latest turn's decision */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Agent reasoning <span className="font-normal normal-case text-ink-400">· latest turn</span>
          </h3>
          <ReasoningPanel decision={decision} />
        </div>
      </div>
    </div>
  )
}

const QUICK_REPLIES = [
  'Tell me more about the role.',
  "What's the comp range?",
  "I'm happy where I am, thanks.",
  'Can we set up a call next week?',
]

function ChatBubble({ message }: { message: Message }) {
  const isAgent = message.role === 'agent'
  const withheld = isAgent && message.decision_data != null && !message.decision_data.grounding.passed

  if (!isAgent) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-row-reverse gap-2.5">
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-200 text-ink-600">
            <User size={16} />
          </div>
          <div className="animate-fade-in whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] gap-2.5">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-white">
          <Bot size={16} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="animate-fade-in whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-ink-50 px-4 py-2.5 text-sm leading-relaxed text-ink-800">
            {message.content}
          </div>
          {withheld && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700">
              <span className="font-semibold">Withheld for review</span> — the agent's grounding
              self-check did not pass for this message.
            </div>
          )}
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
