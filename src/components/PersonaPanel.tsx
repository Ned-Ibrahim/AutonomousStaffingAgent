import type { AgentConfig, Confidence } from '../../supabase/functions/_shared/personality'

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: 'conf-high',
  medium: 'conf-med',
  low: 'conf-low',
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="chips">
      {items.map((it, i) => (
        <span key={i} className="chip">
          {it}
        </span>
      ))}
    </div>
  )
}

function Bullets({ items, empty }: { items: string[]; empty?: string }) {
  if (!items.length) return empty ? <p className="muted small">{empty}</p> : null
  return (
    <ul className="bullets">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

/** Displays a generated agent persona: traits, voice, confidence, and the
 *  facts-vs-assumptions split that keeps the agent honest. */
export function PersonaPanel({ config }: { config: AgentConfig }) {
  const { persona, confidence, assumptions, rationale } = config

  return (
    <div className="persona">
      <div className="persona-top">
        <span className="section-label">Inferred persona</span>
        <span className={`conf-badge ${CONFIDENCE_CLASS[confidence]}`}>{confidence} confidence</span>
      </div>

      <Chips items={persona.traits} />
      {persona.language_style && <p className="persona-style">{persona.language_style}</p>}

      <div className="persona-block">
        <span className="section-label">Voice rules</span>
        <Bullets items={persona.voice_rules} />
      </div>

      <div className="persona-block">
        <span className="section-label">Avoid</span>
        <Bullets items={persona.approaches_to_avoid} />
      </div>

      <div className="persona-block">
        <span className="section-label">Recruiting guidelines</span>
        <Bullets items={persona.recruiting_guidelines} />
      </div>

      <div className="facts-grid">
        <div>
          <span className="section-label">Known facts</span>
          <Bullets items={assumptions.known_facts} empty="None recorded" />
        </div>
        <div>
          <span className="section-label">Inferred assumptions</span>
          <Bullets items={assumptions.inferred_assumptions} empty="None" />
        </div>
      </div>

      {rationale && <p className="persona-rationale">{rationale}</p>}
    </div>
  )
}
