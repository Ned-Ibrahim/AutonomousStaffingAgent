import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type {
  CandidateInput,
  Conversation,
  Message,
  OpeningTurnResult,
  ReplyTurnResult,
} from '../../supabase/functions/_shared/conversation'

/** Read a useful message out of a non-2xx Edge Function response. */
async function describeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) return String(body.error)
  }
  return error instanceof Error ? error.message : 'Request failed'
}

/** Run turn 0 (the opening outreach) for a candidate and persist it. */
export async function startConversation(
  companyId: string,
  candidate: CandidateInput,
): Promise<OpeningTurnResult> {
  const { data, error } = await supabase.functions.invoke('conversations', {
    body: { company_id: companyId, candidate },
  })
  if (error) throw new Error(await describeError(error))
  return data as OpeningTurnResult
}

/** Send a candidate reply into an existing conversation and run the next turn. */
export async function replyConversation(
  conversationId: string,
  candidateMessage: string,
): Promise<ReplyTurnResult> {
  const { data, error } = await supabase.functions.invoke('conversations', {
    body: { conversation_id: conversationId, candidate_message: candidateMessage },
  })
  if (error) throw new Error(await describeError(error))
  return data as ReplyTurnResult
}

/** Fetch a conversation and its messages by id. A missing conversation is an error. */
export async function getConversation(
  id: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const { data, error } = await supabase.functions.invoke(
    `conversations?id=${encodeURIComponent(id)}`,
    { method: 'GET' },
  )
  if (error) throw new Error(await describeError(error))
  return data as { conversation: Conversation; messages: Message[] }
}
