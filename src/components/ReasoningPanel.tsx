import type { ComponentType, ReactNode } from 'react'
import {
  Brain,
  Gauge,
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCog,
  NotebookPen,
  ShieldCheck,
  ScanSearch,
} from 'lucide-react'
import { Badge, SectionTitle } from '@/components/ui'
import type { AgentDecision, CandidateIntent, NextAction, Sentiment } from '@/lib/types'

const INTENT_LABEL: Record<CandidateIntent, string> = {
  interested: 'Interested',
  curious: 'Curious',
  'needs-info': 'Needs info',
  objection: 'Objection',
  scheduling: 'Scheduling',
  'not-interested': 'Not interested',
  unclear: 'Unclear',
}

const ACTION_LABEL: Record<NextAction, string> = {
  'continue-engagement': 'Continue engagement',
  'answer-question': 'Answer question',
  'ask-for-info': 'Ask for information',
  'handle-objection': 'Handle objection',
  'adjust-approach': 'Adjust approach',
  'suggest-next-step': 'Suggest next step',
  pause: 'Pause conversation',
  stop: 'Stop conversation',
  'escalate-to-human': 'Escalate to human',
}

function sentimentTone(s: Sentiment): 'green' | 'neutral' | 'amber' | 'red' {
  return s === 'positive' ? 'green' : s === 'neutral' ? 'neutral' : s === 'mixed' ? 'amber' : 'red'
}

export function ReasoningPanel({ decision }: { decision: AgentDecision | null }) {
  if (!decision) {
    return (
      <div className="rounded-2xl border border-ink-200/70 bg-white p-6 text-center text-sm text-ink-400">
        <Brain size={28} className="mx-auto mb-3 text-ink-300" />
        The agent's reasoning will appear here once you start a conversation.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Read of the candidate */}
      <Panel icon={ScanSearch} title="Candidate read">
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Intent">
            <Badge tone="brand">{INTENT_LABEL[decision.intent]}</Badge>
          </Cell>
          <Cell label="Sentiment">
            <Badge tone={sentimentTone(decision.sentiment)} className="capitalize">
              {decision.sentiment}
            </Badge>
          </Cell>
          <Cell label="Stage">
            <Badge className="capitalize">{decision.stage.replace('-', ' ')}</Badge>
          </Cell>
          <Cell label="Engagement">
            <Badge
              tone={decision.engagement === 'high' ? 'green' : decision.engagement === 'low' ? 'red' : 'amber'}
              className="capitalize"
            >
              {decision.engagement}
            </Badge>
          </Cell>
        </div>
        {decision.keyInfo.length > 0 && (
          <div className="mt-3">
            <SectionTitle className="mb-1.5">Key info detected</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {decision.keyInfo.map((k, i) => (
                <span key={i} className="rounded-lg bg-ink-100 px-2 py-1 text-xs text-ink-600">
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Decision */}
      <Panel icon={Target} title="Next-best action">
        <div className="flex items-center justify-between gap-2">
          <Badge
            tone={decision.nextAction === 'escalate-to-human' ? 'violet' : decision.nextAction === 'stop' ? 'red' : 'brand'}
          >
            {ACTION_LABEL[decision.nextAction]}
          </Badge>
          <Badge tone={statusToneFor(decision.status)} className="capitalize">
            {decision.status}
          </Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{decision.actionRationale}</p>
      </Panel>

      {/* Confidence & assumptions */}
      <Panel icon={Gauge} title="Confidence & assumptions">
        <div className="mb-3">
          <Badge
            tone={decision.confidence === 'high' ? 'green' : decision.confidence === 'medium' ? 'amber' : 'red'}
            className="capitalize"
          >
            {decision.confidence} confidence
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <SectionTitle className="mb-1.5">Known facts</SectionTitle>
            <List items={decision.knownVsInferred.knownFacts} tone="green" empty="None recorded" />
          </div>
          <div>
            <SectionTitle className="mb-1.5">Inferred assumptions</SectionTitle>
            <List items={decision.knownVsInferred.inferredAssumptions} tone="amber" empty="None" />
          </div>
        </div>
      </Panel>

      {/* Grounding */}
      <Panel icon={ShieldCheck} title="Grounding & safety check">
        <div className="space-y-1.5">
          <Check ok={decision.grounding.reflectsCompanyContext} label="Reflects company context" />
          <Check ok={decision.grounding.matchesCommunicationStyle} label="Matches communication style" />
          <Check ok={decision.grounding.usesCandidateInfo} label="Uses candidate information" />
          <Check ok={decision.grounding.avoidsUnsupportedClaims} label="Avoids unsupported claims" />
          <Check ok={decision.grounding.followsBoundaries} label="Follows recruiting boundaries" />
        </div>
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            decision.grounding.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}
        >
          {decision.grounding.passed ? 'Passed — safe to send in a real workflow.' : 'Needs review before sending.'}
        </div>
      </Panel>

      {/* Human + memory */}
      <Panel icon={UserCog} title="Human recruiter">
        {decision.humanRecommended ? (
          <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
            <AlertTriangle size={16} /> Human involvement recommended.
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <CheckCircle2 size={16} className="text-emerald-500" /> Agent can proceed autonomously.
          </div>
        )}
      </Panel>

      <Panel icon={NotebookPen} title="Memory / session notes">
        <List items={decision.memoryNotes} tone="neutral" empty="No notes yet" />
      </Panel>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-brand-500" />
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-50 px-2.5 py-2">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      {children}
    </div>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 size={15} className="text-emerald-500" />
      ) : (
        <XCircle size={15} className="text-rose-500" />
      )}
      <span className={ok ? 'text-ink-600' : 'text-rose-600'}>{label}</span>
    </div>
  )
}

function List({ items, tone, empty }: { items: string[]; tone: 'green' | 'amber' | 'neutral'; empty: string }) {
  if (!items.length) return <p className="text-xs text-ink-400">{empty}</p>
  const dot = tone === 'green' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-ink-300'
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-xs leading-snug text-ink-600">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

function statusToneFor(status: string): 'green' | 'amber' | 'red' | 'violet' {
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
