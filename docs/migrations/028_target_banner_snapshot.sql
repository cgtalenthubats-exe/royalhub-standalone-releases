-- 028 — record which company a performance target was set under.
--
-- Until now the company behind a target was read live off
-- `employee_positions.banner_id`. That made a target's company a moving
-- target: when someone transferred, every target they'd ever recorded moved
-- with them, so a closed review year's numbers changed retroactively — FY2026's
-- Selfridges results would quietly stop including work that was genuinely done
-- at Selfridges. It also left the app unable to tell that a person had ever
-- been there, so "who worked on this during the cycle but has since left" was
-- not answerable at all.
--
-- Snapshotting the company at creation fixes both. The target still belongs to
-- the person (it follows them to their profile wherever they go — see the seat
-- model in 026/027); this column is the separate question of whose books the
-- work was recorded against for that year, which is exactly what shouldn't
-- change afterwards.

alter table employee_targets
    add column banner_id bigint references banners(banner_id);

-- Backfill from where each target's seat sits today. That's the best available
-- answer for existing rows, and it's correct for every one of them that hasn't
-- already been moved.
update employee_targets t
set banner_id = ep.banner_id
from employee_positions ep
where ep.employee_position_id = t.employee_position_id;

alter table employee_targets
    alter column banner_id set not null;

-- Backs "everything recorded against this company for this cycle", which is the
-- query the departed-people list needs and which the plain cycle+position index
-- can't serve.
create index employee_targets_banner_cycle on employee_targets(banner_id, cycle_id);
