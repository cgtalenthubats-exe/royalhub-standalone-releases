-- Royal Flush ATS — Succession Plan
-- succession_seats: a "seat" in the succession tree, filled (employee_id set) or vacant (NULL).
-- succession_candidates: ranked, color-coded successors for a seat — can be an existing
-- employee (candidate_employee_id set, clickable to profile) or a free-text external candidate.

create table if not exists succession_seats (
  seat_id           bigint generated always as identity primary key,
  parent_seat_id    bigint references succession_seats(seat_id) on delete cascade,
  banner_id         bigint not null references banners(banner_id),
  office_id         bigint references banner_offices(office_id),
  position_id       bigint references positions(position_id),
  employee_id       bigint references employees(employee_id), -- NULL = vacant seat
  label             text, -- optional display-name override (e.g. "Head HRBP") when position title alone isn't enough
  sort_order        int not null default 0
);
create index if not exists idx_succession_seats_parent on succession_seats(parent_seat_id);
create index if not exists idx_succession_seats_banner on succession_seats(banner_id);

create table if not exists succession_candidates (
  candidate_id          bigint generated always as identity primary key,
  seat_id               bigint not null references succession_seats(seat_id) on delete cascade,
  candidate_name        text not null,
  candidate_employee_id bigint references employees(employee_id), -- NULL = external candidate
  readiness             text not null check (readiness in ('ready_now','ready_1_3','ready_3_5')),
  rank                  int not null default 0
);
create index if not exists idx_succession_candidates_seat on succession_candidates(seat_id);

alter table succession_seats enable row level security;
create policy "succession_seats_all_authenticated" on succession_seats
  for all to authenticated using (true) with check (true);

alter table succession_candidates enable row level security;
create policy "succession_candidates_all_authenticated" on succession_candidates
  for all to authenticated using (true) with check (true);
