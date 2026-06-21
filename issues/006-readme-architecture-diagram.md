# README + architecture diagram

## Parent PRD

`issues/prd.md`

## What to build

The closing deliverables. A README that explains what was built and the key design choices, and includes one line answering: what makes the agent intelligent and not just an LLM call (the two-call interpret/write split + the visible reasoning panel). An architecture diagram showing the frontend, Vercel, Supabase (Postgres + Edge Functions), the model provider, and the decision flow. A final pass verifying the deployed app works end to end. HITL: the diagram and the README's claims need human authoring/review before release. See PRD "Further Notes" (decision-flow string) and "Deliverables".

## Acceptance criteria

- [ ] README explains the project, the build, and the main design decisions.
- [ ] README contains the one-line "intelligent, not just an LLM call" answer.
- [ ] Architecture diagram shows frontend, Vercel, Supabase (Postgres + Edge Functions), model provider, and the documented decision flow (Company Context → Personality Inference → Agent Configuration → Candidate Context → Candidate Reply → Intent/Sentiment Interpretation → Confidence/Assumption Check → Session Update → Next-Best-Action → Grounding Check → Response Generation → Memory Update).
- [ ] Deployed app verified end-to-end: intake → generate agent → preview/initial message → simulate a conversation, with no real messages sent.
- [ ] Public URL and repo are ready to share.

## Blocked by

- Blocked by `issues/005-candidate-reply-turn-loop.md`

## User stories addressed

- Deliverables (see PRD "Deliverables"); cross-cutting verification of stories 1–33.
