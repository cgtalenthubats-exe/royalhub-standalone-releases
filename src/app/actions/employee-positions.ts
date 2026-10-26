"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { syncEmployeeCache } from "./employees";

// Concurrent positions — a person can hold more than one at once (see
// migration 026 / docs/SYSTEM_AUDIT.md "seat model"). Each one is created
// here as its own fully independent placement: its own title, function,
// company/office, and manager, wired into org_edges exactly like a brand-new
// hire's primary position is (employee-crud.ts's createOrgEdges) — just
// attached to an existing person instead of a freshly-created one.

// Candidates for the "Reports to" picker when adding a position — every
// position in the system, one entry per position (the same person can
// legitimately appear more than once if they themselves hold concurrent
// positions), formatted for a plain <select>.
export interface PositionCandidate { employee_position_id: number; label: string }
export async function listPositionCandidates(): Promise<PositionCandidate[]> {
    const rows = await query<any>(`
        select ep.employee_position_id, ep.position_title, e.name, b.name as banner_name
        from employee_positions ep
        join employees e on e.employee_id = ep.employee_id and e.status <> 'Vacant'
        left join banners b on b.banner_id = ep.banner_id
    `);
    return rows
        .map((p) => ({
            employee_position_id: p.employee_position_id,
            label: `${p.name} — ${p.position_title}${p.banner_name ? ` @ ${p.banner_name}` : ""}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export interface NewEmployeePositionInput {
    position_title: string;
    position_id?: number | null;
    function_id: number | null;
    banner_id: number;
    office_id: number;
    manager_employee_position_id: number | null;
}

function revalidateOrgViews(employeeId: number) {
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
}

export async function addEmployeePosition(employeeId: number, input: NewEmployeePositionInput): Promise<{ ok: boolean; id?: number; error?: string }> {
    if (!input.position_title?.trim()) return { ok: false, error: "Position title is required" };
    if (!input.banner_id || !input.office_id) return { ok: false, error: "Company / office is required" };

    let employeePositionId: number;
    try {
        const pos = await queryOne<{ employee_position_id: number }>(
            `insert into employee_positions (employee_id, position_title, position_id, function_id, banner_id, office_id, is_primary)
             values ($1,$2,$3,$4,$5,$6,false) returning employee_position_id`,
            [employeeId, input.position_title.trim(), input.position_id ?? null, input.function_id, input.banner_id, input.office_id]
        );
        if (!pos) return { ok: false, error: "Could not create position" };
        employeePositionId = pos.employee_position_id;
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    // Same banner/headcount/function-dimension-parent logic as a brand-new
    // hire's primary position: banner + headcount follow the chosen manager
    // directly, function only if the manager's own function+company match
    // (otherwise this position sits at the top of that function's tree).
    let functionParent: number | null = null;
    if (input.manager_employee_position_id) {
        const mgrPos = await queryOne<{ banner_id: number; function_id: number | null }>(
            `select banner_id, function_id from employee_positions where employee_position_id = $1`,
            [input.manager_employee_position_id]
        );
        if (mgrPos && mgrPos.function_id === input.function_id && mgrPos.banner_id === input.banner_id) {
            functionParent = input.manager_employee_position_id;
        }
    }
    try {
        await query(
            `insert into org_edges (employee_position_id, parent_employee_position_id, dimension, updated_at) values
             ($1, $2, 'banner', CURRENT_TIMESTAMP),
             ($1, $3, 'function', CURRENT_TIMESTAMP),
             ($1, $2, 'headcount', CURRENT_TIMESTAMP)`,
            [employeePositionId, input.manager_employee_position_id, functionParent]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidateOrgViews(employeeId);
    return { ok: true, id: employeePositionId };
}

export interface UpdateEmployeePositionInput {
    position_title: string;
    position_id?: number | null;
    function_id: number | null;
    banner_id: number;
    office_id: number;
}

// Edits a position's own fields — not its manager, which stays a
// drag-and-drop action on the org chart itself (same as the primary
// position's manager always has been).
export async function updateEmployeePosition(employeePositionId: number, input: UpdateEmployeePositionInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.position_title?.trim()) return { ok: false, error: "Position title is required" };
    const existing = await queryOne<{ employee_id: number; is_primary: boolean }>(
        `select employee_id, is_primary from employee_positions where employee_position_id = $1`,
        [employeePositionId]
    );
    if (!existing) return { ok: false, error: "Position not found" };

    try {
        await query(
            `update employee_positions set
                position_title = $1, position_id = $2, function_id = $3, banner_id = $4, office_id = $5, updated_at = CURRENT_TIMESTAMP
             where employee_position_id = $6`,
            [input.position_title.trim(), input.position_id ?? null, input.function_id, input.banner_id, input.office_id, employeePositionId]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    if (existing.is_primary) await syncEmployeeCache(existing.employee_id);
    revalidateOrgViews(existing.employee_id);
    return { ok: true };
}

// Blocked if this position currently has any direct reports in any
// dimension — same "reassign first" guard used everywhere else a node might
// leave people stranded (see moveEmployeeAlone's placeholder pattern; this
// is the simpler "just don't allow it" version since removing a concurrent
// position isn't a drag gesture that could reasonably create a placeholder).
export async function removeEmployeePosition(employeePositionId: number): Promise<{ ok: boolean; error?: string }> {
    const existing = await queryOne<{ employee_id: number; is_primary: boolean }>(
        `select employee_id, is_primary from employee_positions where employee_position_id = $1`,
        [employeePositionId]
    );
    if (!existing) return { ok: false, error: "Position not found" };
    if (existing.is_primary) return { ok: false, error: "Can't remove a primary position — set another position as primary first." };

    const countRow = await queryOne<{ count: string }>(
        `select count(*) from org_edges where parent_employee_position_id = $1`,
        [employeePositionId]
    );
    if (Number(countRow?.count) > 0) return { ok: false, error: "This position still has direct reports — reassign them first." };

    // Deleting the row cascades its own org_edges rows (see migration 026).
    try {
        await query(`delete from employee_positions where employee_position_id = $1`, [employeePositionId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidateOrgViews(existing.employee_id);
    return { ok: true };
}

// Flips which of this person's positions is "primary" — the one every
// display-only reader elsewhere in the app sees (employees.position_title
// etc.), and the one the profile's manager/reports/Org Snapshot reflect.
export async function setPrimaryPosition(employeeId: number, employeePositionId: number): Promise<{ ok: boolean; error?: string }> {
    const target = await queryOne<{ employee_id: number }>(`select employee_id from employee_positions where employee_position_id = $1`, [employeePositionId]);
    if (!target || target.employee_id !== employeeId) return { ok: false, error: "Position does not belong to this employee" };

    try {
        // Unset the old primary first — the partial unique index only allows one
        // is_primary=true row per employee_id at a time.
        await query(`update employee_positions set is_primary = false, updated_at = CURRENT_TIMESTAMP where employee_id = $1 and is_primary = true`, [employeeId]);
        await query(`update employee_positions set is_primary = true, updated_at = CURRENT_TIMESTAMP where employee_position_id = $1`, [employeePositionId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    await syncEmployeeCache(employeeId);
    revalidateOrgViews(employeeId);
    return { ok: true };
}
