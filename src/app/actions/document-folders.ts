"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";

export interface FolderItem {
    folder_id: number;
    name: string;
    parent_folder_id: number | null;
    employee_id: number | null;
    created_by: string | null;
    created_at: string;
}

function pathFor(employeeId?: number | null): string {
    return employeeId ? `/employees/${employeeId}` : "/documentation";
}

// employeeId omitted/null = the shared Document Center's folder tree.
// A given id = that employee's own tree — the two never mix.
export async function listFolders(employeeId?: number | null): Promise<FolderItem[]> {
    if (employeeId) {
        return query<FolderItem>(
            `select * from document_folders where employee_id = $1 order by name asc`,
            [employeeId]
        );
    }
    return query<FolderItem>(
        `select * from document_folders where employee_id is null order by name asc`
    );
}

export async function createFolder(
    name: string,
    parentFolderId: number | null,
    employeeId?: number | null
): Promise<{ ok: boolean; error?: string; folder?: FolderItem }> {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Name required" };
    const user = await getCurrentUser();
    let folder: FolderItem | null;
    try {
        folder = await queryOne<FolderItem>(
            `insert into document_folders (name, parent_folder_id, employee_id, created_by)
             values ($1, $2, $3, $4) returning *`,
            [trimmed, parentFolderId, employeeId ?? null, user?.display_name || user?.email || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(pathFor(employeeId));
    return { ok: true, folder: folder ?? undefined };
}

export async function renameFolder(folderId: number, name: string, employeeId?: number | null): Promise<{ ok: boolean; error?: string }> {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Name required" };
    try {
        await query(`update document_folders set name = $1 where folder_id = $2`, [trimmed, folderId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(pathFor(employeeId));
    return { ok: true };
}

// Only an empty folder can be removed — cascading the delete onto someone's
// files just for tidying a folder would be a nasty surprise, so this is a
// deliberate dead-end rather than a cascade. Move or delete contents first.
export async function deleteFolder(folderId: number, employeeId?: number | null): Promise<{ ok: boolean; error?: string }> {
    const [childFolders, docs, empDocs] = await Promise.all([
        queryOne<{ count: string }>(`select count(*) from document_folders where parent_folder_id = $1`, [folderId]),
        queryOne<{ count: string }>(`select count(*) from documents where folder_id = $1`, [folderId]),
        queryOne<{ count: string }>(`select count(*) from employee_documents where folder_id = $1`, [folderId]),
    ]);
    if (Number(childFolders?.count) > 0 || Number(docs?.count) > 0 || Number(empDocs?.count) > 0) {
        return { ok: false, error: "Folder isn't empty — move or delete its contents first" };
    }
    try {
        await query(`delete from document_folders where folder_id = $1`, [folderId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(pathFor(employeeId));
    return { ok: true };
}
