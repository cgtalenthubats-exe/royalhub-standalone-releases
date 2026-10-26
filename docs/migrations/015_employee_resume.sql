-- Royal Flush ATS — CV/résumé attachment for the new Add Employee wizard.
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).

alter table employees
  add column if not exists resume_url text;

-- Storage bucket mirrors the existing "profile-photos" pattern (public,
-- size-capped, MIME-restricted) — no parsing, just storage + a link.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-resumes',
  'employee-resumes',
  true,
  10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;
