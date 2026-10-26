-- Royal Flush ATS — persist "what-if / adjusted" comparison scenarios per
-- proposal, alongside the real peers already stored in
-- salary_proposal_comparisons, so the Comparison tab's board (including
-- adjusted scenarios and their drag order) survives navigating away and back.
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).

create table if not exists salary_proposal_whatifs (
  id bigserial primary key,
  proposal_id bigint not null references salary_proposals(proposal_id) on delete cascade,
  base_employee_id bigint not null references employees(employee_id),
  compensation jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists salary_proposal_whatifs_proposal_idx on salary_proposal_whatifs(proposal_id);
