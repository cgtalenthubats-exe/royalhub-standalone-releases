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
