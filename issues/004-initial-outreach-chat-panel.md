# Initial outreach + chat shell + reasoning panel

## Parent PRD

`issues/prd.md`

## What to build

The first appearance of the decision loop, end-to-end, for turn 0 (the agent's opening message — no candidate reply yet). The user picks a configured company agent, enters basic candidate info, and starts a conversation. The Edge Function runs the two-call loop: call 1 (**DecisionEngine / interpret**) reasons over the candidate profile + company goal and emits a structured decision (including the grounding self-check); call 2 (**MessageWriter / write**) produces the opening message in the company's voice. The chat shell shows the message; the **Agent Reasoning Panel** beside it shows the structured decision. Conversation and message are persisted. Nothing is sent to any real channel. See PRD "Agent Test Area", "Agent Reasoning Panel", "Agent decision architecture", and the `conversations` / `messages` schema.

Note: on turn 0 the interpret call reasons over the candidate profile and recruiting goal rather than a candidate reply.

## Acceptance criteria

- [ ] `conversations` and `messages` tables migrated per the PRD schema (session_state jsonb, decision_data jsonb).
- [ ] User can select a configured agent and enter basic candidate info to start a conversation.
- [ ] Edge Function runs interpret → write (exactly two model calls) and returns both the message and the structured decision data.
- [ ] Opening message renders in the chat shell; decision data renders in the Reasoning Panel (intent context, stage, next-best action + reason, grounding result, confidence/assumptions, human-escalation flag).
- [ ] Conversation and the initial message are persisted.
- [ ] A clear "no real messages are sent" indicator is visible.
- [ ] DecisionEngine tested: with a mocked model, the context bundle is assembled correctly and malformed/invalid output is rejected or repaired without crashing.
- [ ] GroundingCheck tested: app correctly handles the self-reported grounding (pass → proceed, fail → withhold/annotate, malformed → no crash).

## Blocked by

- Blocked by `issues/003-personality-inference.md`

## User stories addressed

- User story 12
- User story 13
- User story 14
- User story 19
- User story 20
- User story 21
- User story 23
- User story 24
- User story 25
