"use client";

import { useRouter } from "next/navigation";
import type { DocumentItem } from "@/app/actions/documents";
import { uploadDocument, replaceDocument, deleteDocument, updateDocumentDescription, moveDocument } from "@/app/actions/documents";
import type { FolderItem } from "@/app/actions/document-folders";
import { createFolder, renameFolder, deleteFolder } from "@/app/actions/document-folders";
import { FileBrowser } from "@/components/file-browser";

const NAVY = "#0b1f3a";
const ACCEPT = ".pdf,.pptx,.docx,.doc,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.ms-powerpoint";

export function DocumentationClient({ documents, folders }: { documents: DocumentItem[]; folders: FolderItem[] }) {
    const router = useRouter();

    return (
        <>
            <div className="mb-4 shrink-0">
                <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight" style={{ color: NAVY }}>Documentation</h1>
                <p className="text-[13.5px] text-slate-500 mt-0.5">Shared templates and frequently-used documents · PDF, PPTX, DOCX, DOC</p>
            </div>

            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
                <FileBrowser
                    accept={ACCEPT}
                    maxSizeLabel="20 MB"
                    emptyStateText="No documents yet — upload templates and reference documents your team uses often, and organize them into folders if it helps."
                    folders={folders}
                    files={documents.map((d) => ({
                        id: d.document_id,
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
                        return uploadDocument(fd);
                    }}
                    onReplace={async (id, file) => {
                        const fd = new FormData();
                        fd.append("file", file);
                        return replaceDocument(id, fd);
                    }}
                    onUpdateDescription={(id, description) => updateDocumentDescription(id, description)}
                    onDelete={(id) => deleteDocument(id)}
                    onMove={(id, folderId) => moveDocument(id, folderId)}
                    onCreateFolder={(name, parentFolderId) => createFolder(name, parentFolderId, null)}
                    onRenameFolder={(folderId, name) => renameFolder(folderId, name, null)}
                    onDeleteFolder={(folderId) => deleteFolder(folderId, null)}
                    onRefresh={() => router.refresh()}
                />
            </div>
        </>
    );
}
