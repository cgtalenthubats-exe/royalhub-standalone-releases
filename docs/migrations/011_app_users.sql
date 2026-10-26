-- Royal Flush ATS — Phase 1: application users + role-based access
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).
--
-- Introduces login accounts distinct from `employees` (an employee record is HR
-- data; an app_user is a login). Roles gate who can see compensation figures.

create table if not exists app_users (
  user_id         bigint generated always as identity primary key,
  username        text not null unique,
  password_hash   text not null,                 -- scrypt: "<saltHex>:<keyHex>"
  display_name    text,
  role            text not null default 'regular'
                    check (role in ('super', 'regular', 'dev')),
  status          text not null default 'active'
                    check (status in ('active', 'hold', 'disabled')),
  -- Per-user override for compensation visibility. NULL = use the role default
  -- (super => visible, everyone else => hidden). 'blurred' and 'hidden' are BOTH
  -- redacted server-side; they differ only in how the client renders the mask.
  comp_visibility text
                    check (comp_visibility in ('visible', 'blurred', 'hidden')),
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz
);

create index if not exists idx_app_users_username on app_users(username);

-- RLS: app data already flows through the service-role server actions (which
-- bypass RLS), and app_users is only ever touched by those actions. Enable RLS
-- with no permissive policy so the anon/auth keys can never read password hashes.
alter table app_users enable row level security;
