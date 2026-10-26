# Royal Flush ATS — Database Schema & Data Reference

> **Purpose:** handoff for UI/UX design work. Describes every table, field, data type, value domain, derived value, and the current dummy dataset — so design can be done against real data shapes. Supabase (PostgreSQL 17). All money is **EUR (€)**.

---

## 1. Entity overview

```
banners (company)                   functions (HR, Finance, ...)
      ▲                                   ▲
      │ banner_id                         │ function_id
banner_offices (country office)           │
      ▲                                   │
      │ office_id                         │
      └──────────────┐      ┌─────────────┘
                  employees ──────────────────────────────────┐
                     │ employee_id (PK)                        │
   ┌─────────────────┼───────────────┬──────────────┬─────────┤
   ▼                 ▼               ▼              ▼          ▼
org_edges   employee_compensation  performance   compensation  employment_history
(3 dims)    (1:1)                  _grades(5y)   _history(3y)  + employee_background
                                                               + employee_insights
```

- **`banners` = a company** (can span multiple countries). Its country offices live in a separate child table, **`banner_offices`** (`office_id`, `country`, `city`, `is_hq`, `is_regional_office`, `country_head_id`). An `employees` row has both `banner_id` (which company) and `office_id` (which of that company's country offices) — mirrored from their primary position (see below).
- **1 employee** has: 1+ `employee_positions` rows (exactly one flagged primary — mig 026, "seat model"), 0–1 compensation row, many performance grades (1 per fiscal year), many comp-history rows, many history/background/insight rows.
- **1 employee_position (seat)** has: many `employee_targets` (mig 027) — performance targets belong to the seat, not the person, so a concurrent position carries its own separate set.
- **Org is modelled as edges** (`org_edges`), keyed on **`employee_position_id`** (not a column on `employees` directly — see mig 026), so the same **position** can sit in three trees: a **banner** tree (real company reporting line — one root CEO per company), a **function** tree (each company runs its **own independent** function hierarchy — e.g. 3 companies ⇒ 3 separate HR sub-trees), and a **headcount** tree (drives `/org/headcount`'s rollup). A person holding two concurrent positions is two separate nodes, each with its own place in all three trees.
- **`departments`** are headcount *buckets*, not individually-tracked employees — see §2 and `/org/headcount`.

---

## 2. Tables

### `banners` — a company (can span multiple countries)
| column | type | notes |
|---|---|---|
| banner_id | bigint PK | |
| name | text | e.g. "Nexus Retail Group" |

### `banner_offices` — one of a company's country offices
| column | type | notes |
|---|---|---|
| office_id | bigint PK (identity) | |
| banner_id | bigint → banners | which company this office belongs to |
| country | text | |
| city | text | |
| is_hq | boolean | true for that company's HQ |
| is_regional_office | boolean | true for regional hubs |
| country_head_id | bigint → employees, nullable | not populated in the current dummy data |

### `functions` — a functional area
| column | type | notes |
|---|---|---|
| function_id | bigint PK | |
| name | text | Leadership, Product, Human Resources, Finance, Marketing, Operations |
| global_head_id | bigint → employees | The employee designated **Head of Function**. Must currently have no reporting edge to anyone in this function (i.e. be a root) to take effect. Purely a display anchor — see below. |

**Cross-company (and cross-function) reporting is a real `org_edges` row**, set the same way as any other reporting line — drag-and-drop, or the profile's Org Snapshot editor (`getOrgPlacement` / `setEmployeeManager`). There is no separate table for this (migration `018`'s `function_head_scope` was tried and dropped in `019` — it duplicated what a real edge already does).

`global_head_id` answers a narrower, different question: once a head is designated, a company that runs this function with **no reporting edge to anyone at all** still needs somewhere sensible to render — `getOrgTree` places its lead one level below the head, at the same rank as the leads who *do* report in, but with the connector hidden (`OrgNode.reports_to_parent: false`), since no relationship exists to draw. This can't be a real edge, because by definition there is no reporting relationship — it's a layout convenience for the "nobody reports to anyone" case only.

The renderer (`org-chart-d3.tsx`) draws every link one of three ways: hidden when `reports_to_parent` is `false`, dashed when the two ends' `banner_id` differ (a real cross-company report), solid otherwise.

### `positions` — position catalog with requirement scores (mig 025: scoped per company)
| column | type | notes |
|---|---|---|
| position_id | bigint PK | |
| title | text | e.g. "Senior Product Manager" |
| banner_id | bigint → banners, nullable | which **company** this position belongs to — same title can exist once per company, each with its own requirement scores (e.g. "CEO" at Selfridges ≠ "CEO" at De Bijenkorf) |
| function_id | bigint → functions | optional grouping |
| req_leadership | int 1–10 | requirement score |
| req_experiences | int 1–10 | requirement score |
| req_skill | int 1–10 | requirement score |
| req_market | int 1–10 | requirement score |
- `UNIQUE(banner_id, title, function_id)` — replaced the old globally-unique `title` constraint (mig 025). Every position picker in the app (Add Employee wizard, CSV import, OrgChart OCR, Positions admin, Proposals "New Position") is scoped to the relevant company's `banner_id`.
- Managed at `/positions` (add/edit/delete, filterable by company). Employees link via `employees.position_id`.

### `employee_scores` — a person's competency scores (1:1)
| column | type | notes |
|---|---|---|
| employee_id | bigint PK → employees | |
| leadership | int 1–10 | |
| experiences | int 1–10 | |
| skill | int 1–10 | |
| market | int 1–10 | |
- Editable on the Profile page. Compared against the person's position requirement (pass = score ≥ requirement). Used by the Org Chart drag-drop "fit check".

### `employees` — core person record
| column | type | notes |
|---|---|---|
| employee_id | bigint PK | |
| position_id | bigint → positions | **primary-position cache** (mig 026) — always mirrors this person's primary `employee_positions` row, kept in sync by `syncEmployeeCache()`. Every display-only reader in the app keeps reading these columns unchanged. |
| name | text | |
| photo | text | profile picture URL. Public Supabase Storage bucket `profile-photos` exists; uploads go there. Dummy data uses placeholder face URLs (i.pravatar.cc). |
| date_of_birth | date | |
| nationality | text | |
| country | text | |
| city | text | |
| status | text | **`Active` \| `Resigned` \| `Vacant`** (Vacant = an org-chart seat placeholder, not a real person) |
| banner_id | bigint → banners | **primary-position cache** (mig 026) — see position_id |
| office_id | bigint → banner_offices | **primary-position cache** (mig 026) — see position_id |
| function_id | bigint → functions | **primary-position cache** (mig 026) — see position_id |
| position_title | text | **primary-position cache** (mig 026) — see position_id |
| job_grade | text | internal level: `Exec` \| `Manager` \| `IC` (dummy convention) — still person-level, not per-position |
| hire_date | date | → drives Years of Service |
| position_effective_date | date | → drives Years in Position |
| readiness_potential | text | **`High` \| `Medium` \| `Low`** |
| resign_date | date | set when status = Resigned |
| resignation_reason | text | |
| created_at / updated_at | timestamptz | |

### `employee_positions` — a person's positions, one row per position held (mig 026: "seat model")
| column | type | notes |
|---|---|---|
| employee_position_id | bigint PK | **the org-chart node/edge identity now** — see `org_edges` below |
| employee_id | bigint → employees, NOT NULL, `on delete cascade` | who holds this position |
| position_title | text, NOT NULL | |
| position_id | bigint → positions, nullable | optional link to the req-scoring catalog |
| function_id | bigint → functions, nullable | |
| banner_id | bigint → banners, NOT NULL | this position's own company — can differ from another position the same person holds |
| office_id | bigint → banner_offices, NOT NULL | this position's own country office |
| is_primary | boolean, default false | **exactly one `true` row per `employee_id`**, enforced by a partial unique index (`employee_positions_one_primary`) |
| position_effective_date | date, nullable | |
| created_at / updated_at | timestamptz | |
- A person holding two positions at once (e.g. their normal job plus an acting assignment, possibly at a different company) is two rows here, each its own independently-placed org-chart node with its own reporting line, in every dimension. FTE/headcount counts each row (seat) separately, not each distinct person.
- Every `employees` row (real or phantom-Vacant) always has exactly one primary `employee_positions` row — created alongside it by `createOrgEdges` (`employee-crud.ts`), same choke point every creation path (wizard, CSV import, OrgChart OCR) already funnels through.
- Concurrent (non-primary) positions are managed from the employee profile's **Positions card** (`addEmployeePosition` / `updateEmployeePosition` / `removeEmployeePosition` / `setPrimaryPosition`, `src/app/actions/employee-positions.ts`) — each one set up with its own title, function, company/office, and manager at creation time. A position's manager, once set, is only changed by dragging it on the org chart (or the primary position's Org Snapshot editor), same as before.
- **Out of scope for this migration** (still `employee_id`-keyed, resolved via the person's primary position where relevant): `succession_seats`, `functions.global_head_id`, `banner_offices.country_head_id`, `departments.owner_employee_id`.

### `org_edges` — reporting edges (3 dimensions)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_position_id | bigint → employee_positions, `on delete cascade` | the org-chart node — a **position**, not a person (mig 026) |
| parent_employee_position_id | bigint → employee_positions | **NULL = root of that tree** |
| dimension | text | **`banner` \| `function` \| `headcount`** |
- `banner` dimension → **one tree per company** (each company has its own root CEO — 3 companies ⇒ 3 root trees, wrapped in a synthetic "Organization" root when rendered).
- `function` dimension → **each company runs its own function hierarchy by default** (up to 6N roots for N companies × 6 functions), but unlike the other two dimensions this one **does allow a real cross-company (or even cross-function) edge** — a Head of Function whose direct reports sit in other companies. `/org/function` filters to a single function via `getOrgFlat("function", functionId)`; a company with no such edge to anyone still shows as its own independent sub-tree.
- `headcount` dimension → independent hierarchy powering `/org/headcount` (currently seeded as a copy of the `banner` tree — the real per-company management chain — so headcount rolls all the way up to each company's CEO, and to a combined grand total at the synthetic root). Each node's total headcount + country count is rolled up from `departments` owned anywhere in its subtree — see below.

**Every position must have a row in all three dimensions.** The tree is built by walking edges, not `employee_positions`, so a position with no edge is invisible on every chart — and with no node to drag, unreachable from the UI. `createOrgEdges` writes all three at creation time. A NULL parent is the safe default: it renders the position at the top of that tree, where they can be re-pointed.

**Two ways to change a reporting line:** drag-and-drop on the org chart (`moveEmployee`, `moveEmployeeAlone`, `replaceVacant`, `promoteToReplace` — all chart-only, all position-keyed post-mig-026), or the **Org Snapshot editor on the employee profile** (`getOrgPlacement` / `setEmployeeManager`) — this editor is still employee-id-scoped on the outside (resolves to that person's **primary** position internally) and is the only path that works for someone not currently on the chart; a concurrent position's own reporting line is set once, at creation, from the Positions card. Both only reject cycles — no company/function restriction on the `function` dimension, since a real cross-company (or cross-function) edge there is a legitimate Head of Function relationship, not a mistake.

`getEmployee()`'s `manager` / `reports` (used by the profile's Org Snapshot card and the Proposal PPTX export) are resolved off the person's **primary position only** and merge the banner and function dimensions: `reports` is the union (deduped — the same person can be both a real banner-dimension direct report and a function-dimension one); `manager` stays the banner-dimension manager, with a function-dimension manager surfaced separately as `functionManager` only when it differs (the everyday case is they're identical, so nothing extra shows). Each report/manager carries a `cross_banner` flag so the UI can draw that connector dashed. `getEmployee()` additionally returns a `positions[]` array — every position the person holds, for the profile's Positions card.

### `departments` — headcount buckets (not individually-tracked employees)
| column | type | notes |
|---|---|---|
| department_id | bigint PK | |
| name | text | e.g. "HRIS", "HRBD" |
| owner_employee_id | bigint → employees, nullable | **NULL = vacant** (no owner assigned yet) |
| office_id | bigint → banner_offices | which country office this headcount bucket sits in (company is derived via `banner_offices.banner_id`) |
| function_id | bigint → functions, nullable | optional tag |
| headcount | int | manually entered — this is a count, not real employee rows |
- Managed at `/org/departments` (add/edit/delete). Consumed by `/org/headcount` for the rollup (own headcount = sum of departments a person owns directly; total headcount = own + sum of all descendants' totals in the `headcount` dimension tree; country count = distinct `banner_offices.country` across that subtree).

### `employee_compensation` — 1:1 with employee, all EUR
| column | type | group |
|---|---|---|
| employee_id | bigint PK → employees | |
| currency | text (default EUR) | |
| base_salary | numeric | **compensation** |
| sti_target / sti_max | numeric | **compensation** (STI = short-term incentive) |
| lti_target / lti_max | numeric | **compensation** (LTI = long-term incentive) |
| other_bonus | numeric | **compensation** |
| allowance_company_car | numeric | benefit |
| allowance_mobility | numeric | benefit |
| allowance_home_office | numeric | benefit |
| allowance_private_medical | numeric | benefit |
| allowance_family_cover | **text** (was numeric — migration `023`) | benefit — free text, "Other benefit (please specify)" in the UI, not a € amount |
| total_compensation | numeric | **entered value, NOT auto-summed** (see §5/D7) |

### `compensation_history` — per-fiscal-year compensation snapshot (editable on Profile)
Unique on `(employee_id, fiscal_year)`. Editable via the **Compensation History** card on the employee profile; feeds the historical columns of the proposal Salary Review table.
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_id | bigint → employees | |
| fiscal_year | int | e.g. 2023–2025; unique per employee |
| effective_date | date | |
| base_salary / total_comp | numeric | `total_comp` derived = base + sti_amount + lti_amount |
| adjustment_amount | numeric | legacy: the increase applied |
| cash_allowance | numeric | (mig 005) |
| sti_eligible_pct | numeric | STI **target** % of base (mig 005) |
| sti_actual_pct | numeric | STI **actual/paid** % of base (mig 007) |
| sti_amount | numeric | derived = actual% × base |
| lti_eligible_pct / lti_actual_pct / lti_amount | numeric | LTI target%, actual%, derived € (mig 005/007) |
| pension_contribution | numeric | (mig 005) |
| note | text | |

> Actual vs Eligible: both `%` are entered on the profile; the euro amount is always `actual% × base`. The proposal "Propose" column only carries the target (`*_eligible_pct` + amount) since a future year has no actual yet.

### `salary_proposals` — one Appointment & Compensation Review proposal (mig 005)
| column | type | notes |
|---|---|---|
| proposal_id | bigint PK | |
| employee_id | bigint → employees | the proposal's subject |
| status | text | draft / submitted / approved |
| approval_new_role / approval_comp_adjustment | bool | |
| approval_other_label | text | |
| new_position_id | bigint → positions | optional |
| new_manager_id | bigint → employees | optional |
| effective_date | date | |
| justification / role_description | text | |
| target_fiscal_year | int | the "Propose FY" column |

### `salary_proposal_compensation` — 1:1 proposed "Propose" column (mig 005)
`base_salary, cash_allowance, sti_eligible_pct, sti_amount, lti_eligible_pct, lti_amount, pension_contribution, other_items, other_remarks` — the editable proposed figures.

### `salary_proposal_comparisons` — benchmark peers pinned to a proposal (mig 006)
PK `(proposal_id, employee_id)` + `sort_order`. Backs the **Comparison** tab embedded in a proposal (reuses `/comparison_v2`). The proposal's own employee is column 1 (implicit, not stored here).

### `performance_grades` — one row per fiscal year (5-year history)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_id | bigint → employees | |
| fiscal_year | int | 2021–2025 |
| grade | text | **`A` \| `A-` \| `B+` \| `B` \| `B-`** |
| label | text | **Excellent / Very Good / Good / Satisfactory / Fair** |
- The **outcome** only. What the person was actually asked to deliver lives in the three Performance Management tables below (mig 027); the two join on `(employee_id, fiscal_year)` when a grade needs showing next to the targets behind it. Nothing links them automatically in phase 1.

### Performance Management (mig 027) — cycles → company goals → seat targets

Three tables, one per level. Added because `performance_grades` recorded a result with no record of the work behind it.

#### `performance_cycles` — the review year
| column | type | notes |
|---|---|---|
| cycle_id | bigint PK | |
| name / fiscal_year | text / int | "FY2026" / 2026 — `fiscal_year` is **unique**, and lines up with `performance_grades.fiscal_year` |
| start_date / end_date | date | |
| status | text | **`draft` \| `active` \| `closed`** — the page defaults to the first `active` one |

#### `banner_goals` — what a company is aiming for that year
| column | type | notes |
|---|---|---|
| goal_id | bigint PK | |
| cycle_id | bigint → performance_cycles, `on delete cascade` | |
| banner_id | bigint → banners | goals are always per-company |
| title / description / category | text | `category` is free text (Financial / Customer / People / Process), nullable |
| metric_unit | text | "€M", "%", "stores" |
| target_value / actual_value / progress_pct | numeric | see the measurement note below |
| weight / sort_order | numeric / int | |

#### `employee_targets` — what a seat is doing about it
| column | type | notes |
|---|---|---|
| target_id | bigint PK | |
| cycle_id | bigint → performance_cycles, `on delete cascade` | |
| **employee_position_id** | bigint → employee_positions, `on delete cascade` | **the target's owner — a SEAT, not a person** (mig 026 seat model) |
| employee_id | bigint → employees, `on delete cascade` | denormalised person pointer, same "cache" reasoning as `employees.position_id` — lets the profile card fetch one person's targets across every seat in a single query |
| **banner_id** | bigint → banners, not null | **which company this was recorded against, snapshotted at creation** (mig 028) — *not* read live off the seat. See "when people move" below |
| banner_goal_id | bigint → banner_goals, **`on delete set null`** | **optional** alignment. Retiring a company goal leaves its individual targets intact, just unaligned |
| title / description / category / metric_unit | text | |
| target_value / actual_value / progress_pct | numeric | |
| weight | numeric | conventionally sums to 100 per (seat, cycle) — **not enforced**; the UI warns instead, since drafts happen |
| status | text | `draft` \| `active` \| `achieved` \| `missed` \| `cancelled` (phase 1 only ever writes `active`) |
| due_date / sort_order | date / int | |

**Why the seat and not the person:** someone holding a concurrent position at another company gets a genuinely separate set of targets, so the per-company view never mixes in another company's work — and it matches the org chart, whose nodes are already positions, which is what lets `/performance` reuse the chart directly.

**What happens when people move (agreed behaviour: performance follows the person):**
- **Someone leaves and is replaced** — `replaceVacant` never swaps `employee_id` on an existing position; the incoming person brings their own `employee_positions` row and the vacant one is deleted. A replacement therefore **cannot inherit their predecessor's targets** and starts from nothing, which is the intent. Deleting the departing employee cascades their positions and targets away with them.
- **Someone changes company** — `updateEmployeePosition` rewrites `banner_id` on the same position row, so their targets travel with them onto their profile and into the new company's chart, as intended. What does **not** travel is `employee_targets.banner_id` (mig 028): that snapshot records whose books the work was done against, so a closed year's numbers can't change retroactively because someone transferred afterwards. Verified: moving a seat out of Selfridges leaves its objective still reading 87% off the same three aligned targets.
  - They no longer have a node in the old company's chart, so `getDepartedHolders` lists them in a **"No longer in this company"** card in the right panel ("Moved to De Bijenkorf · 3 targets recorded here") linking to their profile — otherwise their contribution would silently disappear from that cycle.
  - A target aligned to the **old** company's objective keeps that `banner_goal_id`. The panel shows those rows under an "Objective from another company" heading rather than hiding them (they still count toward the person's overall figure, so dropping them would leave a total that didn't add up) and prompts to re-point or clear it. Nothing rewrites it automatically — which objective it should now serve is a judgement call, not a lookup.
- **Someone resigns** — `employees.status` becomes `Resigned` but they keep their seat, so they stay on the chart with their targets intact and are flagged with a red **Resigned** chip on the node (which takes precedence over Primary/Concurrent — having left is the more urgent fact when reading a cycle). They're deliberately *not* in the departed card, since they're still visible in the tree.

**Measurement (all maths in `src/lib/performance.ts`, shared by server and client so it can't drift):**
- progress = `progress_pct` if set, else `actual_value / target_value × 100`, else null
- a manual `progress_pct` is the escape hatch for goals that aren't numeric ("launch the loyalty programme") **and** for "lower is better" metrics like turnover, where the ratio would be upside down — phase 1 has no direction flag
- rollup = `Σ(pct × weight) / Σ(weight)`, skipping targets with no measurable progress (an unreported target shouldn't score as a failure); plain average when no weight is set anywhere
- status: `none` (0 targets) / `pending` (no actuals yet) / `below` (<80%) / `near` (80–99%) / `met` (≥100%)
- a **company goal** has a second source individual targets don't — the people working on it. An explicitly entered actual/progress still wins (a goal like "total group revenue" isn't the sum of anyone's individual targets), but with none entered it falls back to the weighted rollup of every target aligned to it, labelled in the UI so a derived figure is never mistaken for an entered one (`goalProgress` / `goalProgressIsDerived`)

### `employment_history` — a person's career history (internal moves **or external employers**)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_id | bigint → employees | |
| banner | text | employer/company name — **free text, not an FK**, so it can be one of our tracked companies or a fully external employer |
| position | text | |
| location | text, nullable | country / city where that role was based |
| start_date / end_date | date | end_date NULL if current |
| is_current | boolean | |
- Editable on the Profile page's "Career History" card (add/edit/delete) via `createEmploymentHistory` / `updateEmploymentHistory` / `deleteEmploymentHistory` (`src/app/actions/employment-history.ts`). Always visible (shows an empty state + Add button when there are no rows), unlike `employee_background` which stays hidden until it has data.

### `employee_background` — external experience + education + certs
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_id | bigint → employees | |
| type | text | **`experience` \| `education` \| `certification`** |
| title | text | e.g. "Master of Business Administration (MBA)" |
| organization | text | |
| detail | text | |
| sort_order | int | display order |

### `succession_seats` — a "seat" in a company's succession plan (filled or vacant)
| column | type | notes |
|---|---|---|
| seat_id | bigint PK | |
| parent_seat_id | bigint → succession_seats, nullable | NULL = root of that company's tree; `on delete cascade` (deleting a seat deletes its subtree) |
| banner_id | bigint → banners | which company |
| office_id | bigint → banner_offices, nullable | which country office, if relevant |
| position_id | bigint → positions, nullable | title from the position catalog (scoped to this seat's own `banner_id`) |
| employee_id | bigint → employees, nullable | **NULL = vacant seat** |
| label | text, nullable | custom display name when `position_id` is unset (e.g. a planned role not yet in the catalog) |
| sort_order | int | |
- Seeded once per company by mirroring that company's real `banner`-dimension reporting chain (one seat per employee) plus a few deliberately vacant "planned role" seats. Managed at `/org/succession` — click a seat to reassign its incumbent/position, add a child seat, or delete it.

### `succession_candidates` — ranked, color-coded successors for a seat
| column | type | notes |
|---|---|---|
| candidate_id | bigint PK | |
| seat_id | bigint → succession_seats | `on delete cascade` |
| candidate_name | text | always set — mirrors the employee's name if internal, or free text if external |
| candidate_employee_id | bigint → employees, nullable | **NULL = external candidate** (not in this system); set = internal, clickable through to their Profile |
| readiness | text | **`ready_now` \| `ready_1_3` \| `ready_3_5`** — green / yellow / red in the UI |
| rank | int | display order within the seat |

### `employee_insights` — Key Insights cards (AI or manual)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| employee_id | bigint → employees | |
| category | text | **`Top Performer` \| `Leadership Potential` \| `Talent Status`** |
| content | text | 1–2 sentences |
| source | text | **`ai` \| `manual`** |
| generated_at | timestamptz | |

---

## 3. Value domains (enumerations) — quick reference for UI

| Field | Allowed values |
|---|---|
| employees.status | `Active`, `Resigned`, `Vacant` (org-chart seat placeholder, not a real person) |
| employees.readiness_potential | `High`, `Medium`, `Low` |
| employees.job_grade | `Exec`, `Manager`, `IC` |
| org_edges.dimension | `banner`, `function`, `headcount` |
| performance_grades.grade | `A`, `A-`, `B+`, `B`, `B-` |
| performance_grades.label | Excellent, Very Good, Good, Satisfactory, Fair |
| employee_background.type | `experience`, `education`, `certification` |
| employee_insights.category | Top Performer, Leadership Potential, Talent Status |
| employee_insights.source | `ai`, `manual` |

---

## 4. Derived / computed values (computed in app, not stored)

| Display value | Formula |
|---|---|
| Years of Service | now − `hire_date` |
| Years in Position | now − `position_effective_date` |
| Team Size | count of `org_edges` where `parent_employee_position_id = X` (X = that position's own `employee_position_id`) and `dimension='banner'` **and the reporting position's employee status = Active** |
| Current Performance | grade of the latest `fiscal_year` in `performance_grades` |
| Org Snapshot | manager (banner edge parent) → employee → direct reports |

---

## 5. Compensation rules (important for charts)

- **D7 — `total_compensation` is entered, not derived.** It may not equal the sum of components (in the mockup, total €160,000 while base+STI+LTI+other = €155,000). Display it as-is.
- **D8 — "Compensation only" (the Comparison bar chart, excluding benefits) = `base_salary + sti_target + lti_target + other_bonus`.** All `allowance_*` columns are **benefits** and are excluded from that figure.
  Implemented in `src/lib/format.ts → compensationOnly()`.

---

## 6. Current dummy dataset (what exists to design against)

> **Updated 2026-08-04:** `banners` now holds the **real 8 companies** (replacing the 3 mock ones below), with real logos uploaded to the `banner-logos` bucket — see `docs/SYSTEM_AUDIT.md` §2. Employee records underneath them are still the mock data described in this section; only the company/banner layer is real. The `banner_offices` / country structure below is now stale for the 3 original mock companies — Selfridges/De Bijenkorf/Brown Thomas Arnotts inherited the offices of whichever mock banner_id they replaced (1/2/3), and the 5 newly-inserted banners (Rinascente, Globus, Illum, KaDeWe, Europe HO) have no offices or employees yet.

- **3 companies (banners)** *(historical — see update note above)*, each with **3 country offices (banner_offices)** — 9 offices total:
  - **Nexus Retail Group** — England (HQ), France, Germany
  - **Orion Financial Holdings** — Austria (HQ), Switzerland (regional), Netherlands
  - **Vertex APAC Solutions** — Singapore (HQ), Thailand (regional), Australia
- **6 functions** (shared position catalog): Leadership, Product, Human Resources, Finance, Marketing, Operations.
- **48 employees**, 16 per company: 1 CEO (HQ) → 5 function heads (VP Product / CHRO / CFO / CMO / COO, all at HQ, each reporting to their CEO) → 10 country-office managers (2 per function, one in each of the company's other 2 offices, reporting to their function head). All Active — no resigned employees in this seed.
- **org_edges**: `banner` dimension = 3 trees (one root CEO per company, the real management chain); `function` dimension = up to 18 roots (6 functions × 3 companies, each company's function hierarchy fully independent); `headcount` dimension = copy of the `banner` trees.
- **departments**: 48 rows (one per employee) — each function head and each country-office manager owns exactly one department bucket sized 4–15 headcount; CEOs own none (pure rollup). Total headcount across all departments: 450, spanning all 9 countries.
- Compensation, 5-yr performance, and competency scores populated for all 48. `employment_history` / `employee_background` / `employee_insights` are **empty** in this seed (not regenerated — fine since Profile page handles empty gracefully).
- All `photo` fields are NULL.

---

## 7. Access / security (current)

- **RLS enabled** on all tables with one policy each: `FOR ALL TO authenticated USING (true)` — i.e. **v1.0 is open to any authenticated user** (D9). App data access currently goes through **service-role server actions** (`src/lib/supabase/admin.ts`), which bypass RLS.
- Role-based access (HR Admin vs Manager-sees-own-team) is **deferred to a later phase**. GDPR/PDPA + access governance are noted but not yet implemented.

---

## 8. Feedback round 1 — now implemented ✅

1. **Profile picture storage — DONE.** Public Supabase Storage bucket `profile-photos` created; upload action (`src/app/actions/photo.ts`) + hover camera button on Profile. `EmployeeAvatar` (photo or initials fallback) used on Profile, Comparison, Employees list, and Org trees. Dummy faces seeded via i.pravatar.cc.
2. **Export on Profile + Comparison — DONE.** Both pages have **Print / PDF** (opens print-ready window → browser "Save as PDF") and **Export HTML** (standalone self-contained file). Builders: `employees/[id]/export-profile-html.ts`, `comparison/export-html.ts`.
3. **Profile pictures in Comparison — DONE.** Avatar strip + photos in export.
4. **Landing world map — DONE.** Home shows a `react-simple-maps` world map with headcount markers per country (`src/components/world-map.tsx`).

## 9. Feedback round 2 — now implemented ✅

1. **Org Chart rebuilt** (d3-org-chart) on By Banner + By Function: expand/collapse, zoom, fit, **drag-and-drop** to reassign, and **PPTX + PNG export**. `src/components/org-chart-d3.tsx`.
2. **Positions + competency scoring** (Leadership/Experiences/Skill/Market, 1–10): `positions` master with requirements (page `/positions`), `employee_scores` per person (edit on Profile). Badges show pass/fail vs requirement.
3. **Org drag-drop fit check**: dropping employee A onto a node opens a scorecard comparing A's scores vs that node's position requirements (pass/gap per category) before confirming the move.
4. **Comparison what-if**: add a simulated "(adjusted)" column with a raised salary — compare A-before vs A-after vs others.
5. **Export employee list → CSV** (Employees page toolbar).
6. **Employee input**: Add form with master dropdowns (banner/position) + **CSV import** (validates banner/position against master, rejects unknown rows) + **download template**. Country/function derive from the selected banner/position.

### Still open for design / later phases
- Real photos: dummy data points at external pravatar URLs (not files in the bucket); real uploads do land in the bucket.
- PDF is via browser print (no server-side PDF lib). Fine for now; revisit if pixel-perfect PDF needed.
- Role-based access / RLS hardening (see §7), HR Cycle / Succession Plan (future scope per requirements). *(Business Performance is no longer future scope — shipped as Performance Management, mig 027.)*
- Bulk Excel import UI (multi-sheet) — planned, not yet built.

---

*Generated 2026-06-23 · Royal Flush ATS v1.0 beta · schema matches live Supabase project `ddxuuyyienpnufltanid`. Updated 2026-07-13 — company/country-office restructure (`banners`=company, new `banner_offices`, `employees.office_id`, `departments.office_id`) + full dataset regeneration (3 companies × 9 offices × 48 employees). Updated 2026-08-09 — `positions` scoped per company (mig 025: added `banner_id`, `UNIQUE(banner_id, title, function_id)`, existing shared rows split one clone per company). Updated 2026-08-10 — concurrent positions / "seat model" (mig 026: new `employee_positions` table, `org_edges` re-keyed onto `employee_position_id`; a person can now hold more than one position at once, each its own org-chart node).*
