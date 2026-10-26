-- Royal Flush ATS — AI Assessment tab on a proposal.
-- 1:1 with salary_proposals; regenerating overwrites the previous result
-- (same "replace, don't append" convention as employee_insights AI rows).
create table if not exists proposal_assessments (
  proposal_id        bigint primary key references salary_proposals(proposal_id) on delete cascade,
  job_description    text,
  additional_context text,
  headline           text,
  fit_bullets        jsonb not null default '[]'::jsonb,   -- vs peers + JD
  market_bullets     jsonb not null default '[]'::jsonb,   -- vs general career market (qualitative, AI knowledge only)
  peer_employee_ids  jsonb not null default '[]'::jsonb,   -- snapshot of peers used for this run
  model              text,
  generated_at       timestamptz not null default now()
);

alter table proposal_assessments enable row level security;
create policy "proposal_assessments_all_authenticated" on proposal_assessments
  for all to authenticated using (true) with check (true);
