-- Conversations + messages: a recruiting agent's candidate chats and every turn
-- of them. The agent's structured decision for a turn (the interpret output) is
-- stored on the agent message as jsonb (read whole, rendered in the Reasoning
-- Panel); the distilled session snapshot lives on the conversation as jsonb.
-- Nothing here is ever sent to a real channel — it is the agent's own workspace.

create type conversation_status as enum ('active', 'paused', 'escalated', 'stopped');
create type message_role as enum ('agent', 'candidate');

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_config_id uuid not null references public.agent_configs (id) on delete cascade,
  candidate_name text not null,
  candidate_role text,
  candidate_context text,
  status conversation_status not null default 'active',
  session_state jsonb not null default '{}'::jsonb
);

create index if not exists conversations_company_idx
  on public.conversations (company_id, created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role message_role not null,
  content text not null,
  decision_data jsonb
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);
