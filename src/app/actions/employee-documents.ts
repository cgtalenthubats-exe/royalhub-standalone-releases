"use server";

import { localStorage as db } from "@/lib/local/storage";
import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";

const BUCKET = "employee-documents";
const MAX_SIZE = 20 * 1024 * 1024;
// Wider than the shared Document Center's list: files kept against one person
// are as often a scanned certificate or a spreadsheet as they are a deck.
const ALLOWED_TYPES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/png",
    "image/jpeg",
]);

export interface EmployeeDocumentItem {
    employee_document_id: number;
    employee_id: number;
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

function withUrl(row: any): EmployeeDocumentItem {
    return { ...row, url: db.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl };
}

export async function listEmployeeDocuments(employeeId: number): Promise<EmployeeDocumentItem[]> {
    const rows = await query<any>(`select * from employee_documents where employee_id = $1 order by created_at desc`, [employeeId]);
    return rows.map(withUrl);
}

export async function uploadEmployeeDocument(employeeId: number, formData: FormData): Promise<{ ok: boolean; error?: string }> {
    const file = formData.get("file") as File | null;
    const description = (formData.get("description") as string | null)?.trim() || null;
    const folderIdRaw = formData.get("folder_id") as string | null;
    const folderId = folderIdRaw ? Number(folderIdRaw) : null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > MAX_SIZE) return { ok: false, error: "File too large (max 20MB)" };
    if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "Unsupported file type — PDF, Office documents, PNG or JPG only" };

    const user = await getCurrentUser();
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = `emp-${employeeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    try {
        await query(
            `insert into employee_documents (employee_id, filename, description, folder_id, storage_path, mime_type, size_bytes, uploaded_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [employeeId, file.name, description, folderId, path, file.type, file.size, user?.display_name || user?.email || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// Reorganizing into folders is a metadata-only move — the file itself and
// its storage object never change.
export async function moveEmployeeDocument(employeeDocumentId: number, folderId: number | null): Promise<{ ok: boolean; error?: string }> {
    const existing = await queryOne<{ employee_id: number }>(`select employee_id from employee_documents where employee_document_id = $1`, [employeeDocumentId]);
    if (!existing) return { ok: false, error: "Document not found" };

    try {
        await query(`update employee_documents set folder_id = $1, updated_at = CURRENT_TIMESTAMP where employee_document_id = $2`, [folderId, employeeDocumentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${existing.employee_id}`);
    return { ok: true };
}

// Description is editable on its own — renaming what a file *is* shouldn't
// require re-uploading it.
export async function updateEmployeeDocumentDescription(employeeDocumentId: number, description: string | null): Promise<{ ok: boolean; error?: string }> {
    const existing = await queryOne<{ employee_id: number }>(`select employee_id from employee_documents where employee_document_id = $1`, [employeeDocumentId]);
    if (!existing) return { ok: false, error: "Document not found" };

    try {
        await query(`update employee_documents set description = $1, updated_at = CURRENT_TIMESTAMP where employee_document_id = $2`, [description?.trim() || null, employeeDocumentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${existing.employee_id}`);
    return { ok: true };
}

export async function deleteEmployeeDocument(employeeDocumentId: number): Promise<{ ok: boolean; error?: string }> {
    const existing = await queryOne<{ storage_path: string; employee_id: number }>(
        `select storage_path, employee_id from employee_documents where employee_document_id = $1`,
        [employeeDocumentId]
    );
    if (!existing) return { ok: false, error: "Document not found" };

    await db.storage.from(BUCKET).remove([existing.storage_path]);
    try {
        await query(`delete from employee_documents where employee_document_id = $1`, [employeeDocumentId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${existing.employee_id}`);
    return { ok: true };
}
