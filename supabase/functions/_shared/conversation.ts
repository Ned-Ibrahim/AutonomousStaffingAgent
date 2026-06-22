// The decision loop: interpret -> (ground-check) -> write, for one turn of a
// candidate conversation. Pure TypeScript (no Deno/Node APIs) so it is shared
// by the Edge Function (Deno), the frontend (Vite), and unit tests (Vitest).
//
// The autonomy lives in ONE place: the `interpret` call (DecisionEngine). It
// reads the situation and *chooses the next move* as a structured AgentDecision.
// MessageWriter only executes that decision into words; SessionReducer (slice
// 005) only remembers it; the Reasoning Panel only shows it. Two model calls per
// turn — decide first, write second — is the whole differentiator.
//
// Seams that make this testable in isolation:
//   - ProviderClient    — the model call, swappable (real OpenAI vs. fake).
//   - ConversationsPort  — persistence, swappable (Supabase vs. in-memory).

import type { CompanyContext } from './companies.ts'
import type { Confidence, Persona, ProviderClient } from './personality.ts'

// --- AgentDecision contract ------------------------------------------------
// This is the published contract for call 1. The Reasoning Panel renders it
// 1:1 and it is stored verbatim in messages.decision_data.

export const INTENT_VALUES = [
  'interested',
  'curious',
  'needs-info',
  'objection',
  'scheduling',
  'not-interested',
  'unclear',
] as const
export type CandidateIntent = (typeof INTENT_VALUES)[number]

export const SENTIMENT_VALUES = ['positive', 'neutral', 'mixed', 'negative'] as const
export type Sentiment = (typeof SENTIMENT_VALUES)[number]

export const ENGAGEMENT_VALUES = ['high', 'medium', 'low'] as const
export type Engagement = (typeof ENGAGEMENT_VALUES)[number]

export const NEXT_ACTION_VALUES = [
  'continue-engagement',
  'answer-question',
  'ask-for-info',
  'handle-objection',
  'adjust-approach',
  'suggest-next-step',
  'pause',
  'stop',
  'escalate-to-human',
] as const
export type NextAction = (typeof NEXT_ACTION_VALUES)[number]

export const CONVERSATION_STATUS_VALUES = ['active', 'paused', 'escalated', 'stopped'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUS_VALUES)[number]

/** The five self-reported grounding sub-checks plus the overall verdict. */
export interface Grounding {
  reflectsCompanyContext: boolean
  matchesCommunicationStyle: boolean
  usesCandidateInfo: boolean
  avoidsUnsupportedClaims: boolean
  followsBoundaries: boolean
  passed: boolean
}

/** The structured decision the agent makes before it writes a word. */
export interface AgentDecision {
  intent: CandidateIntent
  sentiment: Sentiment
  stage: string
  engagement: Engagement
  keyInfo: string[]
  nextAction: NextAction
  actionRationale: string
  status: ConversationStatus
  confidence: Confidence
  knownVsInferred: { knownFacts: string[]; inferredAssumptions: string[] }
  grounding: Grounding
  humanRecommended: boolean
  memoryNotes: string[]
}

// --- conversation + message records ----------------------------------------

export interface CandidateInput {
  name: string
  role: string | null
  context: string | null
}

/** Distilled session snapshot stored on the conversation (rendered as a strip). */
export interface SessionState {
  stage: string
  intent: CandidateIntent
  sentiment: Sentiment
  engagement: Engagement
  nextAction: NextAction
  status: ConversationStatus
}

export interface Conversation {
  id: string
  created_at: string
  company_id: string
  agent_config_id: string
  candidate_name: string
  candidate_role: string | null
  candidate_context: string | null
  status: ConversationStatus
  session_state: SessionState | Record<string, never>
}

export type MessageRole = 'agent' | 'candidate'

export interface Message {
  id: string
  created_at: string
  conversation_id: string
  role: MessageRole
  content: string
  decision_data: AgentDecision | null
}

