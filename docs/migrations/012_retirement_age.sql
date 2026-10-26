-- Royal Flush ATS — Feedback item 3: retirement age + a visibility toggle for it
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).
--
-- Retirement age varies by country, so it's entered per employee (not a fixed
-- constant). Age + Estimated Retirement are derived from it in the app —
-- nothing else to store for those.

alter table employees
  add column if not exists retirement_age smallint check (retirement_age is null or retirement_age between 40 and 80);

-- Mirrors app_users.comp_visibility's shape for a second, independent
-- sensitive-field category (Age / Estimated Retirement). NULL = default
-- (super only); 'visible' = a super user opted this account in via Settings.
alter table app_users
  add column if not exists personal_visibility text
    check (personal_visibility is null or personal_visibility in ('visible', 'hidden'));
