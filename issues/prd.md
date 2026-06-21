# PRD — Autonomous AI Recruiting Agent Platform

## Problem Statement

Companies that recruit at volume need to engage every candidate quickly, in their own voice, and move each conversation toward the right next step. Doing this by hand doesn't scale, and generic automated messaging feels like a mass blast — it doesn't reflect who the company is, doesn't react to what the candidate actually says, and can't decide what to do next on its own.

What's missing is an agent that genuinely represents a specific company: one that knows the company's identity and culture, holds a consistent personality, reads each candidate reply, and autonomously decides how to carry the conversation forward — not a thin wrapper that turns one prompt into one message.

## Solution

A full-stack web application to create and configure autonomous AI recruiting agents, one per company. A user:

1. Fills a **company intake form** (overview, culture and values, hiring needs, candidate profiles, recruiting process, tone, goals). Saved to Supabase.
2. Clicks **Generate agent** to run **personality inference** — the system reads the saved context and derives a structured agent persona (traits, voice rules, language/style, approaches to avoid, recruiting guidelines), tagging each inference with a confidence level and separating company facts from assumptions. When context is thin, it marks low-confidence assumptions and falls back to a neutral professional voice instead of presenting guesses as fact. (An explicit button keeps the inference step visible rather than hiding it behind the save.)
3. Opens a **safe test area** with a chat simulator. The user plays the candidate; the agent responds in the company's voice. Nothing is emailed or sent to any external channel.
4. Watches an **Agent Reasoning Panel** beside the chat that, for every candidate reply, shows the agent's structured decision: detected intent, sentiment, conversation stage, engagement, key concerns, chosen next-best action and why, session updates, grounding-check result, confidence/assumptions, and whether a human recruiter should step in.

The agent runs a real decision loop — **interpret the situation (intent, session update, action choice, grounding self-check) → write the message** — and the decision data is rendered in the panel so its reasoning is visible and inspectable. Decision-making is separated from message generation: exactly two model calls per turn (interpret, then write). The grounding self-check is part of the interpret call's structured output, not a separate call. The single model (GPT-4.1) sits behind a thin provider abstraction so it can be swapped in one place.

### Release scope

**v1 (must ship):**

- Company intake form → persisted context.
- Personality inference → persisted agent config (with confidence + assumptions).
- Chat simulator (one company at a time) with the full interpret→write decision loop.
- Agent Reasoning Panel showing structured decision data each turn.
- Session-level state that updates after each candidate reply and adapts the agent's approach within company boundaries.
- Grounding check before each message.
- Deployed to Vercel + Supabase, no auth, keys server-side only.
- Tests on the core modules (below).

**Phase 2 (designed here, not built in v1):**

- Multi-company side-by-side persona comparison.
- Standalone message-preview tab with regenerate (folded into the simulator for v1).
- Channel-specific message formatting (email vs LinkedIn vs SMS).
- Candidate-profile library / ATS import.
- Analytics and message A/B testing.

## User Stories

**Company intake**

1. As a user, I want to enter a company's overview, culture, hiring needs, candidate profiles, recruiting process, tone, and goals in a form, so that the agent has real context to work from.
2. As a user, I want required fields validated before submit, so that I don't save an unusable context.
3. As a user, I want the saved company context to persist across page refreshes, so that I can return to it.
4. As a user, I want to enter a company I've never used before, so that I can configure an agent for any company on the fly.
5. As a user, I want each saved company to be retrievable by id, so that downstream agent features can load it.

**Personality inference & agent config**
6. As a user, I want the system to infer an agent personality from the company context after I save it, so that I don't hand-author the persona.
7. As a user, I want the inferred persona to include traits, voice rules, language/style, approaches to avoid, and recruiting guidelines, so that behavior is well-defined.
8. As a user, I want each inferred persona to carry a confidence level and a one-line rationale, so that I can judge how grounded it is.
9. As a user, I want the system to separate company facts from assumptions, so that incomplete context doesn't get presented as fact.
10. As a user, I want a neutral professional fallback voice when context is thin, so that the agent doesn't fabricate a personality.
11. As a user, I want the generated agent config (persona + knowledge + goals + engagement rules + escalation + grounding rules) saved, so that the agent stays consistent across turns.