// --- DecisionEngine (call 1: interpret) ------------------------------------

/** Everything the interpret call reasons over for a single turn. */
export interface InterpretBundle {
  company: CompanyContext
  persona: Persona
  candidate: CandidateInput
  /** Earlier turns, oldest first. Empty on turn 0. */
  history: { role: MessageRole; content: string }[]
  /** The candidate's latest message. Null on turn 0 (opening outreach). */
  latestCandidateMessage: string | null
}

/** Schema name + JSON Schema handed to the provider for strict structured output. */
export interface ResponseSchema {
  name: string
  schema: Record<string, unknown>
}

const strArrayProp = { type: 'array', items: { type: 'string' } }

/** Strict JSON Schema mirroring AgentDecision — guarantees a conformant decision. */
export const INTERPRET_SCHEMA: ResponseSchema = {
  name: 'agent_decision',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'intent',
      'sentiment',
      'stage',
      'engagement',
      'keyInfo',
      'nextAction',
      'actionRationale',
      'status',
      'confidence',
      'knownVsInferred',
      'grounding',
      'humanRecommended',
      'memoryNotes',
    ],
    properties: {
      intent: { type: 'string', enum: [...INTENT_VALUES] },
      sentiment: { type: 'string', enum: [...SENTIMENT_VALUES] },
      stage: { type: 'string' },
      engagement: { type: 'string', enum: [...ENGAGEMENT_VALUES] },
      keyInfo: strArrayProp,
      nextAction: { type: 'string', enum: [...NEXT_ACTION_VALUES] },
      actionRationale: { type: 'string' },
      status: { type: 'string', enum: [...CONVERSATION_STATUS_VALUES] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      knownVsInferred: {
        type: 'object',
        additionalProperties: false,
        required: ['knownFacts', 'inferredAssumptions'],
        properties: { knownFacts: strArrayProp, inferredAssumptions: strArrayProp },
      },
      grounding: {
        type: 'object',
        additionalProperties: false,
        required: [
          'reflectsCompanyContext',
          'matchesCommunicationStyle',
          'usesCandidateInfo',
          'avoidsUnsupportedClaims',
          'followsBoundaries',
          'passed',
        ],
        properties: {
          reflectsCompanyContext: { type: 'boolean' },
          matchesCommunicationStyle: { type: 'boolean' },
          usesCandidateInfo: { type: 'boolean' },
          avoidsUnsupportedClaims: { type: 'boolean' },
          followsBoundaries: { type: 'boolean' },
          passed: { type: 'boolean' },
        },
      },
      humanRecommended: { type: 'boolean' },
      memoryNotes: strArrayProp,
    },
  },
}

function buildInterpretPrompt(bundle: InterpretBundle): { system: string; user: string; schema: ResponseSchema } {
  const { company, persona, candidate, history, latestCandidateMessage } = bundle
  const turnZero = latestCandidateMessage === null

  // STABLE PREFIX (rarely changes -> caches): role, company facts, persona, rules.
  const system = [
    'You are the decision core of an autonomous recruiting agent. Each turn you produce ONE structured',
    'decision: read the situation and CHOOSE the next move. You decide the move; a separate step writes the',
    'message. Your job is the decision, not the prose.',
    '',
    'Company you represent (ground every choice in this — never contradict or exceed it):',
    JSON.stringify({
      name: company.name,
      one_liner: company.one_liner,
      about: company.about,
      culture_values: company.culture_values,
      hiring_needs: company.hiring_needs,
      candidate_profiles: company.candidate_profiles,
      recruiting_process: company.recruiting_process,
      recruiting_goals: company.recruiting_goals,
      tone: company.tone,
    }),
    '',
    'Your configured personality and boundaries (the company voice is a HARD constraint):',
    JSON.stringify(persona),
    '',
    'Rules:',
    '- Separate facts the company actually gave you (knownFacts) from your own reasonable guesses (inferredAssumptions). Never present an assumption as a fact.',
    '- Self-check grounding honestly: each grounding flag is true only if it genuinely holds; passed is true only if the message you would send stays inside company context, voice, and boundaries.',
    '- Pick nextAction from the allowed set; justify it in actionRationale weighed against the recruiting goal.',
    '- Set humanRecommended/escalate-to-human or stop when continuing would be inappropriate. Knowing when NOT to act is part of the job.',
    turnZero
      ? '- This is TURN 0: there is no candidate reply yet. Reason over the candidate profile and the recruiting goal to plan the OPENING outreach. Use stage "initial-outreach"; nextAction is typically continue-engagement or suggest-next-step.'
      : '- Reason over the candidate\'s latest reply in the context of the conversation so far.',
  ].join('\n')

  // DYNAMIC TAIL (changes every turn): candidate + goal + history + latest reply.
  const user = JSON.stringify({
    candidate: { name: candidate.name, role: candidate.role, context: candidate.context },
    recruiting_goal: company.recruiting_goals,
    conversation_so_far: history,
    candidate_latest_message: latestCandidateMessage,
    turn_0_opening_outreach: turnZero,
  })

  return { system, user, schema: INTERPRET_SCHEMA }
}

