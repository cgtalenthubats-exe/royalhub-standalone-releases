-- 023: employee_compensation.allowance_family_cover, numeric -> text.
--
-- Client feedback: "Family Cover" doesn't fit a single € figure (varies too
-- much per person's actual arrangement) — relabeled "Other benefit (please
-- specify)" everywhere in the UI and changed to a free-text field instead.
--
-- USING ::text casts any existing numeric values to their text form (e.g.
-- 3500 -> '3500') rather than dropping them. Nothing else reads this column
-- as a number for calculation — D8 compensation-only and every comparison
-- total already excludes all allowance_*/benefit_* columns by design.

ALTER TABLE employee_compensation
    ALTER COLUMN allowance_family_cover TYPE text USING allowance_family_cover::text;
