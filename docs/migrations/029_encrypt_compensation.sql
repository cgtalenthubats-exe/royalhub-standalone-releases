-- Column-level encryption for the compensation domain (client infra/security
-- item 1 — see docs/FEEDBACK_TRACKER.md). Application-layer AES-256-GCM: the
-- decryption key lives only in the app's environment, never in Postgres, so
-- someone with direct database access (admin, leaked credential, backup)
-- sees ciphertext only.
--
-- Encrypted values are opaque base64 tokens, so every affected column
-- changes from numeric/jsonb to text. This migration ONLY changes column
-- types — it does NOT encrypt the data already in these columns (that needs
-- the encryption key, which SQL alone doesn't have). Run
-- scripts/encrypt_existing_compensation.mjs immediately after this migration
-- to re-encrypt whatever's already there; until that script runs, these
-- columns hold PLAINTEXT numbers stored as text, not ciphertext, and the app
-- will fail to read them (it expects every value here to decrypt).
--
-- 12 column-groups across 4 tables, exactly matching the scope finalized in
-- the audit PDF handed to the client.

-- employee_compensation (5 groups / 7 columns)
alter table employee_compensation
  alter column base_salary type text using base_salary::text,
  alter column sti_target type text using sti_target::text,
  alter column sti_max type text using sti_max::text,
  alter column lti_target type text using lti_target::text,
  alter column lti_max type text using lti_max::text,
  alter column other_bonus type text using other_bonus::text,
  alter column total_compensation type text using total_compensation::text;

-- compensation_history (3 groups / 8 columns)
alter table compensation_history
  alter column base_salary type text using base_salary::text,
  alter column total_comp type text using total_comp::text,
  alter column sti_eligible_pct type text using sti_eligible_pct::text,
  alter column sti_actual_pct type text using sti_actual_pct::text,
  alter column sti_amount type text using sti_amount::text,
  alter column lti_eligible_pct type text using lti_eligible_pct::text,
  alter column lti_actual_pct type text using lti_actual_pct::text,
  alter column lti_amount type text using lti_amount::text;

-- salary_proposal_compensation (3 groups / 6 columns)
alter table salary_proposal_compensation
  alter column base_salary type text using base_salary::text,
  alter column cash_allowance type text using cash_allowance::text,
  alter column sti_eligible_pct type text using sti_eligible_pct::text,
  alter column sti_amount type text using sti_amount::text,
  alter column lti_eligible_pct type text using lti_eligible_pct::text,
  alter column lti_amount type text using lti_amount::text;

-- salary_proposal_whatifs (1 group / 1 column — a whole Compensation snapshot as one blob)
alter table salary_proposal_whatifs
  alter column compensation type text using compensation::text;
