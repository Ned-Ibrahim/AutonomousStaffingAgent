import { describe, expect, it } from 'vitest'
import type { CompanyContext } from '../supabase/functions/_shared/companies'
import type { Persona, ProviderClient } from '../supabase/functions/_shared/personality'
import {
  checkGrounding,
  fallbackDecision,
  makeConversationEngine,
  makeConversationEngineFromProvider,
  makeDecisionEngine,
  makeMessageWriter,
  parseDecision,
  reduceSession,
  sessionFromDecision,
  type AgentDecision,
  type CandidateInput,
  type Conversation,
  type ConversationsPort,
  type ConversationUpdate,
  type DecisionEngine,
  type InterpretBundle,
  type Message,
  type MessageWriter,
  type NewConversation,
  type NewMessage,
  type OpeningTurnInput,
  type SessionState,
} from '../supabase/functions/_shared/conversation'

// --- fixtures --------------------------------------------------------------

const company = (over: Partial<CompanyContext> = {}): CompanyContext => ({
  id: 'co-1',
  created_at: '2026-01-01T00:00:00Z',
  name: 'Acme Rockets',
  one_liner: 'We build rockets',
  about: 'A 40-person launch-vehicle startup',
  culture_values: 'Ownership, candor, speed',
  hiring_needs: 'Senior propulsion engineers',
  candidate_profiles: null,
  recruiting_process: null,
  tone: 'direct',
  recruiting_goals: 'Book intro calls with strong propulsion engineers',
  ...over,
})

const persona = (over: Partial<Persona> = {}): Persona => ({
  traits: ['bold', 'technical'],
  voice_rules: ['Say the point first'],
  language_style: 'Crisp and candid',
  approaches_to_avoid: ['Corporate fluff'],
  recruiting_guidelines: ['Move quickly'],
  ...over,
})

const candidate = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  name: 'Dana Lopez',
  role: 'Propulsion Engineer',
  context: 'Ten years on liquid engines',
  ...over,
})

/** A fully-valid AgentDecision whose grounding passes. */
const goodDecision = (over: Partial<AgentDecision> = {}): AgentDecision => ({
  intent: 'curious',
  sentiment: 'positive',
  stage: 'initial-outreach',
  engagement: 'high',
  keyInfo: ['Likes hard engineering problems'],
  nextAction: 'continue-engagement',
  actionRationale: 'Open warmly and invite a conversation.',
  status: 'active',
  confidence: 'high',
  knownVsInferred: {
    knownFacts: ['Builds launch vehicles'],
    inferredAssumptions: ['Values autonomy'],
  },
  grounding: {
    reflectsCompanyContext: true,
    matchesCommunicationStyle: true,
    usesCandidateInfo: true,
    avoidsUnsupportedClaims: true,
    followsBoundaries: true,
    passed: true,
  },
  humanRecommended: false,
  memoryNotes: ['Candidate has deep propulsion experience'],
  ...over,
})

const GOOD_DECISION_JSON = JSON.stringify(goodDecision())

interface CompleteReq {
  system: string
  user: string
  schema?: { name: string; schema: Record<string, unknown> }
  text?: boolean
}

/**
 * A provider that records every request it receives and returns a fixed
 * response (a string, or a per-call queue if an array is given).
 */
function recordingProvider(response: string | string[]) {
  const calls: CompleteReq[] = []
  const queue = Array.isArray(response) ? [...response] : null
  const provider: ProviderClient = {
    async complete(req) {
      calls.push(req)
      if (queue) return queue.shift() ?? ''
      return response as string
    },
  }
  return { provider, calls }
}

