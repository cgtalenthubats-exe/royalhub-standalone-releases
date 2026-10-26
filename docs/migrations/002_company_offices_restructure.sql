-- Royal Flush ATS — Company / Country-Office restructure
-- 0. Wipe existing mock data (authorized) — full dataset is being regenerated with the
-- new company > country-office model, so old rows can't carry over meaningfully.
truncate table
  employee_insights, employee_background, employment_history,
  performance_grades, compensation_history, employee_compensation,
  employee_scores, departments, org_edges, employees, positions, banners
restart identity cascade;

-- `banners` = company (can span multiple countries). Per-country attributes
-- (country, city, is_hq, is_regional_office, country_head_id) move to a new
-- child table `banner_offices`. `employees.office_id` + `departments.office_id`
-- now point at the specific country office, while `banner_id` still means "company".

-- 1. New table: banner_offices (a company's country offices)
create table if not exists banner_offices (
  office_id           bigint generated always as identity primary key,
  banner_id           bigint not null references banners(banner_id) on delete cascade,
  country             text not null,
  city                text,
  is_hq               boolean not null default false,
  is_regional_office  boolean not null default false,
  country_head_id     bigint references employees(employee_id)
);
create index if not exists idx_banner_offices_banner on banner_offices(banner_id);

-- 2. employees: add office_id (nullable during migration, will backfill then keep as-is)
alter table employees add column if not exists office_id bigint references banner_offices(office_id);
create index if not exists idx_employees_office on employees(office_id);

-- 3. departments: rename banner_id -> office_id (department belongs to a specific country office)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='departments' and column_name='banner_id')
     and not exists (select 1 from information_schema.columns where table_name='departments' and column_name='office_id') then
    alter table departments rename column banner_id to office_id;
  end if;
end $$;

do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'departments' and con.contype = 'f'
      and pg_get_constraintdef(con.oid) ilike '%banners%'
  loop
    execute format('alter table departments drop constraint %I', c.conname);
  end loop;
end $$;

alter table departments add constraint departments_office_id_fkey
  foreign key (office_id) references banner_offices(office_id);

-- 4. banners: drop per-country columns now that banner_offices carries them
alter table banners drop column if exists country;
alter table banners drop column if exists city;
alter table banners drop column if exists is_hq;
alter table banners drop column if exists is_regional_office;
alter table banners drop column if exists country_head_id;

-- 5. RLS for new table (same convention as the rest of the schema)
alter table banner_offices enable row level security;
create policy "banner_offices_all_authenticated" on banner_offices
  for all to authenticated using (true) with check (true);
