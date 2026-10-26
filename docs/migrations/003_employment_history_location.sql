-- Royal Flush ATS — Career/Employment History: add location field
-- (company/employer name in `employment_history.banner` is already free text,
-- so external employers work today without any FK change — this migration
-- only adds a place to record where that role was based.)

alter table employment_history add column if not exists location text;
