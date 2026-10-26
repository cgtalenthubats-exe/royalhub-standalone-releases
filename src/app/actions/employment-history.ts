"use server";

import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

export interface EmploymentHistoryEntry {
    id: number;
    employee_id: number;
    banner: string;       // employer / company name — free text, doesn't have to be one of ours
    position: string;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
}

export async function createEmploymentHistory(employeeId: number, input: {
    banner: string; position: string; location: string | null; start_date: string | null; end_date: string | null; is_current: boolean;
}): Promise<{ ok: boolean; error?: string }> {
    if (!input.banner?.trim()) return { ok: false, error: "Company / employer is required" };
    if (!input.position?.trim()) return { ok: false, error: "Position is required" };
    try {
        await query(
            `insert into employment_history (employee_id, banner, position, location, start_date, end_date, is_current)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
                employeeId,
                input.banner.trim(),
                input.position.trim(),
                input.location || null,
                input.start_date || null,
                input.is_current ? null : (input.end_date || null),
                input.is_current,
            ]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateEmploymentHistory(id: number, employeeId: number, input: Partial<{
    banner: string; position: string; location: string | null; start_date: string | null; end_date: string | null; is_current: boolean;
}>): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `update employment_history
             set banner = $1, position = $2, location = $3, start_date = $4, end_date = $5, is_current = $6
             where id = $7`,
            [
                input.banner?.trim(),
                input.position?.trim(),
                input.location || null,
                input.start_date || null,
                input.is_current ? null : (input.end_date || null),
                input.is_current,
                id,
            ]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteEmploymentHistory(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employment_history where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}
