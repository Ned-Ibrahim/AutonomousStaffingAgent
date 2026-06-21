-- Company context: the raw intake a recruiting agent later configures itself from.
-- Columns for fields we query/branch on (name, tone); text for prose the agent
-- reads whole. Persona derivation is a separate concern (later slice).

create type company_tone as enum ('warm', 'formal', 'casual', 'direct', 'playful');

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  one_liner text not null,
  about text,
  culture_values text,
  hiring_needs text,
  candidate_profiles text,
  recruiting_process text,
  tone company_tone not null,
  recruiting_goals text
);
