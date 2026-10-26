-- Royal Flush ATS — Feedback items 8/9 (JD storage by position) and 15
-- (general Document Center). Run once in Supabase Dashboard > SQL Editor
-- (project ddxuuyyienpnufltanid), after migration 016.

-- ── Item 8/9: Job Description per position ──────────────────────────────
-- Plain text (option A — no rich-text editor dependency) + an optional PDF
-- attachment. View-only: no parsing/extraction, same as the résumé pattern.
alter table positions
  add column if not exists jd_content text,
  add column if not exists jd_pdf_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('position-jds', 'position-jds', true, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- ── Item 15: Document Center ─────────────────────────────────────────────
-- A freestanding shared library (not linked to any employee/position) for
-- frequently-used template documents. Free upload / overwrite / delete.
create table if not exists documents (
  document_id  bigint generated always as identity primary key,
  filename     text not null,
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  true,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- .docx
    'application/msword',                                                        -- .doc
    'application/vnd.ms-powerpoint'                                              -- .ppt
  ]
)
on conflict (id) do nothing;

alter table documents enable row level security;
