-- A recruiter identity for a conversation: the name the agent signs its outreach
-- as. Optional — when absent the agent signs as the company rather than a person,
-- and never with a placeholder like "[Your Name]". Set once when the conversation
-- starts and used on every agent turn, so the voice stays consistent.

alter table public.conversations
  add column if not exists recruiter_name text;
