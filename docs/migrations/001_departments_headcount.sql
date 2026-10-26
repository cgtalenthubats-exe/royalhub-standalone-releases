-- Royal Flush ATS — Hierarchy + Headcount feature
-- Run this once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid)

-- 1. New table: departments (headcount buckets owned by an employee)
create table if not exists departments (
  department_id     bigint generated always as identity primary key,
  name              text not null,
  owner_employee_id bigint references employees(employee_id) on delete set null, -- NULL = vacant
  banner_id         bigint not null references banners(banner_id),
  function_id       bigint references functions(function_id),
  headcount         int not null default 0 check (headcount >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_departments_owner on departments(owner_employee_id);
create index if not exists idx_departments_banner on departments(banner_id);

-- 2. Allow a third dimension value on org_edges for the independent headcount hierarchy
-- (drops whatever the existing dimension check constraint is named, then re-adds it widened)
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'org_edges'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%dimension%'
  loop
    execute format('alter table org_edges drop constraint %I', c.conname);
  end loop;
end $$;

alter table org_edges add constraint org_edges_dimension_check
  check (dimension in ('banner', 'function', 'headcount'));

-- 3. RLS — same convention as the rest of the schema (open to any authenticated user;
-- actual access control happens in the service-role server actions, see docs/SCHEMA.md §7)
alter table departments enable row level security;
create policy "departments_all_authenticated" on departments
  for all to authenticated using (true) with check (true);
