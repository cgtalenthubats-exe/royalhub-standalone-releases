-- Royal Flush ATS — Appointment & Compensation Review proposals
-- Additive only: new tables + nullable columns on compensation_history.

-- 1. compensation_history: add the same STI/LTI/allowance/pension breakdown
-- that employee_compensation already has, so historical fiscal-year columns
-- on the salary-review report can be fully populated going forward. Existing
-- rows keep these columns NULL (D8-era pattern already established).
alter table compensation_history add column if not exists cash_allowance numeric;
alter table compensation_history add column if not exists sti_eligible_pct numeric;
alter table compensation_history add column if not exists sti_amount numeric;
alter table compensation_history add column if not exists lti_eligible_pct numeric;
alter table compensation_history add column if not exists lti_amount numeric;
alter table compensation_history add column if not exists pension_contribution numeric;

-- 2. salary_proposals — one row per appointment/comp-review proposal
create table if not exists salary_proposals (
  proposal_id           bigint generated always as identity primary key,
  employee_id           bigint not null references employees(employee_id),
  status                text not null default 'draft' check (status in ('draft','submitted','approved')),
  approval_new_role     boolean not null default false,
  approval_comp_adjustment boolean not null default false,
  approval_other_label  text,
  new_position_id       bigint references positions(position_id),
  new_manager_id        bigint references employees(employee_id),
  effective_date        date,
  justification         text,
  role_description      text,
  target_fiscal_year    int,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_salary_proposals_employee on salary_proposals(employee_id);

-- 3. salary_proposal_compensation — 1:1 with salary_proposals, the proposed
-- "Propose" column values on the salary-review table
create table if not exists salary_proposal_compensation (
  proposal_id           bigint primary key references salary_proposals(proposal_id) on delete cascade,
  currency              text not null default 'EUR',
  base_salary           numeric,
  cash_allowance        numeric,
  sti_eligible_pct      numeric,
  sti_amount            numeric,
  lti_eligible_pct      numeric,
  lti_amount            numeric,
  pension_contribution  numeric,
  other_items           text,
  other_remarks         text,
  updated_at            timestamptz not null default now()
);

-- 4. RLS — same convention as the rest of the schema
alter table salary_proposals enable row level security;
create policy "salary_proposals_all_authenticated" on salary_proposals
  for all to authenticated using (true) with check (true);

alter table salary_proposal_compensation enable row level security;
create policy "salary_proposal_compensation_all_authenticated" on salary_proposal_compensation
  for all to authenticated using (true) with check (true);
