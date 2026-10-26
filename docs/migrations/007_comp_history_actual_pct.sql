-- Royal Flush ATS — per-year STI/LTI "actual" achievement.
-- The salary-review table (Mariella template) shows two figures per bonus line:
--   • Eligible % = the target the person was entitled to (already stored as
--     sti_eligible_pct / lti_eligible_pct).
--   • Actual %   = what was actually paid, as a % of base. The euro amount
--     (sti_amount / lti_amount) is derived: actual% × base_salary.
alter table compensation_history add column if not exists sti_actual_pct numeric;
alter table compensation_history add column if not exists lti_actual_pct numeric;

-- One comp row per employee per fiscal year — lets the profile editor upsert
-- by (employee_id, fiscal_year) instead of hunting for a surrogate id.
create unique index if not exists uq_comp_hist_emp_year
  on compensation_history(employee_id, fiscal_year);
