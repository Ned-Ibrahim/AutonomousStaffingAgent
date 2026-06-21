# Company intake capture

## Parent PRD

`issues/prd.md`

## What to build

The company-context form and its persistence, end-to-end. A user fills the intake form (overview, culture and values, hiring needs, candidate profiles, recruiting process, tone, goals), it saves to the `companies` table via an Edge Function, and it can be fetched back by id and survives a refresh. This is the foundation the rest of the system reads from; it stores raw context only — persona generation is a separate slice. See PRD "Company Intake Form", the `companies` schema, and "ContextStore" / API contracts.

## Acceptance criteria

- [ ] `companies` table migration matches the PRD schema (columns for queried fields, text for prose, `tone` enum).
- [ ] Intake form captures all fields; required fields (name, one_liner, tone) validated before submit.
- [ ] Submitting saves via an Edge Function and returns the new record id.
- [ ] Saved context is fetchable by id and persists across page refresh.
- [ ] Malformed input (missing required field, invalid tone) is rejected with a clear error.
- [ ] ContextStore module tested: save → getById round-trips; required-field validation rejects bad input; list returns saved companies.

## Blocked by

- Blocked by `issues/001-walking-skeleton-deploy.md`

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
