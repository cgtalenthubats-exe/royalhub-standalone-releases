-- 022: folders for the Document Center and per-employee document libraries.
-- Run after 021.

-- One folder tree table shared by both document surfaces. employee_id NULL
-- means the folder belongs to the shared Document Center (/documentation);
-- a non-null employee_id scopes it to that person's own library. The two
-- trees never mix — a shared folder can't hold employee documents and
-- vice versa, matching how `documents` and `employee_documents` already
-- have separate buckets and separate access stories.
CREATE TABLE IF NOT EXISTS document_folders (
    folder_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name              TEXT NOT NULL,
    parent_folder_id  BIGINT REFERENCES document_folders(folder_id) ON DELETE CASCADE,
    employee_id       BIGINT REFERENCES employees(employee_id) ON DELETE CASCADE,
    created_by        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_employee ON document_folders(employee_id);

ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
-- No policy on purpose, same pattern as `documents` / `employee_documents`:
-- every read/write goes through the server-side service-role client.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES document_folders(folder_id) ON DELETE SET NULL;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS folder_id BIGINT REFERENCES document_folders(folder_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_folder ON employee_documents(folder_id);
