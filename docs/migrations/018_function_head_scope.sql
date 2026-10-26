-- 018: "Head of Function" reporting scope + org_edges integrity backfill.
--
-- Part 1 — function_head_scope
-- functions.global_head_id names ONE employee as the overall head of a
-- function. This table says WHICH companies actually report to them: a
-- function head may cover only some of the companies that run that function
-- (e.g. Head of HR sits in Nexus and also covers Orion, while Vertex runs its
-- own HR independently and reports to nobody).
--
-- No cross-company rows are ever written to org_edges — each company's
-- function tree stays independently rooted there, exactly as before. This
-- table only drives how those independent roots are composed for DISPLAY on
-- /org/function (see getOrgTree in src/app/actions/org.ts), where a
-- cross-company link renders as a dotted line.
--
-- The head's own company is implicit and never stored here — the head is
-- already that company's root. Only OTHER companies get a row.

CREATE TABLE IF NOT EXISTS function_head_scope (
    function_id  BIGINT NOT NULL REFERENCES functions(function_id) ON DELETE CASCADE,
    banner_id    BIGINT NOT NULL REFERENCES banners(banner_id)     ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (function_id, banner_id)
);

CREATE INDEX IF NOT EXISTS idx_function_head_scope_function ON function_head_scope(function_id);

ALTER TABLE function_head_scope ENABLE ROW LEVEL SECURITY;

-- Matches the access pattern of every other table here: all reads/writes go
-- through the server-side service-role client, which bypasses RLS. Enabling
-- RLS with no policy means the anon key cannot touch it at all.

-- Part 2 — org_edges integrity backfill
-- Until now, employees created through the Add Employee wizard / CSV import
-- got an `employees` row but NO org_edges rows. getOrgTree builds its tree by
-- walking edges (not employees), so those people were invisible on all three
-- org charts — and because they had no node to drag, there was no way to
-- place them from the UI either. Give every employee an edge in every
-- dimension; a NULL parent just means "top of that tree", which at least
-- renders them so they can be re-pointed.
--
-- createEmployee/createEmployeeFull/importEmployeesCsv now write these rows
-- at creation time, so this backfill is a one-off repair of existing data.

INSERT INTO org_edges (employee_id, parent_employee_id, dimension)
SELECT e.employee_id, NULL, d.dimension
FROM employees e
CROSS JOIN (VALUES ('banner'), ('function'), ('headcount')) AS d(dimension)
WHERE NOT EXISTS (
    SELECT 1 FROM org_edges o
    WHERE o.employee_id = e.employee_id AND o.dimension = d.dimension
);
