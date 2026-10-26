"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

export type Readiness = "ready_now" | "ready_1_3" | "ready_3_5";

export interface SuccessionCandidate {
    candidate_id: number;
    seat_id: number;
    candidate_name: string;
    candidate_employee_id: number | null;
    readiness: Readiness;
    rank: number;
}

export interface SuccessionSeatNode {
    id: string;
    parentId: string | null;
    seat_id: number;
    banner_id: number;
    office_id: number | null;
    position_id: number | null;
    employee_id: number | null;
    label: string | null;
    position_title: string | null;
    employee_name: string | null;
    employee_photo: string | null;
    age: number | null;
    job_grade: string | null;
    country: string | null;
    candidates: SuccessionCandidate[];
}

function yearsSince(dob: string): number {
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age;
}

// Builds `col1 = $n, col2 = $n+1, ...` plus the matching param array from a
// partial patch object — same dynamic-update need as app-users.ts.
function buildSet(patch: Record<string, unknown>, startAt: number): { clause: string; params: unknown[] } {
    const keys = Object.keys(patch);
    const clause = keys.map((k, i) => `${k} = $${startAt + i}`).join(", ");
    return { clause, params: keys.map((k) => patch[k]) };
}

export async function getSuccessionTree(bannerId: number): Promise<{ nodes: SuccessionSeatNode[]; rootId: string | null }> {
    const [seats, candidates, employees, positions, offices] = await Promise.all([
        query<any>(`select * from succession_seats where banner_id = $1 order by sort_order`, [bannerId]),
        query<any>(`select * from succession_candidates order by rank`),
        query<any>(`select employee_id, name, photo, job_grade, date_of_birth from employees`),
        query<any>(`select position_id, title from positions`),
        query<any>(`select office_id, country from banner_offices`),
    ]);
    const empMap = new Map<number, any>(employees.map((e) => [e.employee_id, e]));
    const posMap = new Map<number, any>(positions.map((p) => [p.position_id, p]));
    const officeMap = new Map<number, any>(offices.map((o) => [o.office_id, o]));

    const candBySeat = new Map<number, SuccessionCandidate[]>();
    candidates.forEach((c: any) => {
        const arr = candBySeat.get(c.seat_id) || [];
        arr.push(c);
        candBySeat.set(c.seat_id, arr);
    });

    const nodes: SuccessionSeatNode[] = seats.map((s: any) => {
        const emp = s.employee_id ? empMap.get(s.employee_id) : null;
        const pos = s.position_id ? posMap.get(s.position_id) : null;
        return {
            id: String(s.seat_id),
            parentId: s.parent_seat_id ? String(s.parent_seat_id) : null,
            seat_id: s.seat_id,
            banner_id: s.banner_id,
            office_id: s.office_id,
            position_id: s.position_id,
            employee_id: s.employee_id,
            label: s.label,
            position_title: pos?.title ?? s.label ?? null,
            employee_name: emp?.name ?? null,
            employee_photo: emp?.photo ?? null,
            age: emp?.date_of_birth ? yearsSince(emp.date_of_birth) : null,
            job_grade: emp?.job_grade ?? null,
            country: s.office_id ? (officeMap.get(s.office_id)?.country ?? null) : null,
            candidates: candBySeat.get(s.seat_id) || [],
        };
    });
    const root = nodes.find((n) => !n.parentId);
    return { nodes, rootId: root ? root.id : null };
}

export async function createSeat(input: {
    parent_seat_id: number | null; banner_id: number; office_id: number | null;
    position_id: number | null; employee_id: number | null; label: string | null;
}): Promise<{ ok: boolean; error?: string; seat_id?: number }> {
    try {
        const row = await queryOne<{ seat_id: number }>(
            `insert into succession_seats (parent_seat_id, banner_id, office_id, position_id, employee_id, label)
             values ($1,$2,$3,$4,$5,$6) returning seat_id`,
            [input.parent_seat_id, input.banner_id, input.office_id, input.position_id, input.employee_id, input.label]
        );
        revalidatePath("/org/succession");
        return { ok: true, seat_id: row?.seat_id };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function updateSeat(seatId: number, input: Partial<{
    office_id: number | null; position_id: number | null; employee_id: number | null; label: string | null;
}>): Promise<{ ok: boolean; error?: string }> {
    if (Object.keys(input).length === 0) return { ok: true };
    const { clause, params } = buildSet(input, 1);
    try {
        await query(`update succession_seats set ${clause} where seat_id = $${params.length + 1}`, [...params, seatId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/succession");
    return { ok: true };
}

export async function deleteSeat(seatId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from succession_seats where seat_id = $1`, [seatId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/succession");
    return { ok: true };
}

export async function createCandidate(seatId: number, input: {
    candidate_name: string; candidate_employee_id: number | null; readiness: Readiness; rank: number;
}): Promise<{ ok: boolean; error?: string }> {
    if (!input.candidate_name?.trim()) return { ok: false, error: "Candidate name is required" };
    try {
        await query(
            `insert into succession_candidates (seat_id, candidate_name, candidate_employee_id, readiness, rank)
             values ($1,$2,$3,$4,$5)`,
            [seatId, input.candidate_name.trim(), input.candidate_employee_id, input.readiness, input.rank]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/succession");
    return { ok: true };
}

export async function updateCandidate(candidateId: number, input: Partial<{
    candidate_name: string; candidate_employee_id: number | null; readiness: Readiness; rank: number;
}>): Promise<{ ok: boolean; error?: string }> {
    if (Object.keys(input).length === 0) return { ok: true };
    const { clause, params } = buildSet(input, 1);
    try {
        await query(`update succession_candidates set ${clause} where candidate_id = $${params.length + 1}`, [...params, candidateId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/succession");
    return { ok: true };
}

export async function deleteCandidate(candidateId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from succession_candidates where candidate_id = $1`, [candidateId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/succession");
    return { ok: true };
}