/** In-memory ConversationsPort: synthesises id/created_at so the engine runs end-to-end. */
function fakePort(): ConversationsPort & {
  conversations: Conversation[]
  messages: Message[]
} {
  const conversations: Conversation[] = []
  const messages: Message[] = []
  let cn = 0
  let mn = 0
  return {
    conversations,
    messages,
    async insertConversation(c: NewConversation) {
      const row: Conversation = {
        id: `conv-${++cn}`,
        created_at: `2026-06-2${cn}T00:00:00Z`,
        ...c,
      }
      conversations.push(row)
      return row
    },
    async insertMessage(m: NewMessage) {
      const row: Message = { id: `msg-${++mn}`, created_at: `2026-06-2${mn}T00:01:00Z`, ...m }
      messages.push(row)
      return row
    },
    async getConversation(id: string) {
      return conversations.find((c) => c.id === id) ?? null
    },
    async listMessages(conversationId: string) {
      return messages.filter((m) => m.conversation_id === conversationId)
    },
    async updateConversation(id: string, patch: ConversationUpdate) {
      const row = conversations.find((c) => c.id === id)
      if (!row) throw new Error('conversation not found')
      Object.assign(row, patch)
      return row
    },
  }
}

const bundle = (over: Partial<InterpretBundle> = {}): InterpretBundle => ({
  company: company(),
  persona: persona(),
  candidate: candidate(),
  history: [],
  latestCandidateMessage: null,
  ...over,
})

const openingInput = (over: Partial<OpeningTurnInput> = {}): OpeningTurnInput => ({
  company: company(),
  persona: persona(),
  agentConfigId: 'cfg-1',
  candidate: candidate(),
  ...over,
})

// --- DecisionEngine --------------------------------------------------------

describe('makeDecisionEngine', () => {
  it('returns the provider decision and sends the strict agent_decision schema', async () => {
    const { provider, calls } = recordingProvider(GOOD_DECISION_JSON)
    const engine = makeDecisionEngine(provider)

    const decision = await engine.interpret(bundle())

    expect(decision).toEqual(goodDecision())
    expect(calls).toHaveLength(1)
    // call 1 requests strict structured output, not free text
    expect(calls[0].schema?.name).toBe('agent_decision')
    expect(calls[0].text).toBeUndefined()
  })

  it('assembles the context bundle into the prompt (company + persona + candidate)', async () => {
    const { provider, calls } = recordingProvider(GOOD_DECISION_JSON)
    await makeDecisionEngine(provider).interpret(bundle())

    const { system, user } = calls[0]
    // company facts live in the (cacheable) system prefix
    expect(system).toContain('Acme Rockets')
    expect(system).toContain('Senior propulsion engineers')
    // persona is embedded too
    expect(system).toContain('Crisp and candid')
    // candidate + goal live in the dynamic user tail
    const userJson = JSON.parse(user) as {
      candidate: { name: string; role: string | null; context: string | null }
      recruiting_goal: string | null
    }
    expect(userJson.candidate.name).toBe('Dana Lopez')
    expect(userJson.candidate.role).toBe('Propulsion Engineer')
    expect(userJson.recruiting_goal).toBe('Book intro calls with strong propulsion engineers')
  })

  it('instructs opening-outreach behaviour on turn 0 (no candidate reply yet)', async () => {
    const { provider, calls } = recordingProvider(GOOD_DECISION_JSON)
    await makeDecisionEngine(provider).interpret(bundle({ latestCandidateMessage: null }))

    const { system, user } = calls[0]
    expect(system).toContain('TURN 0')
    expect(system).toContain('initial-outreach')
    const userJson = JSON.parse(user) as {
      turn_0_opening_outreach: boolean
      candidate_latest_message: string | null
    }
    expect(userJson.turn_0_opening_outreach).toBe(true)
    expect(userJson.candidate_latest_message).toBeNull()
  })

  it('does NOT use the turn-0 opening instruction once the candidate has replied', async () => {
    const { provider, calls } = recordingProvider(GOOD_DECISION_JSON)
    await makeDecisionEngine(provider).interpret(
      bundle({
        latestCandidateMessage: 'Tell me more',
        history: [{ role: 'agent', content: 'Hi Dana' }],
      }),
    )
    const userJson = JSON.parse(calls[0].user) as { turn_0_opening_outreach: boolean }
    expect(userJson.turn_0_opening_outreach).toBe(false)
  })

  it('falls back safely when the provider returns garbage (no throw)', async () => {
    const { provider } = recordingProvider('not json at all <<<')
    const decision = await makeDecisionEngine(provider).interpret(bundle())

    expect(decision).toEqual(fallbackDecision())
    expect(decision.nextAction).toBe('escalate-to-human')
    expect(decision.status).toBe('escalated')
    expect(decision.grounding.passed).toBe(false)
    expect(decision.humanRecommended).toBe(true)
  })

  it('falls back safely when the provider throws (no crash)', async () => {
    const provider: ProviderClient = {
      async complete() {
        throw new Error('network down')
      },
    }
    const decision = await makeDecisionEngine(provider).interpret(bundle())
    expect(decision).toEqual(fallbackDecision())
  })

  it('returns the fallback decision when no provider is configured', async () => {
    const decision = await makeDecisionEngine(null).interpret(bundle())
    expect(decision).toEqual(fallbackDecision())
  })
})

