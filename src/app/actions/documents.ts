"use server";

import { localStorage as db } from "@/lib/local/storage";
import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";

const BUCKET = "documents";
const MAX_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.ms-powerpoint",
]);

export interface DocumentItem {
    document_id: number;
    filename: string;
    description: string | null;
    folder_id: number | null;
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    uploaded_by: string | null;
    created_at: string;
    updated_at: string;
    url: string;
}

function withUrl(row: any): DocumentItem {
    return { ...row, url: db.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl };
}

export async function listDocuments(): Promise<DocumentItem[]> {
    const rows = await query<any>(`select * from documents order by created_at desc`);
    return rows.map(withUrl);
}

// A shared, freestanding template library (not linked to any employee or
// position) — any signed-in user can upload/replace/delete freely.
export async function uploadDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
    const file = formData.get("file") as File | null;
    const description = (formData.get("description") as string | null)?.trim() || null;
    const folderIdRaw = formData.get("folder_id") as string | null;
    const folderId = folderIdRaw ? Number(folderIdRaw) : null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > MAX_SIZE) return { ok: false, error: "File too large (max 20MB)" };
    if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "Only PDF, PPTX, DOCX, or DOC files are accepted" };

    const user = await getCurrentUser();
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    try {
        await query(
            `insert into documents (filename, description, folder_id, storage_path, mime_type, size_bytes, uploaded_by)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [file.name, description, folderId, path, file.type, file.size, user?.display_name || user?.email || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/documentation");
    return { ok: true };
}

// Reorganizing into folders is a metadata-only move — the file itself and
// its storage object never change.
export async function moveDocument(documentId: number, folderId: number | null): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update documents set folder_id = $1, updated_at = CURRENT_TIMESTAMP where document_id = $2`, [folderId, documentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/documentation");
    return { ok: true };
}

// Replace an existing entry's file in place (same row, new storage object) —
// the "update (overwrite)" case: the entry keeps its place in the list.
export async function replaceDocument(documentId: number, formData: FormData): Promise<{ ok: boolean; error?: string }> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > MAX_SIZE) return { ok: false, error: "File too large (max 20MB)" };
    if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "Only PDF, PPTX, DOCX, or DOC files are accepted" };

    const existing = await queryOne<{ storage_path: string }>(`select storage_path from documents where document_id = $1`, [documentId]);
    if (!existing) return { ok: false, error: "Document not found" };

    const user = await getCurrentUser();
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    try {
        await query(
            `update documents set filename = $1, storage_path = $2, mime_type = $3, size_bytes = $4, uploaded_by = $5, updated_at = CURRENT_TIMESTAMP
             where document_id = $6`,
            [file.name, path, file.type, file.size, user?.display_name || user?.email || null, documentId]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    await db.storage.from(BUCKET).remove([existing.storage_path]);
    revalidatePath("/documentation");
    return { ok: true };
}

// Description is editable on its own — renaming what a file *is* shouldn't
// require replacing the file itself.
export async function updateDocumentDescription(documentId: number, description: string | null): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update documents set description = $1, updated_at = CURRENT_TIMESTAMP where document_id = $2`, [description?.trim() || null, documentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/documentation");
    return { ok: true };
}

export async function deleteDocument(documentId: number): Promise<{ ok: boolean; error?: string }> {
    const existing = await queryOne<{ storage_path: string }>(`select storage_path from documents where document_id = $1`, [documentId]);
    if (!existing) return { ok: false, error: "Document not found" };
    await db.storage.from(BUCKET).remove([existing.storage_path]);
    try {
        await query(`delete from documents where document_id = $1`, [documentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/documentation");
    return { ok: true };
}
