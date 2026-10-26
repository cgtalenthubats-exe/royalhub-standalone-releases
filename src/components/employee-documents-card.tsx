"use client";

import { useRouter } from "next/navigation";
import type { EmployeeDocumentItem } from "@/app/actions/employee-documents";
import { uploadEmployeeDocument, updateEmployeeDocumentDescription, deleteEmployeeDocument, moveEmployeeDocument } from "@/app/actions/employee-documents";
import type { FolderItem } from "@/app/actions/document-folders";
import { createFolder, renameFolder, deleteFolder } from "@/app/actions/document-folders";
import { FileBrowser } from "@/components/file-browser";
import { Card } from "@/components/ui/card";

const ACCEPT = ".pdf,.pptx,.docx,.doc,.ppt,.xlsx,.xls,.png,.jpg,.jpeg";

// Per-employee file library, shown on the profile. Separate from the shared
// Document Center (/documentation) — these are files about this one person.
export function EmployeeDocumentsCard({ employeeId, documents, folders }: { employeeId: number; documents: EmployeeDocumentItem[]; folders: FolderItem[] }) {
    const router = useRouter();

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">Documents</div>
            <div className="p-3">
                <FileBrowser
                    accept={ACCEPT}
                    maxSizeLabel="20 MB"
                    emptyStateText="No documents yet — contracts, letters, certificates and similar files can live here, organized into folders if it helps."
                    folders={folders}
                    files={documents.map((d) => ({
                        id: d.employee_document_id,
                        filename: d.filename,
                        description: d.description,
                        folder_id: d.folder_id,
                        mime_type: d.mime_type,
                        size_bytes: d.size_bytes,
                        uploaded_by: d.uploaded_by,
                        created_at: d.created_at,
                        url: d.url,
                    }))}
                    onUpload={async (file, description, folderId) => {
                        const fd = new FormData();
                        fd.append("file", file);
                        fd.append("description", description);
                        if (folderId != null) fd.append("folder_id", String(folderId));
                        return uploadEmployeeDocument(employeeId, fd);
                    }}
                    onUpdateDescription={(id, description) => updateEmployeeDocumentDescription(id, description)}
                    onDelete={(id) => deleteEmployeeDocument(id)}
                    onMove={(id, folderId) => moveEmployeeDocument(id, folderId)}
                    onCreateFolder={(name, parentFolderId) => createFolder(name, parentFolderId, employeeId)}
                    onRenameFolder={(folderId, name) => renameFolder(folderId, name, employeeId)}
                    onDeleteFolder={(folderId) => deleteFolder(folderId, employeeId)}
                    onRefresh={() => router.refresh()}
                />
            </div>
        </Card>
    );
}