// --- parseDecision ---------------------------------------------------------

describe('parseDecision', () => {
  it('parses a full valid decision exactly', () => {
    expect(parseDecision(GOOD_DECISION_JSON)).toEqual(goodDecision())
  })

  it('strips a ```json code fence before parsing', () => {
    expect(parseDecision('```json\n' + GOOD_DECISION_JSON + '\n```')).toEqual(goodDecision())
  })

  it('strips a bare ``` code fence before parsing', () => {
    expect(parseDecision('```\n' + GOOD_DECISION_JSON + '\n```')).toEqual(goodDecision())
  })

  it('returns null for non-JSON text', () => {
    expect(parseDecision('I think we should reach out warmly...')).toBeNull()
  })

  it('repairs a partially-malformed object field-by-field to safe defaults', () => {
    const repaired = parseDecision(
      JSON.stringify({
        intent: 'super-interested', // not in enum -> 'unclear'
        sentiment: 42, // wrong type -> 'neutral'
        // stage missing -> 'initial-outreach'
        engagement: 'extreme', // not in enum -> 'medium'
        keyInfo: ['real', '', 7, null], // keep only non-empty strings
        nextAction: 'teleport', // not in enum -> 'continue-engagement'
        // actionRationale missing -> ''
        status: 'on-fire', // not in enum -> 'active'
        confidence: 'absolute', // not in enum -> 'medium'
        knownVsInferred: { knownFacts: 'oops' }, // wrong type -> [] ; missing inferred -> []
        grounding: { passed: 'yes' }, // non-boolean passed -> false; others false
        humanRecommended: 'maybe', // non-true -> false
        // memoryNotes missing -> []
      }),
    )

    expect(repaired).not.toBeNull()
    const d = repaired as AgentDecision
    expect(d.intent).toBe('unclear')
    expect(d.sentiment).toBe('neutral')
    expect(d.stage).toBe('initial-outreach')
    expect(d.engagement).toBe('medium')
    expect(d.keyInfo).toEqual(['real'])
    expect(d.nextAction).toBe('continue-engagement')
    expect(d.actionRationale).toBe('')
    expect(d.status).toBe('active')
    expect(d.confidence).toBe('medium')
    expect(d.knownVsInferred).toEqual({ knownFacts: [], inferredAssumptions: [] })
    expect(d.grounding.passed).toBe(false)
    expect(d.grounding.reflectsCompanyContext).toBe(false)
    expect(d.humanRecommended).toBe(false)
    expect(d.memoryNotes).toEqual([])
  })

  it('coerces a non-boolean grounding.passed to false (treated as not grounded)', () => {
    const d = parseDecision(JSON.stringify(goodDecision({ grounding: { ...goodDecision().grounding, passed: 'true' as unknown as boolean } })))
    expect(d?.grounding.passed).toBe(false)
  })
})

// --- checkGrounding --------------------------------------------------------

