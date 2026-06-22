// Frontend-facing type surface. Re-exported from the shared decision modules so
// the UI imports a stable '@/lib/types' contract rather than reaching into the
// Edge Function internals. These are types only — no runtime code crosses over.

export type {
  AgentDecision,
  CandidateIntent,
  Sentiment,
  Engagement,
  NextAction,
  ConversationStatus,
  Grounding,
  SessionState,
  Conversation,
  Message,
  CandidateInput,
  MessageRole,
  OpeningTurnResult,
  NewConversation,
  NewMessage,
} from '../../supabase/functions/_shared/conversation'

export type { Confidence, Persona, AgentConfig } from '../../supabase/functions/_shared/personality'

export type { CompanyContext, Tone } from '../../supabase/functions/_shared/companies'
