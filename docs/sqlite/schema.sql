-- RoyalHub Standalone — consolidated SQLite schema.
--
-- This is a fresh, end-state schema for the standalone edition, NOT a replay
-- of the cloud edition's 30 sequential Postgres migrations
-- (docs/migrations/*.sql, kept here only as historical reference for how the
-- shape evolved). It reflects the schema as documented in docs/SCHEMA.md plus
-- every later migration (jd/documents, folders, seat model, performance
-- targets, banner-snapshot, compensation encryption).
--
-- Deliberately NOT included (standalone has no auth/roles/cloud storage):
--   app_users            — login accounts; standalone has no login at all
--   storage.buckets rows — Supabase-specific; local files live on disk instead
--   RLS / policies       — Postgres-specific; not applicable to SQLite
--
-- Postgres -> SQLite conversions applied throughout:
--   bigint / bigserial / "generated always as identity" -> INTEGER PRIMARY KEY AUTOINCREMENT
--   text[]/jsonb                                        -> TEXT (app already JSON.stringify/parses these)
--   timestamptz / timestamp / date                       -> TEXT (ISO string; the app already treats every
--                                                            date/time value as a plain string, never a
--                                                            parsed Date object)
--   boolean                                              -> INTEGER (0/1)
--   now()                                                -> CURRENT_TIMESTAMP / SQLite datetime('now')

PRAGMA foreign_keys = ON;

-- ── Reference tables ────────────────────────────────────────────────────

CREATE TABLE banners (
  banner_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  short_name  TEXT,
  logo_url    TEXT
);

CREATE TABLE banner_offices (
  office_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  banner_id           INTEGER NOT NULL REFERENCES banners(banner_id),
  country             TEXT NOT NULL,
  city                TEXT,
  is_hq               INTEGER NOT NULL DEFAULT 0,
  is_regional_office  INTEGER NOT NULL DEFAULT 0,
  country_head_id     INTEGER
);

CREATE TABLE functions (
  function_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  global_head_id   INTEGER
);

CREATE TABLE positions (
  position_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  banner_id        INTEGER REFERENCES banners(banner_id),
  function_id      INTEGER REFERENCES functions(function_id),
  req_leadership   INTEGER,
  req_experiences  INTEGER,
  req_skill        INTEGER,
  req_market       INTEGER,
  jd_content       TEXT,
  jd_pdf_url       TEXT,
  UNIQUE (banner_id, title, function_id)
);

-- ── People ──────────────────────────────────────────────────────────────

CREATE TABLE employees (
  employee_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id             INTEGER REFERENCES positions(position_id),
  name                    TEXT NOT NULL,
  photo                   TEXT,
  date_of_birth           TEXT,
  nationality             TEXT,
  country                 TEXT,
  city                    TEXT,
  status                  TEXT NOT NULL DEFAULT 'Active',
  banner_id               INTEGER REFERENCES banners(banner_id),
  office_id               INTEGER REFERENCES banner_offices(office_id),
  function_id             INTEGER REFERENCES functions(function_id),
  position_title          TEXT,
  job_grade               TEXT,
  hire_date               TEXT,
  position_effective_date TEXT,
  readiness_potential     TEXT,
  resign_date             TEXT,
  resignation_reason      TEXT,
  retirement_age          INTEGER CHECK (retirement_age IS NULL OR retirement_age BETWEEN 40 AND 80),
  resume_url              TEXT,
  gender                  TEXT CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other')),
  tag_color               TEXT,
  mentor_employee_id      INTEGER REFERENCES employees(employee_id),
  cross_group_mobility    INTEGER,  -- 0/1/NULL — "Potential Career Movement Across CRC" on the ICPD tab; NULL = not yet assessed
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_scores (
  employee_id  INTEGER PRIMARY KEY REFERENCES employees(employee_id),
  leadership   INTEGER,
  experiences  INTEGER,
  skill        INTEGER,
  market       INTEGER,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per position a person holds ("seat model", mig 026).
CREATE TABLE employee_positions (
  employee_position_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id              INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  position_title           TEXT NOT NULL,
  position_id              INTEGER REFERENCES positions(position_id),
  function_id              INTEGER REFERENCES functions(function_id),
  banner_id                INTEGER NOT NULL REFERENCES banners(banner_id),
  office_id                INTEGER NOT NULL REFERENCES banner_offices(office_id),
  is_primary               INTEGER NOT NULL DEFAULT 0,
  position_effective_date  TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Exactly one primary position per employee.
CREATE UNIQUE INDEX employee_positions_one_primary ON employee_positions(employee_id) WHERE is_primary = 1;

-- Reporting edges, one set per dimension (banner / function / headcount),
-- keyed on the position (employee_position_id), not the person.
CREATE TABLE org_edges (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_position_id         INTEGER NOT NULL REFERENCES employee_positions(employee_position_id) ON DELETE CASCADE,
  parent_employee_position_id  INTEGER REFERENCES employee_positions(employee_position_id),
  dimension                    TEXT NOT NULL CHECK (dimension IN ('banner', 'function', 'headcount')),
  updated_at                   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Matches the cloud edition's migration 026 constraint
-- (org_edges_employee_position_id_dimension_key). setEmployeeManager()'s
-- "insert ... on conflict (employee_position_id, dimension) do update" upsert
-- depends on a real unique index existing on exactly these columns to have
-- anything to match against; without it, every call fails with a SQL error
-- that's silently swallowed by the caller, so "Reports to" in the Add
-- Employee wizard, the org chart's placement editor, and the org chart OCR
-- import all silently do nothing.
CREATE UNIQUE INDEX org_edges_position_dimension ON org_edges(employee_position_id, dimension);

CREATE TABLE departments (
  department_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  owner_employee_id  INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
  office_id          INTEGER NOT NULL REFERENCES banner_offices(office_id),
  function_id        INTEGER REFERENCES functions(function_id),
  headcount          INTEGER NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_departments_owner ON departments(owner_employee_id);
CREATE INDEX idx_departments_office ON departments(office_id);

-- ── Compensation (fields below are stored ENCRYPTED as base64 text — see
--    src/lib/crypto.ts. Column type is TEXT even though the values are
--    logically numeric.) ────────────────────────────────────────────────

CREATE TABLE employee_compensation (
  employee_id               INTEGER PRIMARY KEY REFERENCES employees(employee_id),
  currency                  TEXT NOT NULL DEFAULT 'EUR',
  base_salary               TEXT,  -- encrypted
  sti_target                TEXT,  -- encrypted
  sti_max                   TEXT,  -- encrypted
  lti_target                TEXT,  -- encrypted
  lti_max                   TEXT,  -- encrypted
  other_bonus               TEXT,  -- encrypted
  allowance_company_car     REAL,
  allowance_mobility        REAL,
  allowance_home_office     REAL,
  allowance_private_medical REAL,
  allowance_family_cover    TEXT,  -- free text, not encrypted (mig 023)
  total_compensation        TEXT   -- encrypted
);

CREATE TABLE compensation_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES employees(employee_id),
  fiscal_year       INTEGER NOT NULL,
  effective_date    TEXT,
  base_salary       TEXT,  -- encrypted
  total_comp        TEXT,  -- encrypted
  adjustment_amount REAL,
  cash_allowance    REAL,
  sti_eligible_pct  TEXT,  -- encrypted
  sti_actual_pct    TEXT,  -- encrypted
  sti_amount        TEXT,  -- encrypted
  lti_eligible_pct  TEXT,  -- encrypted
  lti_actual_pct    TEXT,  -- encrypted
  lti_amount        TEXT,  -- encrypted
  pension_contribution REAL,
  note              TEXT,
  UNIQUE (employee_id, fiscal_year)
);

-- ── Proposals ───────────────────────────────────────────────────────────

CREATE TABLE salary_proposals (
  proposal_id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id                   INTEGER NOT NULL REFERENCES employees(employee_id),
  status                        TEXT NOT NULL DEFAULT 'draft',
  approval_new_role             INTEGER,
  approval_comp_adjustment      INTEGER,
  approval_other_label          TEXT,
  new_position_id               INTEGER REFERENCES positions(position_id),
  new_manager_id                INTEGER REFERENCES employees(employee_id),
  effective_date                TEXT,
  justification                 TEXT,
  role_description               TEXT,
  target_fiscal_year            INTEGER,
  board_updated_by              TEXT,
  board_updated_at              TEXT,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE salary_proposal_compensation (
  proposal_id       INTEGER PRIMARY KEY REFERENCES salary_proposals(proposal_id) ON DELETE CASCADE,
  base_salary       TEXT,  -- encrypted
  cash_allowance    TEXT,  -- encrypted
  sti_eligible_pct  TEXT,  -- encrypted
  sti_amount        TEXT,  -- encrypted
  lti_eligible_pct  TEXT,  -- encrypted
  lti_amount        TEXT,  -- encrypted
  pension_contribution REAL,
  other_items       TEXT,
  other_remarks     TEXT
);

CREATE TABLE salary_proposal_comparisons (
  proposal_id  INTEGER NOT NULL REFERENCES salary_proposals(proposal_id) ON DELETE CASCADE,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (proposal_id, employee_id)
);

CREATE TABLE salary_proposal_whatifs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id       INTEGER NOT NULL REFERENCES salary_proposals(proposal_id) ON DELETE CASCADE,
  base_employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  compensation      TEXT NOT NULL,  -- encrypted JSON blob (was jsonb)
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX salary_proposal_whatifs_proposal_idx ON salary_proposal_whatifs(proposal_id);

CREATE TABLE proposal_assessments (
  proposal_id        INTEGER PRIMARY KEY REFERENCES salary_proposals(proposal_id) ON DELETE CASCADE,
  job_description    TEXT,
  additional_context TEXT,
  headline           TEXT,
  fit_bullets        TEXT NOT NULL DEFAULT '[]',  -- JSON array (was jsonb)
  market_bullets     TEXT NOT NULL DEFAULT '[]',  -- JSON array (was jsonb)
  peer_employee_ids  TEXT NOT NULL DEFAULT '[]',  -- JSON array (was jsonb)
  model              TEXT,
  generated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Performance ─────────────────────────────────────────────────────────

CREATE TABLE performance_grades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  fiscal_year  INTEGER NOT NULL,
  grade        TEXT,
  label        TEXT
);

CREATE TABLE performance_cycles (
  cycle_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  fiscal_year  INTEGER NOT NULL UNIQUE,
  start_date   TEXT,
  end_date     TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed'))
);

CREATE TABLE banner_goals (
  goal_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id      INTEGER NOT NULL REFERENCES performance_cycles(cycle_id) ON DELETE CASCADE,
  banner_id     INTEGER NOT NULL REFERENCES banners(banner_id),
  title         TEXT,
  description   TEXT,
  category      TEXT,
  metric_unit   TEXT,
  target_value  REAL,
  actual_value  REAL,
  progress_pct  REAL,
  weight        REAL,
  sort_order    INTEGER,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_targets (
  target_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id              INTEGER NOT NULL REFERENCES performance_cycles(cycle_id) ON DELETE CASCADE,
  employee_position_id  INTEGER NOT NULL REFERENCES employee_positions(employee_position_id) ON DELETE CASCADE,
  employee_id           INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  banner_id             INTEGER NOT NULL REFERENCES banners(banner_id),
  banner_goal_id        INTEGER REFERENCES banner_goals(goal_id) ON DELETE SET NULL,
  title                 TEXT,
  description           TEXT,
  category              TEXT,
  metric_unit           TEXT,
  target_value          REAL,
  actual_value          REAL,
  progress_pct          REAL,
  weight                REAL,
  status                TEXT NOT NULL DEFAULT 'active',
  due_date              TEXT,
  sort_order            INTEGER
);

-- ── History / background / insights ─────────────────────────────────────

CREATE TABLE employment_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  banner       TEXT,
  position     TEXT,
  location     TEXT,
  start_date   TEXT,
  end_date     TEXT,
  is_current   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE employee_background (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  type         TEXT NOT NULL,  -- 'experience' | 'education' | 'certification' | 'strength' | 'development_area' — free text, not a CHECK enum, so new types (e.g. from the ICPD tab) never need a schema change
  title        TEXT,
  organization TEXT,
  detail       TEXT,
  sort_order   INTEGER
);

CREATE TABLE succession_seats (
  seat_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_seat_id INTEGER REFERENCES succession_seats(seat_id) ON DELETE CASCADE,
  banner_id      INTEGER NOT NULL REFERENCES banners(banner_id),
  office_id      INTEGER REFERENCES banner_offices(office_id),
  position_id    INTEGER REFERENCES positions(position_id),
  employee_id    INTEGER REFERENCES employees(employee_id),
  label          TEXT,
  sort_order     INTEGER
);

CREATE TABLE succession_candidates (
  candidate_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_id               INTEGER NOT NULL REFERENCES succession_seats(seat_id) ON DELETE CASCADE,
  candidate_name        TEXT NOT NULL,
  candidate_employee_id INTEGER REFERENCES employees(employee_id),
  readiness             TEXT CHECK (readiness IN ('ready_now', 'ready_1_3', 'ready_3_5')),
  rank                  INTEGER
);

CREATE TABLE employee_insights (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(employee_id),
  category      TEXT,
  content       TEXT,
  source        TEXT CHECK (source IN ('ai', 'manual')),
  generated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Documents ───────────────────────────────────────────────────────────

CREATE TABLE document_folders (
  folder_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  parent_folder_id  INTEGER REFERENCES document_folders(folder_id) ON DELETE CASCADE,
  employee_id       INTEGER REFERENCES employees(employee_id) ON DELETE CASCADE,
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_document_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX idx_document_folders_employee ON document_folders(employee_id);

-- Shared Document Center library (not tied to any one employee).
CREATE TABLE documents (
  document_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  filename     TEXT NOT NULL,
  description  TEXT,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT,
  size_bytes   INTEGER,
  uploaded_by  TEXT,
  folder_id    INTEGER REFERENCES document_folders(folder_id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_folder ON documents(folder_id);

-- Per-employee document library (contracts, letters, certificates, ...).
CREATE TABLE employee_documents (
  employee_document_id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  description  TEXT,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT,
  size_bytes   INTEGER,
  uploaded_by  TEXT,
  folder_id    INTEGER REFERENCES document_folders(folder_id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employee_documents_employee ON employee_documents(employee_id);
CREATE INDEX idx_employee_documents_folder ON employee_documents(folder_id);

-- ── App-level settings (currently just the Gemini API key) ─────────────

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── ICPD (Individual Career & Personal Development Plan) ────────────────
-- The employee profile's "ICPD" tab — a second spectrum of data alongside
-- the existing Personal Info/Compensation tab, covering development
-- planning and career/succession readiness. Career History
-- (employment_history) and yearly Performance Grade (performance_grades)
-- already exist and are reused as-is, not duplicated here.

-- Action-plan style rows — covers both the profile page's own "Action Plan"
-- (plan + next_steps + by_when + status) and the succession page's
-- "Preparation to Support Next Roles" (by_when holds a year, next_steps
-- holds that year's action items) — same shape, so one table covers both,
-- distinguished only by `category`.
CREATE TABLE employee_development_plans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  category     TEXT NOT NULL DEFAULT 'action_plan',  -- 'action_plan' | 'next_role_prep'
  plan         TEXT NOT NULL,
  next_steps   TEXT,
  by_when      TEXT,  -- free text — sample data mixes a specific month ("April 2027") and a bare year ("2026")
  status       TEXT,
  sort_order   INTEGER
);

CREATE TABLE employee_achievements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(employee_id),
  description  TEXT NOT NULL,
  sort_order   INTEGER
);

-- One row per fiscal year — a separate, multi-axis companion to
-- performance_grades (which stays the single-letter yearly grade already
-- shown elsewhere in the app).
CREATE TABLE employee_periodic_assessments (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id            INTEGER NOT NULL REFERENCES employees(employee_id),
  fiscal_year            INTEGER NOT NULL,
  performance            TEXT,
  commitment_engagement  TEXT,
  promotion_readiness    TEXT,
  risk_of_losing         TEXT,
  UNIQUE (employee_id, fiscal_year)
);

CREATE TABLE employee_competencies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(employee_id),
  competency_name TEXT NOT NULL,
  rating          TEXT,
  sort_order      INTEGER
);

CREATE TABLE employee_career_steps (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES employees(employee_id),
  step_order        INTEGER,
  destination_role  TEXT,
  level             TEXT,
  function_id       INTEGER REFERENCES functions(function_id),
  by_year           INTEGER,
  by_age            INTEGER,
  type              TEXT,
  banner_id         INTEGER REFERENCES banners(banner_id)
);

-- Per-attribute ratings for a succession candidacy ("Key Attributes
-- Required" + "Potential" on the succession page) — succession_candidates
-- itself already covers the seat/candidate/readiness/rank shape.
CREATE TABLE succession_candidate_attributes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id    INTEGER NOT NULL REFERENCES succession_candidates(candidate_id) ON DELETE CASCADE,
  attribute_name  TEXT NOT NULL,
  potential       TEXT,
  sort_order      INTEGER
);

-- ── Built-in company data ────────────────────────────────────────────────
-- Central Group's 8 real department-store banners, with their real logos
-- (copied into data/uploads/banner-logos/ by scripts/setup.mjs from
-- "logo banner and else/logo/"). This is permanent, built-in content, not
-- demo data — every fresh database has these from the moment it's created,
-- the same way the schema itself is always there. Employees/org/compensation
-- are the part a user adds themselves (or scripts/seed_demo_data.mjs /
-- scripts/migrate_from_cloud.mjs populate for trying the app out).

INSERT INTO banners (banner_id, name, logo_url) VALUES
  (1, 'Selfridges',   '/api/files/banner-logos/selfridges.jpg'),
  (2, 'Arnotts',      '/api/files/banner-logos/arnotts.jpg'),
  (3, 'Brown Thomas', '/api/files/banner-logos/brown-thomas.jpg'),
  (4, 'de Bijenkorf', '/api/files/banner-logos/de-bijenkorf.jpg'),
  (5, 'Illum',        '/api/files/banner-logos/illum.jpg'),
  (6, 'KaDeWe',       '/api/files/banner-logos/kadewe.jpg'),
  (7, 'Rinascente',   '/api/files/banner-logos/rinascente.jpg'),
  (8, 'Globus',       '/api/files/banner-logos/globus.jpg');

INSERT INTO banner_offices (banner_id, country, city, is_hq) VALUES
  (1, 'United Kingdom', 'London',      1),
  (2, 'Ireland',        'Dublin',      0),
  (3, 'Ireland',        'Dublin',      0),
  (4, 'Netherlands',    'Amsterdam',   0),
  (5, 'Denmark',        'Copenhagen',  0),
  (6, 'Germany',        'Berlin',      0),
  (7, 'Italy',          'Milan',       0),
  (8, 'Switzerland',    'Zurich',      0);