describe('checkGrounding', () => {
  it('proceeds without annotation when grounding passed', () => {
    const out = checkGrounding(goodDecision())
    expect(out.proceed).toBe(true)
    expect(out.annotate).toBe(false)
    expect(out.reason).toBeTruthy()
  })

  it('withholds and annotates with a reason when grounding did not pass', () => {
    const out = checkGrounding(goodDecision({ grounding: { ...goodDecision().grounding, passed: false } }))
    expect(out.proceed).toBe(false)
    expect(out.annotate).toBe(true)
    expect(out.reason).toMatch(/did not pass/i)
  })

  it('treats a missing grounding object as failed (no crash)', () => {
    const out = checkGrounding({})
    expect(out.proceed).toBe(false)
    expect(out.annotate).toBe(true)
    expect(out.reason).toMatch(/missing or malformed/i)
  })

  it('treats grounding: null as failed (no crash)', () => {
    const out = checkGrounding({ grounding: null })
    expect(out.proceed).toBe(false)
    expect(out.annotate).toBe(true)
  })

  it('treats a non-boolean passed as failed (no crash)', () => {
    const out = checkGrounding({ grounding: { passed: 'yes' as unknown as boolean } })
    expect(out.proceed).toBe(false)
    expect(out.annotate).toBe(true)
  })

  it('never throws on null or undefined input and treats it as failed', () => {
    expect(() => checkGrounding(null)).not.toThrow()
    expect(() => checkGrounding(undefined)).not.toThrow()
    expect(checkGrounding(null).proceed).toBe(false)
    expect(checkGrounding(undefined).annotate).toBe(true)
  })
})

// --- Orchestrator: openingTurn ---------------------------------------------

describe('makeConversationEngine.openingTurn (with fake DecisionEngine/MessageWriter)', () => {
  const fakeDecisionEngine = (decision: AgentDecision): DecisionEngine => ({
    async interpret() {
      return decision
    },
  })
  const fakeWriter = (content: string): MessageWriter => ({
    async write() {
      return content
    },
  })

  it('persists exactly one conversation and one agent message', async () => {
    const port = fakePort()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(goodDecision()),
      messageWriter: fakeWriter('Hi Dana, we build rockets.'),
      port,
    })

    await engine.openingTurn(openingInput())

    expect(port.conversations).toHaveLength(1)
    expect(port.messages).toHaveLength(1)
    expect(port.messages[0].role).toBe('agent')
  })

  it('stores session_state derived from the decision and the decision verbatim on the message', async () => {
    const port = fakePort()
    const decision = goodDecision()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(decision),
      messageWriter: fakeWriter('Hi Dana.'),
      port,
    })

    const result = await engine.openingTurn(openingInput())

    expect(result.conversation.session_state).toEqual(sessionFromDecision(decision))
    expect(result.message.decision_data).toEqual(decision)
    expect(result.message.content).toBe('Hi Dana.')
    expect(result.decision).toEqual(decision)
    expect(result.grounding.proceed).toBe(true)
  })

  it('returns { conversation, message, decision, grounding } and they are the persisted rows', async () => {
    const port = fakePort()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(goodDecision()),
      messageWriter: fakeWriter('Hi.'),
      port,
    })

    const result = await engine.openingTurn(openingInput())

    expect(result.conversation).toBe(port.conversations[0])
    expect(result.message).toBe(port.messages[0])
    expect(result.message.conversation_id).toBe(result.conversation.id)
    expect(result).toHaveProperty('grounding')
  })

  it('carries a failing decision through to a withheld/annotated grounding outcome', async () => {
    const port = fakePort()
    const failing = goodDecision({
      status: 'escalated',
      grounding: { ...goodDecision().grounding, passed: false },
    })
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(failing),
      messageWriter: fakeWriter('needs review'),
      port,
    })

    const result = await engine.openingTurn(openingInput())
    expect(result.grounding.proceed).toBe(false)
    expect(result.grounding.annotate).toBe(true)
    expect(result.conversation.status).toBe('escalated')
  })
})

