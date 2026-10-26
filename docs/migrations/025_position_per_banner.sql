-- Positions are scoped per-company now, not shared globally. "Chief
-- Executive Officer" at Selfridges and at Globus can have different
-- competency requirements — previously they were forced to share one row
-- and one requirement bar.
--
-- Data migration: every existing position currently shared across multiple
-- banners is cloned once per additional banner (same title/function/req
-- scores as a starting point — real numbers already in use, not invented),
-- and every employee/succession_seat/salary_proposal referencing the old
-- shared row is repointed to the clone matching its own banner.

alter table positions add column if not exists banner_id bigint references banners(banner_id);

-- Title used to be globally unique (one shared "CEO" for the whole org).
-- Now it's unique per company+function instead, since the whole point is
-- letting the same title exist once per banner with its own requirements.
alter table positions drop constraint if exists positions_title_key;
alter table positions add constraint positions_banner_title_function_key unique (banner_id, title, function_id);

-- Anchor every currently-shared position to banner_id=1 (Brown Thomas
-- Arnotts) as the "original" row - arbitrary choice among the 3 banners
-- that shared it, doesn't matter which since every employee gets repointed
-- to their own banner's copy regardless of which one is the "original".
update positions set banner_id = 1 where banner_id is null and position_id in (
  select distinct position_id from employees where position_id is not null
);

-- Clone each now-anchored position for every other banner that has
-- employees on it, one banner at a time (so title+function_id+banner_id is
-- unique per clone and can be matched back up unambiguously below).
do $$
declare
  b record;
begin
  for b in
    select distinct e.banner_id
    from employees e
    join positions p on p.position_id = e.position_id
    where p.banner_id is distinct from e.banner_id
  loop
    insert into positions (title, function_id, banner_id, req_leadership, req_experiences, req_skill, req_market, jd_content, jd_pdf_url)
    select p.title, p.function_id, b.banner_id, p.req_leadership, p.req_experiences, p.req_skill, p.req_market, p.jd_content, p.jd_pdf_url
    from positions p
    where p.banner_id = 1
      and not exists (
        select 1 from positions p2 where p2.banner_id = b.banner_id and p2.title = p.title and p2.function_id is not distinct from p.function_id
      );
  end loop;
end $$;

-- Repoint every employee whose position_id still points at the banner-1
-- "original" row, but whose own banner isn't banner 1, to their own
-- banner's clone (matched by title+function_id, unique per banner now).
update employees e
set position_id = p_new.position_id
from positions p_old
join positions p_new
  on p_new.title = p_old.title
  and p_new.function_id is not distinct from p_old.function_id
where e.position_id = p_old.position_id
  and p_old.banner_id = 1
  and p_new.banner_id = e.banner_id
  and e.banner_id <> 1;

update succession_seats s
set position_id = p_new.position_id
from positions p_old
join positions p_new
  on p_new.title = p_old.title
  and p_new.function_id is not distinct from p_old.function_id
where s.position_id = p_old.position_id
  and p_old.banner_id = 1
  and p_new.banner_id = s.banner_id
  and s.banner_id <> 1;

update salary_proposals sp
set new_position_id = p_new.position_id
from positions p_old, positions p_new, employees e
where sp.new_position_id = p_old.position_id
  and p_old.banner_id = 1
  and p_new.title = p_old.title
  and p_new.function_id is not distinct from p_old.function_id
  and e.employee_id = sp.employee_id
  and p_new.banner_id = e.banner_id
  and e.banner_id <> 1;
