# Walking skeleton + deploy pipeline

## Parent PRD

`issues/prd.md`

## What to build

A thin but fully-wired end-to-end skeleton, deployed and live, before any feature work. A React + TypeScript frontend on Vercel calls one trivial Supabase Edge Function, which reads/writes one trivial row in Postgres and returns it. The point is to prove the entire pipe — frontend → Edge Function → database, with secrets server-side — works in the deployed environment, so later slices fill features into a known-good pipeline. See PRD "Technical Approach" and "Platform & deployment".

This is HITL: it requires creating the Supabase project, the Vercel project, connecting the GitHub repo, and configuring secrets (the LLM provider key placeholder lives in Edge Function secrets, never client-side).

## Acceptance criteria

- [ ] React + TypeScript app scaffolded and runs locally.
- [ ] Supabase project created; Postgres reachable; a `health` (or similar trivial) table exists via migration.
- [ ] One Edge Function (Deno/TS) round-trips data from Postgres and returns it; deployed.
- [ ] Frontend calls the Edge Function and renders the returned value — no direct DB access from the client.
- [ ] LLM provider key placeholder stored in Edge Function secrets; nothing sensitive in client-side env.
- [ ] App deployed to Vercel at a public URL; pushing to the repo triggers a redeploy.
- [ ] README notes the local-dev and deploy steps.

## Blocked by

None - can start immediately.

## User stories addressed

- User story 30
- User story 31
- User story 32
- User story 33
