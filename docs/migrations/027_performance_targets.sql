-- 027 — Performance Management, phase 1 ("what were they asked to deliver, and
-- how far did they get").
--
-- The existing `performance_grades` table only records the OUTCOME — one
-- A/A-/B+/B/B- grade per person per fiscal year — with nothing behind it. These
-- three tables add the missing input layer:
--
--   performance_cycles  → the review year (annual, matching performance_grades.fiscal_year)
--     └── banner_goals     → what each company is trying to achieve that year
--           └── employee_targets → what each SEAT is doing about it
--
-- Targets attach to `employee_position_id` (a seat), not `employee_id` (a
-- person) — see migration 026's "seat model". Someone holding a concurrent
-- position at another company gets a genuinely separate set of targets, and the
-- per-company performance view stays clean instead of mixing in another
-- company's work. This also matches the org chart, whose nodes are already
-- positions, so the chart can be reused to display target status directly.
--
-- `performance_grades` is deliberately NOT touched — it stays the outcome
-- record. The two join on (employee_id, fiscal_year) when we want to show a
-- grade alongside the targets that produced it.

create table performance_cycles (
    cycle_id     bigint generated always as identity primary key,
    name         text not null,                    -- "FY2026"
    fiscal_year  int  not null unique,
    start_date   date,
    end_date     date,
    status       text not null default 'active',   -- draft | active | closed
    created_at   timestamptz not null default now()
);

create table banner_goals (
    goal_id      bigint generated always as identity primary key,
    cycle_id     bigint not null references performance_cycles(cycle_id) on delete cascade,
    banner_id    bigint not null references banners(banner_id),
    title        text not null,
    description  text,
    category     text,          -- Financial | Customer | People | Process — free text, nullable
    metric_unit  text,          -- "€M", "%", "stores"
    target_value numeric,
    actual_value numeric,
    progress_pct numeric,       -- manual override; NULL = derive from target/actual
    weight       numeric,
    sort_order   int not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
create index banner_goals_cycle_banner on banner_goals(cycle_id, banner_id);

create table employee_targets (
    target_id            bigint generated always as identity primary key,
    cycle_id             bigint not null references performance_cycles(cycle_id) on delete cascade,
    employee_position_id bigint not null references employee_positions(employee_position_id) on delete cascade,
    -- Denormalised person pointer, same reasoning as the employees.* "primary
    -- position cache" (see docs/SCHEMA.md): lets the profile card fetch one
    -- person's targets across every seat they hold in a single query, without
    -- joining back through employee_positions.
    employee_id          bigint not null references employees(employee_id) on delete cascade,
    -- Optional alignment to a company goal. ON DELETE SET NULL so retiring a
    -- company goal never destroys the individual targets underneath it.
    banner_goal_id       bigint references banner_goals(goal_id) on delete set null,
    title                text not null,
    description          text,
    category             text,
    metric_unit          text,
    target_value         numeric,
    actual_value         numeric,
    progress_pct         numeric,     -- manual override; NULL = derive from target/actual
    weight               numeric,     -- conventionally sums to 100 per (seat, cycle); not enforced — drafts happen
    status               text not null default 'active',  -- draft | active | achieved | missed | cancelled
    due_date             date,
    sort_order           int not null default 0,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);
create index employee_targets_cycle_position on employee_targets(cycle_id, employee_position_id);
create index employee_targets_employee on employee_targets(employee_id);
create index employee_targets_goal on employee_targets(banner_goal_id);

-- Seed the current review year so the page has something to select on first load.
insert into performance_cycles (name, fiscal_year, start_date, end_date, status)
values ('FY2026', 2026, '2026-01-01', '2026-12-31', 'active');