**Test area & simulator**
12. As a user, I want a safe test area that never sends real emails or LinkedIn messages, so that I can assess the agent risk-free.
13. As a user, I want to add basic candidate info before starting, so that the agent can personalize.
14. As a user, I want to see the agent's initial outreach message, so that I can judge the opening.
15. As a user, I want to type candidate replies manually and send them, so that I can drive a realistic conversation.
16. As a user, I want to run multiple turns, so that I can see how the agent adapts over a conversation arc.
17. As a user, I want the conversation history persisted, so that the agent and I keep continuity across refreshes.
18. As a user, I want a clear "no real messages are sent" indicator, so that I trust the sandbox.

**Reasoning panel & intelligence**
19. As a user, I want a panel beside the chat showing detected candidate intent and sentiment each turn, so that I can see the agent interpret, not just reply.
20. As a user, I want to see the current conversation stage and candidate engagement level, so that I understand where the agent thinks it is.
21. As a user, I want to see the selected next-best action and a short reason, so that I can audit its decision-making.
22. As a user, I want to see session/memory updates the agent recorded, so that I can confirm it's learning across turns.
23. As a user, I want to see the grounding-check result before a message, so that I know the message was validated against company context.
24. As a user, I want to see confidence levels and which claims are assumptions, so that I can trust it responsibly.
25. As a user, I want to see when the agent recommends human-recruiter involvement, so that I know it recognizes its limits.

**Autonomy & adaptation**
26. As a user, I want the agent to choose its next action without me directing each step, so that it behaves autonomously.
27. As a user, I want the agent to handle objections, answer questions, ask for info, lower pressure, suggest next steps, or pause/stop/escalate as appropriate, so that it covers a real recruiting conversation.
28. As a user, I want the agent to adjust tone (more concise, more explanatory, lower-pressure) within company boundaries, so that it adapts to the candidate without losing the company's identity.
29. As a user, I want the agent to never override the company's core identity or break recruiting rules, so that adaptation stays safe.

**Platform & deployment**
30. As a user, I want the app deployed at a public URL, so that it can be used from anywhere.
31. As a developer, I want LLM keys kept in Supabase Edge Function secrets, so that they're never exposed client-side.
32. As a developer, I want the model called only through Edge Functions, so that orchestration and secrets stay server-side.
33. As a developer, I want the model behind a thin provider abstraction, so that swapping models is a one-place change.

## Implementation Decisions

**Stack**

- Frontend: React + TypeScript, deployed on Vercel.
- Backend: Supabase — Postgres for data, Edge Functions (Deno/TS) for all business logic and LLM orchestration.
- Model: GPT-4.1, single provider, called only from Edge Functions. Keys in Edge Function secrets.
- No authentication in v1.

**Agent decision architecture — two calls per turn**

- Call 1 (**interpret/decide**): given company config + persona + session state + candidate profile + conversation history + latest candidate reply, returns a structured decision object: detected intent, sentiment, conversation stage, engagement level, key concerns, known-facts vs assumptions, confidence level, recommended next action + rationale, session-state updates, escalate-to-human flag.
- Grounding self-check: the interpret call's structured output includes a grounding assessment — does the planned direction stay within company context, configured style, candidate info, no-unsupported-claims, and recruiting boundaries — with a pass flag and any issues. This is part of call 1, NOT a separate model call, so each turn stays at two calls.
- Call 2 (**write**): given the decision object + persona + history, produces the candidate-facing message in the company's voice.
- The Edge Function returns BOTH the candidate-facing message and the structured decision data; the frontend renders the message in chat and the decision in the Reasoning Panel.

**Two levels of context**

- Company-level config: long-term identity — knowledge, approved tone, recruiting goals, communication boundaries. Set at inference time, stable across sessions.
- Session-level config: per-conversation — stage, candidate intent, engagement, concerns, current communication approach, next recommended action. Updated every turn by call 1.

**Deep modules (encapsulated, testable in isolation via mocked model)**

