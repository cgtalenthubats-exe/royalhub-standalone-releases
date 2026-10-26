-- 021: file descriptions, per-employee document library, banner logo storage.
-- Run after 020.

-- ── Descriptions on the shared Document Center ───────────────────────────
-- The list showed filename/size/uploader/date but nothing about what a file
-- actually is — a filename alone doesn't say much for a template library.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS description TEXT;

-- ── Per-employee documents ───────────────────────────────────────────────
-- Same idea as the Document Center, but scoped to one person and shown on
-- their profile: contracts, review letters, certificates and so on. Kept
-- separate from `documents` rather than adding a nullable employee_id to it,
-- because the two have different access stories (a shared team library vs
-- files about one individual) and are listed from different places.
--
-- Deliberately NOT reusing `employees.resume_url` (migration 015): that is a
-- single dedicated slot for the CV, this is an open-ended list.
CREATE TABLE IF NOT EXISTS employee_documents (
    employee_document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id  BIGINT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    description  TEXT,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type    TEXT,
    size_bytes   BIGINT,
    uploaded_by  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id);

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
-- No policy on purpose: every read/write goes through the server-side
-- service-role client (which bypasses RLS), so the anon key can't touch it.
-- Same pattern as `documents` and every other table here.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-documents',
    'employee-documents',
    true,
    20971520,
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   -- .docx
        'application/msword',                                                        -- .doc
        'application/vnd.ms-powerpoint',                                             -- .ppt
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- .xlsx
        'application/vnd.ms-excel',                                                  -- .xls
        'image/png',
        'image/jpeg'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- ── Banner logos ─────────────────────────────────────────────────────────
-- banners.logo_url was added in 020; this is where the files themselves live.
-- Images only, small limit — these render at ~20px in an org-chart node.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'banner-logos',
    'banner-logos',
    true,
    2097152,
    ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
