# Candidate-reply turn loop + session adaptation

## Parent PRD

`issues/prd.md`

## What to build

The full multi-turn decision loop and autonomous session adaptation — the headline of the product. The user types a candidate reply; the Edge Function runs call 1 (interpret the reply: intent, sentiment, engagement, concerns, next-best action, grounding self-check), applies the **SessionReducer** (pure function) to produce the next session state, then runs call 2 to write the response in-voice. The agent chooses its own next action (continue, answer, ask, handle objection, lower pressure, suggest next step, pause, stop, or escalate to a human) without the user directing each step, and adapts tone within company boundaries without overwriting core identity. Multiple turns work; history persists across refresh; the Reasoning Panel updates each turn (stage, action, grounding, session/memory updates). See PRD "Autonomous Agent Behavior", "Session Configuration and Autonomous Adaptation", "Candidate Conversation Simulator".

## Acceptance criteria

- [ ] User can send candidate replies manually and receive agent responses over multiple turns.
- [ ] Each turn runs interpret → SessionReducer → write; session state updates and is persisted on the conversation.
- [ ] The agent autonomously selects the next action (including pause/stop/escalate) without per-step user direction.
- [ ] Tone adapts within company boundaries; core company identity is never overwritten.
- [ ] Conversation history persists across refresh; the Reasoning Panel reflects the latest stage, action, grounding, and session/memory updates each turn.
- [ ] When appropriate, the panel surfaces a human-recruiter escalation recommendation.
- [ ] SessionReducer tested (pure function): stage/approach/next-action update correctly from a decision object; tone adapts within boundaries but core identity is preserved; escalate flag flips state as expected.
- [ ] Behavioral scenarios exercised: interested, objection, off-topic, going-cold, explicit decline — agent stays in role and adapts.

## Blocked by

- Blocked by `issues/004-initial-outreach-chat-panel.md`

## User stories addressed

- User story 15
- User story 16
- User story 17
- User story 18
- User story 22
- User story 26
- User story 27
- User story 28
- User story 29
