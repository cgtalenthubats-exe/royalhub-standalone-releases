-- Royal Flush ATS — persist the comparison set attached to a proposal.
-- Each proposal has an embedded "Comparison" tab (reuses /comparison_v2). The
-- proposal's own employee is always the first column (implicit, not stored);
-- any peers the user adds for benchmarking are remembered here so the tab
-- reopens with the same board.
create table if not exists salary_proposal_comparisons (
  proposal_id  bigint not null references salary_proposals(proposal_id) on delete cascade,
  employee_id  bigint not null references employees(employee_id) on delete cascade,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (proposal_id, employee_id)
);
create index if not exists idx_proposal_comparisons_proposal on salary_proposal_comparisons(proposal_id);

alter table salary_proposal_comparisons enable row level security;
create policy "salary_proposal_comparisons_all_authenticated" on salary_proposal_comparisons
  for all to authenticated using (true) with check (true);
