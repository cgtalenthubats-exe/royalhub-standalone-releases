-- Royal Flush ATS — Org chart feedback round (items 3, 5, 6)
-- Additive only.

-- item 3: "As of" is derived automatically from real org-structure changes
-- (drag-move commits, employee org placement) rather than a manually-typed
-- field. org_edges had no timestamp at all — add one, bumped by moveEmployee
-- and the new vacant-placeholder move logic on every committed Save.
alter table org_edges add column if not exists updated_at timestamptz not null default now();

-- item 6: no schema change needed for the "Vacant" placeholder — employees.status
-- is a plain text column with no CHECK constraint, so 'Vacant' is just another
-- valid string value alongside the existing 'Active'/'Resigned'.
