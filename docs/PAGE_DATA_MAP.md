# Royal Flush ATS — Page → Schema Data Map

> Which database tables (and columns/types) each page reads/writes. Pairs with `SCHEMA.md` (full schema). Money = numeric (EUR). Scores = int 1–10.

---

## Quick matrix (page × table)

| Table | `/` Home | `/employees` | `/employees/[id]` Profile | `/positions` | `/comparison` | `/org/banner` | `/org/function` | `/org/headcount` | `/org/departments` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **employees** | R | R W | R W | R | R | R W | R W | R W | R |
| **banners** | R | R | R | – | R | R | – | R | R |
| **functions** | R | R | R | R | R | – | R | – | R |
| **positions** | – | R | R | R W | R | R | R | – | – |
| **employee_compensation** | R | R | R | – | R | – | – | – | – |
| **compensation_history** | – | – | R W | – | R | – | – | – | – |
| **performance_grades** | – | R | R | – | R | – | – | – | – |
| **employee_scores** | – | – | R W | – | R | R | R | – | – |
| **org_edges** | – | R | R | – | R | R W | R W | R W | – |
| **employment_history** | – | – | R | – | R | – | – | – | – |
| **employee_background** | – | – | R | – | R | – | – | – | – |
| **employee_insights** | – | – | R W | – | R | – | – | – | – |
| **departments** | – | – | – | – | – | – | – | R | R W |

R = read · W = write · "W" on employees for `/org/*` = drag-drop reassign updates `org_edges` (not employees).

---

## Column types reference (per table)

```
banners        banner_id bigint · name text                                             -- = a company
banner_offices office_id bigint · banner_id bigint(FK) · country text · city text · is_hq bool · is_regional_office bool · country_head_id bigint(FK, nullable)
functions      function_id bigint · name text · global_head_id bigint(FK, unused)
positions      position_id bigint · title text · function_id bigint(FK) · req_leadership/experiences/skill/market int(1-10)
employees      employee_id bigint · name text · photo text · date_of_birth date · nationality text · country text · city text ·
               status text(Active|Resigned) · banner_id bigint(FK, company) · office_id bigint(FK, country office) · function_id bigint(FK) · position_id bigint(FK) ·
               position_title text · job_grade text(Exec|Manager|IC) · hire_date date · position_effective_date date ·
               readiness_potential text(High|Medium|Low) · resign_date date · resignation_reason text · created_at/updated_at timestamptz
org_edges      id bigint · employee_id bigint(FK) · parent_employee_id bigint(FK, NULL=root) · dimension text(banner|function|headcount)
departments    department_id bigint · name text · owner_employee_id bigint(FK, NULL=vacant) · office_id bigint(FK) · function_id bigint(FK, nullable) · headcount int
employee_compensation  employee_id bigint(PK,FK) · currency text · base_salary/sti_target/sti_max/lti_target/lti_max/other_bonus numeric ·
               allowance_company_car/mobility/home_office/private_medical/family_cover numeric · total_compensation numeric
compensation_history   id bigint · employee_id bigint(FK) · fiscal_year int · effective_date date · base_salary numeric · total_comp numeric · adjustment_amount numeric · note text
performance_grades     id bigint · employee_id bigint(FK) · fiscal_year int · grade text(A|A-|B+|B|B-) · label text
employee_scores        employee_id bigint(PK,FK) · leadership/experiences/skill/market int(1-10) · updated_at timestamptz
employment_history     id bigint · employee_id bigint(FK) · banner text · position text · start_date/end_date date · is_current bool
employee_background    id bigint · employee_id bigint(FK) · type text(experience|education|certification) · title text · organization text · detail text · sort_order int
employee_insights      id bigint · employee_id bigint(FK) · category text(Top Performer|Leadership Potential|Talent Status) · content text · source text(ai|manual) · generated_at timestamptz
```

---

## Per-page detail

### `/` — Home (landing + world map)
**Server action:** `listEmployees`, `getCompanySummary`, `getFunctionSummary`
| Table | Columns used | Purpose |
|---|---|---|
| employees | `status` | active count |
| employee_compensation | `total_compensation` numeric | avg total comp stat |
| banners | `name`, + employee count | Companies KPI |
| banner_offices | `country`, `is_hq`, `is_regional_office`, + employee count | world-map markers (headcount/country), countries/HQ/regional stat |
| functions | (count) | functions stat |