describe('makeConversationEngineFromProvider.openingTurn (real engine + fake provider)', () => {
  it('makes exactly two model calls per turn: interpret (schema) then write (text)', async () => {
    const port = fakePort()
    // call 1 -> decision JSON (schema); call 2 -> message text
    const { provider, calls } = recordingProvider([GOOD_DECISION_JSON, 'Hi Dana, we build rockets.'])
    const engine = makeConversationEngineFromProvider(provider, port)

    await engine.openingTurn(openingInput())

    expect(calls).toHaveLength(2)
    // first call is the strict-schema interpret
    expect(calls[0].schema?.name).toBe('agent_decision')
    expect(calls[0].text).toBeUndefined()
    // second call is the free-text write
    expect(calls[1].text).toBe(true)
    expect(calls[1].schema).toBeUndefined()
  })

  it('runs end-to-end against the in-memory port and persists the written message', async () => {
    const port = fakePort()
    const { provider } = recordingProvider([GOOD_DECISION_JSON, 'Hi Dana, we build rockets.'])
    const engine = makeConversationEngineFromProvider(provider, port)

    const result = await engine.openingTurn(openingInput())

    expect(result.conversation.id).toBeTruthy()
    expect(result.conversation.created_at).toBeTruthy()
    expect(result.message.content).toBe('Hi Dana, we build rockets.')
    expect(result.message.decision_data).toEqual(goodDecision())
    expect(result.conversation.session_state).toEqual(sessionFromDecision(goodDecision()))
    // persisted and re-readable through the port
    expect(await port.getConversation(result.conversation.id)).toBe(result.conversation)
    expect(await port.listMessages(result.conversation.id)).toEqual([result.message])
  })

  it('still persists a (fallback) turn when the provider yields garbage then empty text', async () => {
    const port = fakePort()
    // interpret garbage -> fallbackDecision; write empty -> generic opener
    const { provider } = recordingProvider(['garbage', ''])
    const engine = makeConversationEngineFromProvider(provider, port)

    const result = await engine.openingTurn(openingInput())

    expect(result.decision).toEqual(fallbackDecision())
    expect(result.grounding.proceed).toBe(false)
    expect(result.conversation.status).toBe('escalated')
    expect(result.message.content).toContain('Acme Rockets') // generic opener used
    expect(port.conversations).toHaveLength(1)
    expect(port.messages).toHaveLength(1)
  })
})

// --- MessageWriter (call 2) ------------------------------------------------

describe('makeMessageWriter', () => {
  const writeArgs = () => ({
    decision: goodDecision(),
    persona: persona(),
    company: company(),
    candidate: candidate(),
    history: [],
  })

  it('requests free-text output (text:true, no schema) and returns the trimmed message', async () => {
    const { provider, calls } = recordingProvider('  Hi Dana, great work on engines.  ')
    const out = await makeMessageWriter(provider).write(writeArgs())

    expect(out).toBe('Hi Dana, great work on engines.')
    expect(calls[0].text).toBe(true)
    expect(calls[0].schema).toBeUndefined()
  })

  it('falls back to a generic opener when the provider returns empty text', async () => {
    const { provider } = recordingProvider('   ')
    const out = await makeMessageWriter(provider).write(writeArgs())
    expect(out).toContain('Acme Rockets')
    expect(out).toContain('Dana Lopez')
  })

  it('falls back to a generic opener when the provider throws (no crash)', async () => {
    const provider: ProviderClient = {
      async complete() {
        throw new Error('boom')
      },
    }
    const out = await makeMessageWriter(provider).write(writeArgs())
    expect(out).toContain('Acme Rockets')
  })

  it('uses a generic opener when no provider is configured', async () => {
    const out = await makeMessageWriter(null).write(writeArgs())
    expect(out).toContain('Acme Rockets')
    expect(out).toContain('Dana Lopez')
  })

  it('tells the writer to sign as the recruiter when a name is given, and forbids placeholders', async () => {
    const { provider, calls } = recordingProvider('Hi Dana.')
    await makeMessageWriter(provider).write({ ...writeArgs(), recruiterName: 'Sam Rivera' })
    expect(calls[0].system).toContain('Sam Rivera')
    expect(calls[0].system).toContain('[Your Name]')
    expect(calls[0].system.toLowerCase()).toContain('never output a placeholder')
  })

  it('tells the writer to sign as the company (no placeholder) when no recruiter name is given', async () => {
    const { provider, calls } = recordingProvider('Hi Dana.')
    await makeMessageWriter(provider).write(writeArgs())
    expect(calls[0].system).toContain('Acme Rockets team')
    expect(calls[0].system.toLowerCase()).toContain('never output a placeholder')
  })

  it('appends the recruiter name to the generic opener fallback', async () => {
    const out = await makeMessageWriter(null).write({ ...writeArgs(), recruiterName: 'Sam Rivera' })
    expect(out).toContain('Sam Rivera')
  })
})

