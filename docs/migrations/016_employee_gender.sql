-- Royal Flush ATS — Gender field, requested alongside the Add Employee wizard
-- (also editable on existing employees via the Personal & Employment card).
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).

alter table employees
  add column if not exists gender text check (gender is null or gender in ('Male', 'Female', 'Other'));
