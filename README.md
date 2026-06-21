# Autonomous Staffing Agent

A full-stack web app to create and configure autonomous AI recruiting agents. A company's context (identity, culture, the profiles it hires, tone) is captured, an agent configures itself from that context — giving itself a personality — then generates and runs a candidate-engagement conversation, reasoning visibly about each step.

See [`issues/prd.md`](issues/prd.md) for the product PRD and [`issues/`](issues/) for the build slices.

## Stack

- **Frontend:** React + TypeScript (Vite), deployed on Vercel.
- **Backend:** Supabase — Postgres + Edge Functions (Deno). All model calls and business logic run server-side in Edge Functions; secrets never reach the client.

## Current state

Slice 001 — **walking skeleton**: the browser calls a Supabase Edge Function (`health`), which reads a row from Postgres and returns it. This proves the full pipe (frontend → Edge Function → database) end to end, deployed, before feature work begins.

## Local development

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are client-safe. Server-only secrets (service-role key, LLM provider keys) live in Edge Function secrets and are never put in `.env`.

## Deploy

### 1. Supabase

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                 # applies migrations in supabase/migrations
npx supabase functions deploy health # deploys the Edge Function
```

(LLM keys, when later slices need them, are set with `npx supabase secrets set OPENAI_API_KEY=...`.)

### 2. Vercel

```bash
npx vercel            # link the project (first run)
npx vercel --prod     # deploy
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel environment variables (Project → Settings → Environment Variables). Vercel auto-redeploys on push to the connected branch. Build command `npm run build`, output `dist` (see `vercel.json`).

## Project layout

```
src/                       React app
  lib/supabase.ts          browser Supabase client (URL + anon key only)
supabase/
  migrations/              SQL migrations
  functions/health/        the health Edge Function (Deno)
  config.toml              Supabase project config
issues/                    PRD + build-slice specs
```