// --- SessionReducer (slice-005 headline) -----------------------------------

describe('reduceSession', () => {
  const session = (over: Partial<SessionState> = {}): SessionState => ({
    stage: 'initial-outreach',
    intent: 'curious',
    sentiment: 'positive',
    engagement: 'high',
    nextAction: 'continue-engagement',
    status: 'active',
    ...over,
  })

  it('turn 0 (no prior session) returns the session derived from the decision', () => {
    const d = goodDecision()
    expect(reduceSession(null, d)).toEqual(sessionFromDecision(d))
  })

  it('folds the new decision over the previous session (decision wins)', () => {
    const prev = session()
    const d = goodDecision({
      stage: 'screening',
      intent: 'interested',
      sentiment: 'mixed',
      engagement: 'medium',
      nextAction: 'answer-question',
      status: 'active',
    })
    const next = reduceSession(prev, d)
    expect(next).toEqual({
      stage: 'screening',
      intent: 'interested',
      sentiment: 'mixed',
      engagement: 'medium',
      nextAction: 'answer-question',
      status: 'active',
    })
  })

  it('advances the stage as the conversation progresses', () => {
    const next = reduceSession(session({ stage: 'initial-outreach' }), goodDecision({ stage: 'scheduling' }))
    expect(next.stage).toBe('scheduling')
  })

  it('lets the status transition active -> escalated when the decision escalates', () => {
    const next = reduceSession(session({ status: 'active' }), goodDecision({ status: 'escalated' }))
    expect(next.status).toBe('escalated')
  })

  it('treats a stopped conversation as terminal: a later decision cannot reopen it', () => {
    const prev = session({ status: 'stopped', stage: 'closed' })
    const next = reduceSession(prev, goodDecision({ status: 'active', stage: 'initial-outreach' }))
    expect(next).toBe(prev) // frozen, unchanged
    expect(next.status).toBe('stopped')
  })

  it('is pure — it does not mutate the previous session', () => {
    const prev = session()
    const snapshot = { ...prev }
    reduceSession(prev, goodDecision({ stage: 'screening', status: 'paused' }))
    expect(prev).toEqual(snapshot)
  })
})

// --- Orchestrator: replyTurn -----------------------------------------------