### `/employees` — list + toolbar (Add / Import / Export CSV / Template)
**Server actions:** `listEmployees`, `listPositions`, `getCompanySummary`, `listOffices` · **writes:** `createEmployee`, `importEmployeesCsv`
| Table | Columns | Purpose |
|---|---|---|
| employees | employee_id, name, photo, position_title, country, status, banner_id, office_id, function_id (+ **W** insert on Add/Import) | table rows; new employee insert |
| employee_compensation | total_compensation | "Total Comp" column |
| performance_grades | fiscal_year, grade | "Latest Grade" column |
| org_edges | parent_employee_id, dimension=banner | "Team" (active direct reports) |
| banners / banner_offices | name, country | Company/Country filters + Add/Import dropdown ("Company — Country") + import validation |
| positions | position_id, title | position dropdown + import validation |
| functions | function_id, name | derived on insert |

Query params `?q=`, `?company=`, `?country=`, `?function=` pre-set the corresponding filter — used by the org pages to deep-link into a filtered employee list.

### `/employees/[id]` — Employee Profile
**Server action:** `getEmployee` · **writes:** `uploadEmployeePhoto` (employees.photo), `saveEmployeeScores` (employee_scores), `generateInsights`/`saveManualInsight` (employee_insights)
| Table | Columns | Purpose |
|---|---|---|
| employees | all core fields incl. photo (**W**), banner_id, function_id, position_id | hero, personal/employment, stats |
| employee_compensation | base/sti/lti/allowances/total numeric | Compensation & Benefits grid |
| performance_grades | fiscal_year, grade, label | 5-year performance timeline |
| compensation_history | fiscal_year, base/cash_allowance/pension, sti_eligible_pct+sti_actual_pct+sti_amount, lti_* (**W**) | **Compensation History** card — per-year base + STI/LTI actual vs eligible; € derived = actual% × base |
| employee_scores | leadership/experiences/skill/market int (**W**) | Competency Scores card |
| positions | req_leadership/experiences/skill/market | pass/fail vs scores |
| org_edges | parent_employee_id, dimension=banner | manager + direct reports + team size |
| employment_history | banner, position, start/end_date, is_current | Employment History (within CG) |
| employee_background | type, title, organization, detail | Background (education/cert/external) |
| employee_insights | category, content, source (**W**) | Key Insights (AI/manual) |

### `/positions` — Positions & Requirements (CRUD)
**Server actions:** `listPositions`, `createPosition`, `updatePosition`, `deletePosition` (all **W**) + `getFunctionSummary`
| Table | Columns | Purpose |
|---|---|---|
| positions | position_id, title, function_id, req_leadership/experiences/skill/market (**W**) | requirement badges, add/edit/delete |
| functions | function_id, name | function dropdown |
| employees | position_id | headcount per position |

### `/comparison` — Employee Comparison (+ what-if, PPTX/HTML export)
**Server actions:** `listEmployees` (picker), `getComparisonData` = `getEmployee` per selected id
| Table | Columns | Purpose |
|---|---|---|
| employees | name, photo, position_title, banner_name, country, hire_date, position_effective_date, status, job_grade | columns + summary badges |
| employee_compensation | base/sti/lti/allowances/total numeric | comp rows + bar chart + what-if (client-side override) |
| performance_grades | fiscal_year, grade | 5-year grid |
| org_edges | parent dimension=banner | team size badge |
| (compensation_history, scores, background, insights via getEmployee) | — | loaded but not all rendered |
> *What-if "(adjusted)" column is client-only — no DB write.*

### `/org/banner` — Org Structure By Company (d3 chart + drag-drop + PPTX)
**Server actions:** `getOrgFlat('banner')`, `getCompanySummary` · **write:** `moveEmployee` (org_edges)
| Table | Columns | Purpose |
|---|---|---|
| org_edges | employee_id, parent_employee_id, dimension=banner (**W** on drag-drop) | tree edges; reassign (one root CEO per company) |
| employees | employee_id, name, position_title, photo, banner_id, office_id, status, position_id | node cards |
| banners | banner_id, name | Company Summary header rows |
| banner_offices | office_id, country, city, is_hq, is_regional_office, +count | nested country-office rows under each company, each a `Link` to `/employees?company=&country=` |
| employee_scores | leadership/experiences/skill/market | node click info + drag fit-check |
| positions | req_* | fit-check vs target node's requirement |

