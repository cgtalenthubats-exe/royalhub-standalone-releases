"use server";

import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

export interface Department {
    department_id: number;
    name: string;
    owner_employee_id: number | null;
    owner_name?: string | null;
    office_id: number;
    banner_id?: number | null;
    banner_name?: string | null;
    country?: string | null;
    function_id: number | null;
    function_name?: string | null;
    headcount: number;
}

export async function listDepartments(): Promise<Department[]> {
    const rows = await query<any>(`
        select
            d.department_id, d.name, d.owner_employee_id, d.office_id, d.function_id, d.headcount,
            e.name as owner_name,
            bo.banner_id, bo.country,
            b.name as banner_name,
            f.name as function_name
        from departments d
        left join employees e on e.employee_id = d.owner_employee_id
        left join banner_offices bo on bo.office_id = d.office_id
        left join banners b on b.banner_id = bo.banner_id
        left join functions f on f.function_id = d.function_id
        order by d.name
    `);
    return rows.map((d) => ({
        ...d,
        owner_name: d.owner_employee_id ? d.owner_name ?? null : null,
        banner_id: d.banner_id ?? null,
        banner_name: d.banner_name ?? null,
        country: d.country ?? null,
        function_name: d.function_id ? d.function_name ?? null : null,
    }));
}

export async function createDepartment(input: Omit<Department, "department_id" | "owner_name" | "banner_id" | "banner_name" | "country" | "function_name">): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `insert into departments (name, owner_employee_id, office_id, function_id, headcount)
             values ($1, $2, $3, $4, $5)`,
            [input.name, input.owner_employee_id, input.office_id, input.function_id, input.headcount]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/departments");
    revalidatePath("/org/headcount");
    return { ok: true };
}

export async function updateDepartment(id: number, input: Partial<Department>): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `update departments
             set name = $1, owner_employee_id = $2, office_id = $3, function_id = $4, headcount = $5, updated_at = CURRENT_TIMESTAMP
             where department_id = $6`,
            [input.name, input.owner_employee_id, input.office_id, input.function_id, input.headcount, id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/departments");
    revalidatePath("/org/headcount");
    return { ok: true };
}

export async function deleteDepartment(id: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from departments where department_id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/departments");
    revalidatePath("/org/headcount");
    return { ok: true };
}
