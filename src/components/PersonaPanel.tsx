import { Badge, ConfidenceBadge, KeyValueList, SectionTitle } from '@/components/ui'
import type { AgentConfig } from '@/lib/types'

function Block({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  if (!items.length && !empty) return null
  return (
    <div>
      <SectionTitle className="mb-1.5">{title}</SectionTitle>
      {items.length ? <KeyValueList items={items} /> : <p className="text-sm text-ink-400">{empty}</p>}
    </div>
  )
}

/** Displays a generated agent persona: traits, voice, confidence, and the
 *  facts-vs-assumptions split that keeps the agent honest. */
export function PersonaPanel({ config }: { config: AgentConfig }) {
  const { persona, confidence, assumptions, rationale } = config

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-ink-200/70 bg-ink-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Inferred persona</SectionTitle>
        <ConfidenceBadge value={confidence} />
      </div>

      {persona.traits.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {persona.traits.map((t, i) => (
            <Badge key={i} tone="brand" className="capitalize">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {persona.language_style && <p className="text-sm leading-relaxed text-ink-600">{persona.language_style}</p>}

      <Block title="Voice rules" items={persona.voice_rules} />
      <Block title="Avoid" items={persona.approaches_to_avoid} />
      <Block title="Recruiting guidelines" items={persona.recruiting_guidelines} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Block title="Known facts" items={assumptions.known_facts} empty="None recorded" />
        <Block title="Inferred assumptions" items={assumptions.inferred_assumptions} empty="None" />
      </div>

      {rationale && <p className="text-xs italic leading-relaxed text-ink-400">{rationale}</p>}
    </div>
  )
}
