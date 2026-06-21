-- Agent config: the personality a recruiting agent infers for itself from a
-- company's context. One company can have several (re-generations); the latest
-- is the active one. Structured persona + assumptions are stored as jsonb (the
-- agent reads them whole); confidence is a queryable enum.

create type agent_confidence as enum ('high', 'medium', 'low');

create table if not exists public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  persona jsonb not null,
  confidence agent_confidence not null,
  assumptions jsonb not null default '{"known_facts":[],"inferred_assumptions":[]}'::jsonb,
  rationale text not null default ''
);

create index if not exists agent_configs_company_idx
  on public.agent_configs (company_id, created_at desc);
