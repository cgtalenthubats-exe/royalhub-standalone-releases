"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

export interface Position {
    position_id: number;
    title: string;
    banner_id: number | null;
    banner_name?: string | null;
    function_id: number | null;
    function_name?: string | null;
    req_leadership: number | null;
    req_experiences: number | null;
    req_skill: number | null;
    req_market: number | null;
    headcount?: number;
    // Job description: plain text + an optional view-only PDF attachment
    // (no parsing — same pattern as the employee résumé upload). Optional on
    // the type since quick-add flows (e.g. the Add Employee wizard) create a
    // position without one.
    jd_content?: string | null;
    jd_pdf_url?: string | null;
}

export interface FunctionOption { function_id: number; name: string }
export async function listFunctions(): Promise<FunctionOption[]> {
    return query<FunctionOption>(`select function_id, name from functions order by name`);
}

// Settings > Functions admin, plus the inline "+ New" quick-add next to
// every Function picker (Add Department, Add/Edit Position) - same create
// form either way, so there's only ever one way to add a function (client
// feedback: avoid two different add-function flows that could drift apart).
export async function createFunction(name: string): Promise<{ ok: boolean; function?: FunctionOption; error?: string }> {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Function name is required" };
    try {
        const existing = await queryOne<{ function_id: number; name: string }>(`select function_id, name from functions where name like $1 collate nocase`, [trimmed]);
        if (existing) return { ok: true, function: existing };
        const created = await queryOne<{ function_id: number }>(`insert into functions (name) values ($1) returning function_id`, [trimmed]);
        if (!created) return { ok: false, error: "Could not create function" };
        revalidateFunctionViews();
        return { ok: true, function: { function_id: created.function_id, name: trimmed } };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function updateFunction(functionId: number, name: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Function name is required" };
    try {
        await query(`update functions set name = $1 where function_id = $2`, [trimmed, functionId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateFunctionViews();
    return { ok: true };
}

// Refuses rather than letting the FK constraint fail raw, same pattern as
// deleteBannerOffice - positions and departments can both reference a
// function, and either one existing means deleting it would orphan real data.
export async function deleteFunction(functionId: number): Promise<{ ok: boolean; error?: string }> {
    const [posCount, deptCount] = await Promise.all([
        queryOne<{ count: string }>(`select count(*) as count from positions where function_id = $1`, [functionId]),
        queryOne<{ count: string }>(`select count(*) as count from departments where function_id = $1`, [functionId]),
    ]);
    const pos = Number(posCount?.count ?? 0), dept = Number(deptCount?.count ?? 0);
    if (pos > 0) return { ok: false, error: `${pos} position${pos === 1 ? "" : "s"} still use this function — reassign them first.` };
    if (dept > 0) return { ok: false, error: `${dept} department${dept === 1 ? "" : "s"} still use this function — reassign them first.` };
    try {
        await query(`delete from functions where function_id = $1`, [functionId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateFunctionViews();
    return { ok: true };
}

function revalidateFunctionViews() {
    revalidatePath("/settings");
    revalidatePath("/positions");
    revalidatePath("/employees");
    revalidatePath("/org/function");
}

export async function listPositions(): Promise<Position[]> {
    const rows = await query<any>(`
        select
            p.*,
            f.name as function_name,
            b.name as banner_name,
            coalesce(hc.headcount, 0) as headcount
        from positions p
        left join functions f on f.function_id = p.function_id
        left join banners b on b.banner_id = p.banner_id
        left join (
            select position_id, count(*) as headcount
            from employee_positions
            where position_id is not null
            group by position_id
        ) hc on hc.position_id = p.position_id
        order by p.title
    `);
    return rows;
}

export async function createPosition(input: Omit<Position, "position_id" | "function_name" | "banner_name" | "headcount">): Promise<{ ok: boolean; id?: number; error?: string }> {
    let id: number | undefined;
    try {
        const row = await queryOne<{ position_id: number }>(
            `insert into positions (title, banner_id, function_id, req_leadership, req_experiences, req_skill, req_market, jd_content)
             values ($1,$2,$3,$4,$5,$6,$7,$8) returning position_id`,
            [input.title, input.banner_id, input.function_id, input.req_leadership, input.req_experiences, input.req_skill, input.req_market, input.jd_content ?? null]
        );
        id = row?.position_id;
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/positions");
    return { ok: true, id };
}

export async function updatePosition(id: number, input: Partial<Position>): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `update positions set
                title = $1, banner_id = $2, function_id = $3,
                req_leadership = $4, req_experiences = $5, req_skill = $6, req_market = $7,
                jd_content = $8, updated_at = CURRENT_TIMESTAMP
             where position_id = $9`,
            [input.title, input.banner_id, input.function_id, input.req_leadership, input.req_experiences, input.req_skill, input.req_market, input.jd_content ?? null, id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/positions");
    revalidatePath("/proposals");
    return { ok: true };
}

export async function deletePosition(id: number): Promise<{ ok: boolean; error?: string }> {
    // null out every reference first to avoid FK violation — both the
    // per-position rows (source of truth) and the employees cache columns.
    try {
        await query(`update employee_positions set position_id = null where position_id = $1`, [id]);
        await query(`update employees set position_id = null where position_id = $1`, [id]);
        await query(`delete from positions where position_id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/positions");
    return { ok: true };
}

export async function saveEmployeeScores(employeeId: number, scores: { leadership: number; experiences: number; skill: number; market: number }): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `insert into employee_scores (employee_id, leadership, experiences, skill, market, updated_at)
             values ($1,$2,$3,$4,$5, CURRENT_TIMESTAMP)
             on conflict (employee_id) do update set
                leadership = excluded.leadership,
                experiences = excluded.experiences,
                skill = excluded.skill,
                market = excluded.market,
                updated_at = excluded.updated_at`,
            [employeeId, scores.leadership, scores.experiences, scores.skill, scores.market]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}