- **ContextStore** — persist/fetch company context and agent config. Interface: save, getById, list. No LLM.
- **PersonalityInference** — input company context, output structured persona with confidence + facts/assumptions split. One model call behind the provider abstraction.
- **DecisionEngine (interpret)** — input full context bundle + candidate reply, output the structured decision object. The "brain." One model call; schema-validated output.
- **SessionReducer** — pure function: (current session state, decision object) → next session state. No LLM, fully deterministic, the most unit-testable piece.
- **GroundingCheck** — consumes the grounding block the interpret call self-reports (pass flag + issues) and decides how the app reacts: pass → the message proceeds; fail → the message is withheld or annotated in the panel. No separate model call. Unit-tested against mocked interpret output, so it tests the app's handling of the self-reported grounding (not the model's judgment).
- **MessageWriter (write)** — input decision + persona + history, output candidate-facing message. One model call.
- **ProviderClient** — the swap layer: (model, messages, optional JSON schema) → structured/text response. Wraps GPT-4.1; isolates the SDK so a model swap is one edit.

**Schema (Postgres, columns for queried fields, text for prose)**

- `companies` — id, created_at, name, one_liner, about (text), culture_values (text), hiring_needs (text), candidate_profiles (text), recruiting_process (text), tone (enum: `warm` / `formal` / `casual` / `direct` / `playful`), recruiting_goals (text). Required: name, one_liner, tone. All other fields optional — thin context degrades gracefully to a low-confidence, neutral-professional persona (stories 9–10).
- `agent_configs` — id, company_id (fk), persona (jsonb), confidence (text: high/medium/low — a single overall confidence is a v1 simplification; per-trait confidence is phase 2), assumptions (jsonb), communication_rules, escalation_boundaries, grounding_rules, created_at.
- `conversations` — id, company_id (fk), candidate_info, session_state (jsonb), status, created_at.
- `messages` — id, conversation_id (fk), role (agent|candidate), content, decision_data (jsonb, null for candidate turns), created_at.

**API contracts (Edge Functions, conceptual)**

- Create / read / list company context.
- Infer persona + generate agent config from a company id.
- Start a conversation (company id + candidate info) → returns initial agent message + decision data.
- Agent turn (conversation id + candidate reply) → returns updated session state, decision data, grounding result, and the next agent message.

## Testing Decisions

A good test asserts external behavior through a module's public interface, not internal implementation. Model calls are mocked so tests are deterministic and don't hit the network — we assert on how a module shapes inputs and handles outputs, not on model wording.

Modules to test (all four selected):

- **SessionReducer** — pure function, highest-value: given a decision object, the next session state updates stage/approach/next-action correctly; tone adapts within boundaries but core identity is never overwritten; escalate flag flips state appropriately.
- **DecisionEngine** — with a mocked model returning known decision JSON, assert the context bundle is assembled correctly and malformed/invalid model output is rejected or repaired rather than crashing.
- **GroundingCheck** — given mocked interpret output: a clean grounding block lets the message proceed; a block that flags unsupported claims or out-of-bounds direction causes the message to be withheld/annotated; malformed grounding data is handled without crashing. (Tests the app's handling of the self-reported grounding, not the model's judgment.)
- **ContextStore** — save → getById round-trips; required-field validation rejects malformed input; list returns saved companies.

Behavioral/agent tests across scenarios: interested candidate, objection, off-topic, going-cold, explicit decline — verify the agent stays in role, keeps a consistent company-specific persona, adapts strategy to the signal, and escalates/stops when appropriate. Verify no code path emits a real message from the test environment.

## Out of Scope

- Multi-company side-by-side persona comparison (designed; phase 2).
- Standalone message-preview tab with regenerate (folded into simulator for v1).
- Real sending over email / LinkedIn / any external channel — explicitly never.
- Authentication / multi-user / per-user data isolation.
- Channel-specific message formatting.
- Candidate-profile library / ATS import.
- Analytics, reporting, message A/B testing.
- Multiple model providers live (single model + swap layer only).

## Further Notes

- The differentiator is visible, inspectable reasoning — the Reasoning Panel plus the interpret/write split — so the agent's intelligence is demonstrable rather than implied.
- Architecture diagram (deliverable) follows the documented decision flow: Company Context → Personality Inference → Agent Configuration → Candidate Context → Candidate Reply → Intent/Sentiment Interpretation → Confidence/Assumption Check → Session Update → Next-Best-Action → Grounding Check → Response Generation → Memory Update.
- The `companies` table here is the data contract referenced by the company-context capture issue.