// coercion helpers — a strict provider should always conform, but we never trust
// raw model output blindly. Unusable output yields null (caller falls back safe).
const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')
const asBool = (v: unknown): boolean => v === true
const inEnum = <T extends string>(values: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback

function parseJsonLoose(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned)
}

/**
 * Validate + coerce raw model text into an AgentDecision. Returns null if the
 * text is not usable JSON at all (caller substitutes the safe fallback). A
 * partially-malformed object is repaired field-by-field rather than rejected.
 */
export function parseDecision(text: string): AgentDecision | null {
  let raw: Record<string, unknown>
  try {
    raw = parseJsonLoose(text) as Record<string, unknown>
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null

  const kvi = (raw.knownVsInferred ?? {}) as Record<string, unknown>
  const g = (raw.grounding ?? {}) as Record<string, unknown>

  return {
    intent: inEnum(INTENT_VALUES, raw.intent, 'unclear'),
    sentiment: inEnum(SENTIMENT_VALUES, raw.sentiment, 'neutral'),
    stage: asStr(raw.stage) || 'initial-outreach',
    engagement: inEnum(ENGAGEMENT_VALUES, raw.engagement, 'medium'),
    keyInfo: asStrArray(raw.keyInfo),
    nextAction: inEnum(NEXT_ACTION_VALUES, raw.nextAction, 'continue-engagement'),
    actionRationale: asStr(raw.actionRationale),
    status: inEnum(CONVERSATION_STATUS_VALUES, raw.status, 'active'),
    confidence: inEnum(['high', 'medium', 'low'] as const, raw.confidence, 'medium'),
    knownVsInferred: {
      knownFacts: asStrArray(kvi.knownFacts),
      inferredAssumptions: asStrArray(kvi.inferredAssumptions),
    },
    grounding: {
      reflectsCompanyContext: asBool(g.reflectsCompanyContext),
      matchesCommunicationStyle: asBool(g.matchesCommunicationStyle),
      usesCandidateInfo: asBool(g.usesCandidateInfo),
      avoidsUnsupportedClaims: asBool(g.avoidsUnsupportedClaims),
      followsBoundaries: asBool(g.followsBoundaries),
      passed: asBool(g.passed),
    },
    humanRecommended: asBool(raw.humanRecommended),
    memoryNotes: asStrArray(raw.memoryNotes),
  }
}

/**
 * A safe, conservative decision used when the model output cannot be parsed.
 * It does not crash the turn — it flags low confidence, fails grounding, and
 * recommends a human, so a bad model response degrades to "ask a human" rather
 * than to a confident-but-unfounded message.
 */
export function fallbackDecision(): AgentDecision {
  return {
    intent: 'unclear',
    sentiment: 'neutral',
    stage: 'initial-outreach',
    engagement: 'low',
    keyInfo: [],
    nextAction: 'escalate-to-human',
    actionRationale: 'The decision could not be parsed into a structured form, so the agent defers to a human rather than guessing.',
    status: 'escalated',
    confidence: 'low',
    knownVsInferred: { knownFacts: [], inferredAssumptions: [] },
    grounding: {
      reflectsCompanyContext: false,
      matchesCommunicationStyle: false,
      usesCandidateInfo: false,
      avoidsUnsupportedClaims: false,
      followsBoundaries: false,
      passed: false,
    },
    humanRecommended: true,
    memoryNotes: ['Structured decision unavailable; conversation escalated for human review.'],
  }
}

export interface DecisionEngine {
  interpret(bundle: InterpretBundle): Promise<AgentDecision>
}

/** Build the DecisionEngine. A null provider degrades every turn to the safe fallback. */
export function makeDecisionEngine(provider: ProviderClient | null): DecisionEngine {
  return {
    async interpret(bundle) {
      if (!provider) return fallbackDecision()
      let text: string
      try {
        text = await provider.complete(buildInterpretPrompt(bundle))
      } catch {
        return fallbackDecision()
      }
      return parseDecision(text) ?? fallbackDecision()
    },
  }
}

// --- GroundingCheck (consumes the self-reported grounding) -----------------

export interface GroundingOutcome {
  /** May the message proceed (be displayed/sent as-is) without review? */
  proceed: boolean
  /** Should the message be annotated as needing review before a real send? */
  annotate: boolean
  reason: string
}

/**
 * Decide how the app handles the model's self-reported grounding. This tests the
 * APP's handling, not the model's judgment: passed -> proceed; failed -> withhold
 * & annotate; missing/malformed grounding -> treat as failed, never crash.
 */
export function checkGrounding(
  decision: { grounding?: Partial<Grounding> | null } | null | undefined,
): GroundingOutcome {
  const g = decision?.grounding
  if (!g || typeof g !== 'object' || typeof g.passed !== 'boolean') {
    return {
      proceed: false,
      annotate: true,
      reason: 'Grounding self-check was missing or malformed; withholding for review.',
    }
  }
  if (g.passed) {
    return { proceed: true, annotate: false, reason: 'Grounding self-check passed.' }
  }
  return {
    proceed: false,
    annotate: true,
    reason: 'Grounding self-check did not pass; message withheld pending review.',
  }
}

// --- MessageWriter (call 2: write) -----------------------------------------

export interface WriteArgs {
  decision: AgentDecision
  persona: Persona
  company: CompanyContext
  candidate: CandidateInput
  history: { role: MessageRole; content: string }[]
}

function buildWritePrompt(args: WriteArgs): { system: string; user: string; text: true } {
  const { decision, persona, company, candidate, history } = args
  const turnZero = history.length === 0

  const system = [
    'You write the candidate-facing message for an autonomous recruiting agent. The decision has already',
    'been made — your only job is to phrase it well, in the company voice, inside the company boundaries.',
    'Do not change the chosen action. Do not invent facts the company did not provide.',
    '',
    'Company:',
    JSON.stringify({ name: company.name, one_liner: company.one_liner, tone: company.tone }),
    '',
    'Voice and boundaries:',
    JSON.stringify(persona),
    '',
    'Output ONLY the message text the candidate should receive — no preamble, no quotes, no markdown.',
  ].join('\n')

  const user = JSON.stringify({
    decided_action: decision.nextAction,
    action_rationale: decision.actionRationale,
    candidate: { name: candidate.name, role: candidate.role, context: candidate.context },
    conversation_so_far: history,
    instruction: turnZero
      ? 'Write the OPENING outreach message to this candidate, in the company voice.'
      : 'Write the next reply to the candidate, executing the decided action.',
  })

  return { system, user, text: true }
}

export interface MessageWriter {
  write(args: WriteArgs): Promise<string>
}

/** Build the MessageWriter. A null provider yields a safe, generic opener. */
export function makeMessageWriter(provider: ProviderClient | null): MessageWriter {
  return {
    async write(args) {
      if (!provider) return genericOpener(args)
      try {
        const text = await provider.complete(buildWritePrompt(args))
        const trimmed = text.trim()
        return trimmed.length > 0 ? trimmed : genericOpener(args)
      } catch {
        return genericOpener(args)
      }
    },
  }
}

function genericOpener(args: WriteArgs): string {
  const { candidate, company } = args
  return `Hi ${candidate.name}, I'm reaching out on behalf of ${company.name}. We'd love to tell you more about an opportunity that may be a good fit — would you be open to a quick conversation?`
}

// --- persistence -----------------------------------------------------------

export interface NewConversation {
  company_id: string
  agent_config_id: string
  candidate_name: string
  candidate_role: string | null
  candidate_context: string | null
  status: ConversationStatus
  session_state: SessionState
}

export interface NewMessage {
  conversation_id: string
  role: MessageRole
  content: string
  decision_data: AgentDecision | null
}

export interface ConversationUpdate {
  status: ConversationStatus
  session_state: SessionState
}

export interface ConversationsPort {
  insertConversation(c: NewConversation): Promise<Conversation>
  insertMessage(m: NewMessage): Promise<Message>
  getConversation(id: string): Promise<Conversation | null>
  listMessages(conversationId: string): Promise<Message[]>
  updateConversation(id: string, patch: ConversationUpdate): Promise<Conversation>
}

export function sessionFromDecision(d: AgentDecision): SessionState {
  return {
    stage: d.stage,
    intent: d.intent,
    sentiment: d.sentiment,
    engagement: d.engagement,
    nextAction: d.nextAction,
    status: d.status,
  }
}

/**
 * SessionReducer (the slice-005 headline). Pure function: derive the next session
 * snapshot from the previous one and the new decision. This is the conversation's
 * running memory — every turn folds the latest decision into it.
 *
 * Rules:
 *   - Turn 0 (no prior session): the session IS the first decision.
 *   - A 'stopped' conversation is terminal — once ended, later turns cannot silently
 *     reopen it; the snapshot is frozen. (Defensive: the UI also stops sending.)
 *   - Otherwise the new decision wins for every field — stage may advance, intent /
 *     sentiment / engagement / nextAction / status all reflect the latest read.
 */
export function reduceSession(prev: SessionState | null, decision: AgentDecision): SessionState {
  if (!prev) return sessionFromDecision(decision)
  if (prev.status === 'stopped') return prev
  return sessionFromDecision(decision)
}

// --- orchestrator: one opening turn ----------------------------------------

export interface OpeningTurnInput {
  company: CompanyContext
  persona: Persona
  agentConfigId: string
  candidate: CandidateInput
}

export interface OpeningTurnResult {
  conversation: Conversation
  message: Message
  decision: AgentDecision
  grounding: GroundingOutcome
}

export interface ReplyTurnInput {
  conversationId: string
  company: CompanyContext
  persona: Persona
  /** The candidate's new message that this turn responds to. */
  candidateMessage: string
}

export interface ReplyTurnResult {
  conversation: Conversation
  candidateMessage: Message
  agentMessage: Message
  decision: AgentDecision
  grounding: GroundingOutcome
  session: SessionState
}

export interface ConversationEngine {
  openingTurn(input: OpeningTurnInput): Promise<OpeningTurnResult>
  replyTurn(input: ReplyTurnInput): Promise<ReplyTurnResult>
}

/** Narrow a stored session_state (may be `{}` on a fresh row) to a usable SessionState. */
function asSessionState(raw: SessionState | Record<string, never> | null | undefined): SessionState | null {
  return raw && typeof raw === 'object' && 'stage' in raw ? (raw as SessionState) : null
}

/**
 * Run turn 0: interpret the situation (decide), ground-check the decision, write
 * the opening message, and persist the conversation + first message. Nothing is
 * sent to any real channel — the message and its decision are stored for display.
 */
export function makeConversationEngine(deps: {
  decisionEngine: DecisionEngine
  messageWriter: MessageWriter
  port: ConversationsPort
}): ConversationEngine {
  const { decisionEngine, messageWriter, port } = deps
  return {
    async openingTurn({ company, persona, agentConfigId, candidate }) {
      const bundle: InterpretBundle = {
        company,
        persona,
        candidate,
        history: [],
        latestCandidateMessage: null,
      }
      const decision = await decisionEngine.interpret(bundle)
      const grounding = checkGrounding(decision)
      const content = await messageWriter.write({ decision, persona, company, candidate, history: [] })

      const conversation = await port.insertConversation({
        company_id: company.id,
        agent_config_id: agentConfigId,
        candidate_name: candidate.name,
        candidate_role: candidate.role,
        candidate_context: candidate.context,
        status: decision.status,
        session_state: sessionFromDecision(decision),
      })
      const message = await port.insertMessage({
        conversation_id: conversation.id,
        role: 'agent',
        content,
        decision_data: decision,
      })

      return { conversation, message, decision, grounding }
    },

    async replyTurn({ conversationId, company, persona, candidateMessage }) {
      const existing = await port.getConversation(conversationId)
      if (!existing) throw new Error('conversation not found')

      const prior = await port.listMessages(conversationId)
      const history = prior.map((m) => ({ role: m.role, content: m.content }))
      const candidate: CandidateInput = {
        name: existing.candidate_name,
        role: existing.candidate_role,
        context: existing.candidate_context,
      }

      // Record the candidate's message first — it is part of the conversation
      // whether or not the agent ends up replying.
      const candidateRow = await port.insertMessage({
        conversation_id: conversationId,
        role: 'candidate',
        content: candidateMessage,
        decision_data: null,
      })

      // Decide, then write — same two-call loop as turn 0, now reasoning over the
      // reply in the context of everything said so far.
      const decision = await decisionEngine.interpret({
        company,
        persona,
        candidate,
        history,
        latestCandidateMessage: candidateMessage,
      })
      const grounding = checkGrounding(decision)
      const content = await messageWriter.write({
        decision,
        persona,
        company,
        candidate,
        history: [...history, { role: 'candidate', content: candidateMessage }],
      })

      const agentRow = await port.insertMessage({
        conversation_id: conversationId,
        role: 'agent',
        content,
        decision_data: decision,
      })

      // Fold the decision into the running session memory.
      const session = reduceSession(asSessionState(existing.session_state), decision)
      const conversation = await port.updateConversation(conversationId, {
        status: session.status,
        session_state: session,
      })

      return { conversation, candidateMessage: candidateRow, agentMessage: agentRow, decision, grounding, session }
    },
  }
}

/** Convenience: assemble the engine from a single provider + port. */
export function makeConversationEngineFromProvider(
  provider: ProviderClient | null,
  port: ConversationsPort,
): ConversationEngine {
  return makeConversationEngine({
    decisionEngine: makeDecisionEngine(provider),
    messageWriter: makeMessageWriter(provider),
    port,
  })
}

// --- Supabase-backed port (used by the Edge Function) ----------------------

export interface SupabaseLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any
}

export function createSupabaseConversationsPort(client: SupabaseLike): ConversationsPort {
  return {
    async insertConversation(c) {
      const { data, error } = await client.from('conversations').insert(c).select().single()
      if (error) throw new Error(error.message)
      return data as Conversation
    },
    async insertMessage(m) {
      const { data, error } = await client.from('messages').insert(m).select().single()
      if (error) throw new Error(error.message)
      return data as Message
    },
    async getConversation(id) {
      const { data, error } = await client.from('conversations').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Conversation) ?? null
    },
    async listMessages(conversationId) {
      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data as Message[]) ?? []
    },
    async updateConversation(id, patch) {
      const { data, error } = await client
        .from('conversations')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as Conversation
    },
  }
}
