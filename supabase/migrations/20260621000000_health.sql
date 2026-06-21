-- Walking-skeleton table: a single row the health Edge Function reads back to
-- prove the frontend -> Edge Function -> database pipe works end to end.
create table if not exists public.health (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

-- Seed one row so the health check has something to return.
insert into public.health (status) values ('ok');
