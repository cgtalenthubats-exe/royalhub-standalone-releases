-- Concurrent positions ("seat model"). Today employee_id IS the org chart
-- node identity — one person is always exactly one node, everywhere. That
-- breaks the moment someone genuinely holds two roles at once (e.g. their
-- normal job plus an acting assignment at a different company). This
-- migration introduces employee_positions (one person -> many rows) and
-- re-keys org_edges onto employee_position_id instead of employee_id, so a
-- person holding two positions becomes two separate, independently-placed
-- nodes, each with its own reporting line, in every dimension.
--
-- employees.position_id/position_title/function_id/banner_id/office_id are
-- kept as-is — they become a synced "primary position cache" (see
-- employees.ts's syncEmployeeCache) so every display-only reader elsewhere
-- in the app keeps working unchanged. Only code that counts seats or builds
-- the org tree needs to become position-aware.
--
-- Vacant seats keep today's pattern (a phantom employees row with
-- status='Vacant') rather than inventing a new concept — every current
-- employees row, real or phantom-vacant, maps 1:1 to one new primary
-- employee_positions row below.

create table employee_positions (
  employee_position_id bigint generated always as identity primary key,
  employee_id bigint not null references employees(employee_id) on delete cascade,
  position_title text not null,
  position_id bigint references positions(position_id),
  function_id bigint references functions(function_id),
  banner_id bigint not null references banners(banner_id),
  office_id bigint not null references banner_offices(office_id),
  is_primary boolean not null default false,
  position_effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one primary position per person.
create unique index employee_positions_one_primary
  on employee_positions(employee_id) where is_primary;

-- Backfill: every current employees row (incl. phantom-Vacant ones) becomes
-- one primary position, carrying over its existing job fields as-is.
insert into employee_positions (employee_id, position_title, position_id, function_id, banner_id, office_id, is_primary)
select employee_id, coalesce(position_title, 'Unknown'), position_id, function_id, banner_id, office_id, true
from employees;

-- org_edges: add the new columns, backfill from the 1:1 primary mapping
-- just created, then drop the old employee_id-keyed columns.
alter table org_edges add column employee_position_id bigint references employee_positions(employee_position_id) on delete cascade;
alter table org_edges add column parent_employee_position_id bigint references employee_positions(employee_position_id);

update org_edges oe set employee_position_id = ep.employee_position_id
from employee_positions ep where ep.employee_id = oe.employee_id and ep.is_primary;

update org_edges oe set parent_employee_position_id = ep.employee_position_id
from employee_positions ep where ep.employee_id = oe.parent_employee_id and ep.is_primary;

alter table org_edges alter column employee_position_id set not null;
alter table org_edges drop constraint org_edges_employee_id_dimension_key;
alter table org_edges drop column employee_id;
alter table org_edges drop column parent_employee_id;
alter table org_edges add constraint org_edges_employee_position_id_dimension_key unique (employee_position_id, dimension);