### `/org/function` — Org Structure By Function (d3 chart + drag-drop + PPTX + function filter)
**Server actions:** `getOrgFlat('function', functionId?)`, `getFunctionSummary` · **write:** `moveEmployee` (org_edges, dimension=function)
| Table | Columns | Purpose |
|---|---|---|
| org_edges | dimension=function (**W**) | one independent hierarchy per company per function (up to 6×N roots) |
| employees | name, position_title, photo, banner_id, office_id, status, function_id, position_id | node cards |
| functions | function_id, name | function picker (unfiltered view lists all 6; `?function=<id>` narrows the chart + drill-down to one) |
| banners / banner_offices | name / country | Function Summary breakdown by company + country when a function is selected, each row a `Link` to `/employees?function=&company=&country=` |
| employee_scores / positions | scores & req_* | node info + fit-check |

### `/org/headcount` — Org Structure Hierarchy + Headcount (d3 chart + drag-drop + PPTX)
**Server actions:** `getHeadcountFlat` (= `getOrgFlat('headcount')` + rollup), `listDepartments` · **write:** `moveEmployee` (org_edges, dimension=headcount)
| Table | Columns | Purpose |
|---|---|---|
| org_edges | dimension=headcount (**W** on drag-drop) | independent hierarchy for this view (currently mirrors `banner`) |
| employees | name, position_title, photo, banner_id, office_id, status | node cards |
| departments | owner_employee_id, office_id, headcount | rolled up bottom-up per node → total headcount + distinct country count shown on card + click-through drill-down of departments owned directly |
| banner_offices | office_id, country | resolves each department's country for the rollup |

### `/org/departments` — Departments CRUD (headcount buckets)
**Server actions:** `listDepartments`, `listEmployees`, `listOffices`, `getFunctionSummary` · **writes:** `createDepartment`, `updateDepartment`, `deleteDepartment`
| Table | Columns | Purpose |
|---|---|---|
| departments | name, owner_employee_id (nullable=vacant), office_id, function_id, headcount (**W**) | table rows; add/edit/delete |
| employees | employee_id, name | owner dropdown |
| banner_offices / banners | office_id, country, banner_name | Company/Office dropdown ("Company — Country") |
| functions | function_id, name | optional function tag dropdown |

---

## Write operations summary (where data changes)

| Action | Page | Table(s) written |
|---|---|---|
| `createEmployee` / `importEmployeesCsv` | /employees | employees (insert) |
| `uploadEmployeePhoto` | Profile | employees.photo + Storage `profile-photos` |
| `saveEmployeeScores` | Profile | employee_scores (upsert) |
| `generateInsights` / `saveManualInsight` | Profile | employee_insights |
| `createPosition` / `updatePosition` / `deletePosition` | /positions | positions (+ employees.position_id nulled on delete) |
| `moveEmployee` | /org/* | org_edges.parent_employee_id |
| `createDepartment` / `updateDepartment` / `deleteDepartment` | /org/departments | departments |
| `upsert/update/deleteCompensationHistory` | Profile | compensation_history |
| `createProposal` / `updateProposal` / `updateProposalCompensation` / `deleteProposal` | /proposals, /proposals/[id] | salary_proposals, salary_proposal_compensation |
| `addProposalComparison` / `removeProposalComparison` / `setProposalComparisons` / `createProposalForComparison` | /proposals/[id], /comparison_v2 | salary_proposal_comparisons (+ salary_proposals on create) |

*All writes go through service-role server actions (`src/lib/supabase/admin.ts`, bypasses RLS).*

## New modules (2026-07-14)

- **`/comparison_v2`** — "Tale of the Tape" scoreboard redesign of `/comparison` (reuses `getComparisonData`; both routes coexist). Adds **Save to proposal** → attach the current board to an existing proposal (replaces its set) or create a new one (asks employee + optional position).
- **`/proposals` + `/proposals/[id]`** — Appointment & Compensation Review. Detail page has two tabs: **Proposal** (details, past roles, justification, org snapshot, Salary Review table with historical `A` columns + editable `Propose` column) and **Comparison** (embedded `/comparison_v2`, seeded with the subject as a locked column 1 + persisted peers). `?tab=comparison` deep-links the second tab.

*Generated 2026-06-23 · Royal Flush ATS v1.0 beta. Updated 2026-07-14 — migrations 005–007: `salary_proposals`, `salary_proposal_compensation`, `salary_proposal_comparisons`, `compensation_history` per-year STI/LTI actual/eligible; `/proposals` + `/comparison_v2`.*
