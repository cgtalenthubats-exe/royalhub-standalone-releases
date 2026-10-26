-- 020: banner short name + logo, for the redesigned org-chart node.
--
-- The node now leads with the company rather than the person's name, so it
-- needs a compact form that fits a card ("SRL", "DBK", "KDW" …) instead of
-- the full legal/brand name, plus a logo to show in place of that text once
-- the assets exist.
--
-- Country deliberately stays on banner_offices, not here: a banner can span
-- several country offices, and the org chart already reads country from the
-- employee's own office. short_name/logo are the only genuinely
-- banner-level display attributes.

ALTER TABLE banners ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS logo_url   TEXT;

-- Until real short names are supplied, fall back to the existing name so the
-- node never renders blank.
UPDATE banners SET short_name = name WHERE short_name IS NULL;