describe('makeConversationEngine.replyTurn', () => {
  const fakeDecisionEngine = (decision: AgentDecision): DecisionEngine => ({
    async interpret() {
      return decision
    },
  })
  const fakeWriter = (content: string): MessageWriter => ({
    async write() {
      return content
    },
  })

  /** Seed a port with one opening turn so there is a conversation to reply into. */
  async function seeded(openingDecision = goodDecision()) {
    const port = fakePort()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(openingDecision),
      messageWriter: fakeWriter('Hi Dana, we build rockets.'),
      port,
    })
    const opened = await engine.openingTurn(openingInput())
    return { port, opened }
  }

  it('persists the candidate message and the agent reply (two new messages)', async () => {
    const { port, opened } = await seeded()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(goodDecision({ intent: 'interested' })),
      messageWriter: fakeWriter('Great — here are the details.'),
      port,
    })

    const res = await engine.replyTurn({
      conversationId: opened.conversation.id,
      company: company(),
      persona: persona(),
      candidateMessage: 'Tell me more.',
    })

    expect(port.messages).toHaveLength(3) // opening agent + candidate + agent reply
    expect(res.candidateMessage.role).toBe('candidate')
    expect(res.candidateMessage.content).toBe('Tell me more.')
    expect(res.candidateMessage.decision_data).toBeNull()
    expect(res.agentMessage.role).toBe('agent')
    expect(res.agentMessage.content).toBe('Great — here are the details.')
    expect(res.agentMessage.decision_data).toEqual(goodDecision({ intent: 'interested' }))
  })

  it('updates the conversation session_state via the reducer and persists it', async () => {
    const { port, opened } = await seeded()
    const replyDecision = goodDecision({ stage: 'screening', intent: 'interested', status: 'active' })
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(replyDecision),
      messageWriter: fakeWriter('…'),
      port,
    })

    const res = await engine.replyTurn({
      conversationId: opened.conversation.id,
      company: company(),
      persona: persona(),
      candidateMessage: 'Sounds interesting.',
    })

    const expected = reduceSession(sessionFromDecision(goodDecision()), replyDecision)
    expect(res.session).toEqual(expected)
    expect(res.session.stage).toBe('screening')
    // persisted on the conversation row
    expect((await port.getConversation(opened.conversation.id))?.session_state).toEqual(expected)
  })

  it('feeds the prior history into the interpret call (not a turn-0 opening)', async () => {
    const { port, opened } = await seeded()
    const { provider, calls } = recordingProvider([
      JSON.stringify(goodDecision({ intent: 'interested' })),
      'Glad to hear it.',
    ])
    const engine = makeConversationEngineFromProvider(provider, port)

    await engine.replyTurn({
      conversationId: opened.conversation.id,
      company: company(),
      persona: persona(),
      candidateMessage: "I'm interested.",
    })

    // interpret (call 0) sees the candidate's latest message and is NOT turn 0
    const interpretUser = JSON.parse(calls[0].user) as {
      turn_0_opening_outreach: boolean
      candidate_latest_message: string | null
      conversation_so_far: unknown[]
    }
    expect(interpretUser.turn_0_opening_outreach).toBe(false)
    expect(interpretUser.candidate_latest_message).toBe("I'm interested.")
    expect(interpretUser.conversation_so_far).toHaveLength(1) // the opening agent message
    // exactly two model calls per turn
    expect(calls).toHaveLength(2)
    expect(calls[0].schema?.name).toBe('agent_decision')
    expect(calls[1].text).toBe(true)
  })

  it('carries a withheld grounding outcome through the reply turn', async () => {
    const { port, opened } = await seeded()
    const failing = goodDecision({ grounding: { ...goodDecision().grounding, passed: false }, status: 'escalated' })
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(failing),
      messageWriter: fakeWriter('needs review'),
      port,
    })

    const res = await engine.replyTurn({
      conversationId: opened.conversation.id,
      company: company(),
      persona: persona(),
      candidateMessage: 'Can you guarantee a signing bonus?',
    })

    expect(res.grounding.proceed).toBe(false)
    expect(res.grounding.annotate).toBe(true)
    expect(res.conversation.status).toBe('escalated')
  })

  it('throws when the conversation does not exist', async () => {
    const port = fakePort()
    const engine = makeConversationEngine({
      decisionEngine: fakeDecisionEngine(goodDecision()),
      messageWriter: fakeWriter('…'),
      port,
    })
    await expect(
      engine.replyTurn({
        conversationId: 'nope',
        company: company(),
        persona: persona(),
        candidateMessage: 'hi',
      }),
    ).rejects.toThrow(/not found/i)
  })
})
