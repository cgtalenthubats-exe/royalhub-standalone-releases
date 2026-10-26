-- Royal Flush ATS — app-level settings (starts with the Gemini API key so it
-- can be entered from a Settings page instead of only via .env.local).
create table if not exists app_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

alter table app_settings enable row level security;
create policy "app_settings_all_authenticated" on app_settings
  for all to authenticated using (true) with check (true);
