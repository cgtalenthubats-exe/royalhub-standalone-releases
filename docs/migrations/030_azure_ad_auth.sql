-- Item 2: swap login identity from username/password to Azure AD (Microsoft
-- Entra ID) email. Access control itself lives in Azure AD (the Enterprise
-- Application's "Assignment required" setting) — this table still owns
-- role/status/comp_visibility/personal_visibility, unchanged.
--
-- Two-phase on purpose: this phase only ADDS the email column and relaxes
-- username/password_hash to nullable, so a broken SSO rollout stays
-- recoverable without a second migration. A follow-up migration drops
-- username/password_hash entirely once Azure AD login is confirmed working
-- end to end in production.

alter table app_users add column email text;
create unique index idx_app_users_email on app_users (email) where email is not null;

alter table app_users alter column username drop not null;
alter table app_users alter column password_hash drop not null;
