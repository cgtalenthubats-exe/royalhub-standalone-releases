-- Royal Flush ATS — track who last saved a proposal's comparison board
-- (peers + what-ifs + order), now that saving it is an explicit action
-- instead of an auto-persisted one.
-- Run once in Supabase Dashboard > SQL Editor (project ddxuuyyienpnufltanid).

alter table salary_proposals
  add column if not exists board_updated_by text,
  add column if not exists board_updated_at timestamptz;
