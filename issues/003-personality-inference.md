# Personality inference ("Generate agent")

## Parent PRD

`issues/prd.md`

## What to build

The context → agent-config step, end-to-end. From a saved company, the user clicks **Generate agent**; an Edge Function reads the company context, calls the model (GPT-4.1) to infer a structured persona (traits, voice rules, language/style, approaches to avoid, recruiting guidelines), tags it with an overall confidence level and separates company facts from assumptions, and saves it to `agent_configs`. The inferred persona, confidence, and assumptions are shown in the UI. Thin context degrades gracefully to a low-confidence, neutral-professional persona rather than fabricating one. This slice introduces the **ProviderClient** swap layer (first model call) and the **PersonalityInference** module. See PRD "Personality Inference", "AI Agent Configuration", and the `agent_configs` schema.

## Acceptance criteria

- [ ] `agent_configs` table migration matches the PRD schema (persona jsonb, confidence, assumptions jsonb, rules, fk to company).
- [ ] "Generate agent" button on a saved company triggers an Edge Function that calls the model through the ProviderClient abstraction.
- [ ] Inferred persona is structured, saved, and linked to the company; re-fetchable.
- [ ] Persona carries an overall confidence level and a one-line rationale; facts vs assumptions are separated.
- [ ] Thin/sparse company context produces a low-confidence, neutral-professional persona (no fabricated specifics).
- [ ] Persona, confidence, and assumptions are displayed in the UI after generation.
- [ ] LLM key used only server-side in the Edge Function.

## Blocked by

- Blocked by `issues/001-walking-skeleton-deploy.md`
- Blocked by `issues/002-company-intake-capture.md`

## User stories addressed

- User story 6
- User story 7
- User story 8
- User story 9
- User story 10
- User story 11
