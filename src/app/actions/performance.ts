"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireCompEditor } from "@/lib/permissions";
import { progressPct, rollup, perfStatus, type PerfStatus } from "@/lib/performance";

// ══ Performance GRADES ════════════════════════════════════════════════════
// The pre-existing half of this file: the A/A-/B+/B/B- outcome recorded once
// per fiscal year, edited from the profile's PerformanceCard. Gated behind
// requireCompEditor because a grade drives pay decisions. The targets half
// below is deliberately NOT gated the same way — see its note.

export type PerformanceGradeInput = {
    fiscal_year: number;
    grade: string | null;
    label: string | null;
};

// One row per (employee, fiscal year) — performance_grades carries a unique
// constraint on that pair, so this both creates a new year and edits an
// existing one depending on whether it already exists.
export async function upsertPerformanceGrade(employeeId: number, input: PerformanceGradeInput): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    try {
        await query(
            `insert into performance_grades (employee_id, fiscal_year, grade, label)
             values ($1,$2,$3,$4)
             on conflict (employee_id, fiscal_year) do update set
                grade = excluded.grade,
                label = excluded.label`,
            [employeeId, input.fiscal_year, input.grade, input.label]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deletePerformanceGrade(employeeId: number, fiscalYear: number): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    try {
        await query(`delete from performance_grades where employee_id = $1 and fiscal_year = $2`, [employeeId, fiscalYear]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ══ Performance TARGETS ═══════════════════════════════════════════════════
// Performance Management, phase 1 (migration 027). Three levels:
//   performance_cycles → the review year
//     banner_goals     → what a company is trying to achieve that year
//       employee_targets → what each SEAT is doing about it
//
// Targets key on employee_position_id (a seat), not employee_id — see
// migration 026's seat model. A person holding a concurrent position at
// another company therefore keeps two genuinely separate sets of targets, and
// the per-company view never mixes them.
//
// Access: target writes are intentionally NOT behind requireCompEditor the way
// the grades above are. A grade feeds pay; a target is the operational record
// of what someone was asked to do, and the whole point of the module is that
// HR broadly can record and update them. They follow employee-positions.ts's
// model instead (no extra gate) — day-to-day HR records rather than master
// data like banner offices, which is what requireSuper guards in org.ts.

function revalidate(employeeId?: number) {
    revalidatePath("/performance");
    if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

function buildValuesRows(rows: unknown[][], startAt = 1): { placeholders: string; params: unknown[] } {
    const params: unknown[] = [];
    let idx = startAt;
    const placeholders = rows.map((row) => {
        const ph = row.map(() => `$${idx++}`).join(", ");
        params.push(...row);
        return `(${ph})`;
    }).join(", ");
    return { placeholders, params };
}

// ── Cycles ────────────────────────────────────────────────────────────────

export interface PerfCycle {
    cycle_id: number;
    name: string;
    fiscal_year: number;
    start_date: string | null;
    end_date: string | null;
    status: string;
}

export async function listCycles(): Promise<PerfCycle[]> {
    return query<PerfCycle>(
        `select cycle_id, name, fiscal_year, start_date, end_date, status from performance_cycles order by fiscal_year desc`
    );
}

// `copyFromCycleId` starts the new year off with last year's structure rather
// than a blank page — the objectives and everyone's targets carry over, but
// every achievement figure is cleared, because what's being reused is the plan,
// not the result.
export async function createCycle(
    input: { name: string; fiscal_year: number; start_date?: string | null; end_date?: string | null },
    copyFromCycleId?: number | null,
): Promise<{ ok: boolean; id?: number; copiedGoals?: number; copiedTargets?: number; error?: string }> {
    let cycleId: number;
    try {
        const row = await queryOne<{ cycle_id: number }>(
            `insert into performance_cycles (name, fiscal_year, start_date, end_date) values ($1,$2,$3,$4) returning cycle_id`,
            [input.name, input.fiscal_year, input.start_date ?? null, input.end_date ?? null]
        );
        if (!row) return { ok: false, error: "Could not create cycle" };
        cycleId = row.cycle_id;
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    let copiedGoals = 0, copiedTargets = 0;
    if (copyFromCycleId) {
        try {
            const copied = await copyCycleContents(copyFromCycleId, cycleId);
            copiedGoals = copied.goals;
            copiedTargets = copied.targets;
        } catch (e: any) {
            // The cycle itself exists and is usable — say what didn't carry over
            // rather than pretending the whole thing failed.
            revalidate();
            return { ok: true, id: cycleId, copiedGoals: 0, copiedTargets: 0, error: `Cycle created, but copying failed: ${e.message}` };
        }
    }
    revalidate();
    return { ok: true, id: cycleId, copiedGoals, copiedTargets };
}

async function copyCycleContents(fromCycleId: number, toCycleId: number): Promise<{ goals: number; targets: number }> {
    const goals = await query<any>(
        `select goal_id, banner_id, title, description, category, metric_unit, target_value, weight, sort_order
         from banner_goals where cycle_id = $1 order by goal_id`,
        [fromCycleId]
    );

    // old goal_id → new goal_id, so each copied target still points at the
    // copy of the objective it served rather than last year's row.
    const goalIdMap = new Map<number, number>();
    if (goals.length) {
        const rows = goals.map((g) => [
            toCycleId, g.banner_id, g.title, g.description, g.category, g.metric_unit,
            g.target_value, null, null, g.weight, g.sort_order,
        ]);
        const { placeholders, params } = buildValuesRows(rows);
        // Bulk insert returns rows in input order — the same assumption
        // commitEmployeesCsv already relies on for its position mapping.
        const inserted = await query<{ goal_id: number }>(
            `insert into banner_goals (cycle_id, banner_id, title, description, category, metric_unit, target_value, actual_value, progress_pct, weight, sort_order)
             values ${placeholders} returning goal_id`,
            params
        );
        inserted.forEach((row, i) => goalIdMap.set(goals[i].goal_id, row.goal_id));
    }

    const targets = await query<any>(
        `select employee_position_id, employee_id, banner_goal_id, title, description, category, metric_unit, target_value, weight, sort_order
         from employee_targets where cycle_id = $1`,
        [fromCycleId]
    );

    let copiedTargets = 0;
    if (targets.length) {
        // A seat can have been removed since last year (someone left, a role was
        // retired) — its FK would reject the copy, so drop those rows instead.
        const posIds = Array.from(new Set(targets.map((t) => t.employee_position_id)));
        const livePositions = await query<{ employee_position_id: number; banner_id: number }>(
            `select employee_position_id, banner_id from employee_positions where employee_position_id = any($1)`,
            [posIds]
        );
        const live = new Map<number, number>(livePositions.map((p) => [p.employee_position_id, p.banner_id]));

        const rows = targets
            .filter((t) => live.has(t.employee_position_id))
            .map((t) => [
                toCycleId, t.employee_position_id, t.employee_id,
                // Taken from where the seat sits NOW, not from last year's row:
                // if the person transferred between cycles, the new year's
                // targets belong to the company they're in now.
                live.get(t.employee_position_id)!,
                t.banner_goal_id != null ? (goalIdMap.get(t.banner_goal_id) ?? null) : null,
                t.title, t.description, t.category, t.metric_unit, t.target_value,
                null, null, t.weight, "active", t.sort_order,
            ]);
        if (rows.length) {
            const { placeholders, params } = buildValuesRows(rows);
            await query(
                `insert into employee_targets
                    (cycle_id, employee_position_id, employee_id, banner_id, banner_goal_id, title, description, category,
                     metric_unit, target_value, actual_value, progress_pct, weight, status, sort_order)
                 values ${placeholders}`,
                params
            );
            copiedTargets = rows.length;
        }
    }

    return { goals: goals.length, targets: copiedTargets };
}

export async function setCycleStatus(cycleId: number, status: "draft" | "active" | "closed"): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update performance_cycles set status = $1 where cycle_id = $2`, [status, cycleId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidate();
    return { ok: true };
}

// ── Banner goals ──────────────────────────────────────────────────────────

export interface BannerGoal {
    goal_id: number;
    cycle_id: number;
    banner_id: number;
    banner_name: string | null;
    title: string;
    description: string | null;
    category: string | null;
    metric_unit: string | null;
    target_value: number | null;
    actual_value: number | null;
    progress_pct: number | null;
    weight: number | null;
    sort_order: number;
    // How many individual seat targets have been aligned to this goal — makes
    // it visible when a company goal has been set but nobody has picked it up.
    aligned_count: number;
    // Weighted rollup of those aligned targets. A company goal is usually the
    // sum of what people are individually doing about it, so achievement can
    // be derived rather than re-typed — but an explicitly entered
    // actual_value/progress_pct still wins (some goals, e.g. total revenue,
    // aren't the sum of anybody's individual targets). See goalProgress() in
    // src/lib/performance.ts for that precedence.
    aligned_rollup: number | null;
}

export async function listBannerGoals(cycleId: number, bannerId?: number): Promise<BannerGoal[]> {
    const [goals, banners] = await Promise.all([
        bannerId
            ? query<any>(
                `select goal_id, cycle_id, banner_id, title, description, category, metric_unit, target_value, actual_value, progress_pct, weight, sort_order
                 from banner_goals where cycle_id = $1 and banner_id = $2 order by sort_order, goal_id`,
                [cycleId, bannerId]
            )
            : query<any>(
                `select goal_id, cycle_id, banner_id, title, description, category, metric_unit, target_value, actual_value, progress_pct, weight, sort_order
                 from banner_goals where cycle_id = $1 order by sort_order, goal_id`,
                [cycleId]
            ),
        query<any>(`select banner_id, name from banners`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));

    // One batched pass for the alignment counts + rollups rather than a query
    // per goal.
    const goalIds = goals.map((g) => g.goal_id);
    const aligned = goalIds.length
        ? await query<any>(`select banner_goal_id, target_value, actual_value, progress_pct, weight from employee_targets where banner_goal_id = any($1)`, [goalIds])
        : [];
    const alignedByGoal = new Map<number, any[]>();
    aligned.forEach((t) => {
        if (t.banner_goal_id == null) return;
        const arr = alignedByGoal.get(t.banner_goal_id) || [];
        arr.push(t);
        alignedByGoal.set(t.banner_goal_id, arr);
    });

    return goals.map((g) => {
        const rows = alignedByGoal.get(g.goal_id) || [];
        return {
            ...g,
            banner_name: bannerMap.get(g.banner_id) ?? null,
            aligned_count: rows.length,
            aligned_rollup: rows.length ? rollup(rows) : null,
        };
    });
}

export interface BannerGoalInput {
    title: string;
    description?: string | null;
    category?: string | null;
    metric_unit?: string | null;
    target_value?: number | null;
    actual_value?: number | null;
    progress_pct?: number | null;
    weight?: number | null;
}

export async function createBannerGoal(cycleId: number, bannerId: number, input: BannerGoalInput): Promise<{ ok: boolean; id?: number; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    const n = normaliseGoal(input);
    try {
        const row = await queryOne<{ goal_id: number }>(
            `insert into banner_goals (cycle_id, banner_id, title, description, category, metric_unit, target_value, actual_value, progress_pct, weight)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning goal_id`,
            [cycleId, bannerId, n.title, n.description, n.category, n.metric_unit, n.target_value, n.actual_value, n.progress_pct, n.weight]
        );
        revalidate();
        return { ok: true, id: row?.goal_id };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function updateBannerGoal(goalId: number, input: BannerGoalInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    const n = normaliseGoal(input);
    try {
        await query(
            `update banner_goals set title=$1, description=$2, category=$3, metric_unit=$4, target_value=$5, actual_value=$6, progress_pct=$7, weight=$8, updated_at=CURRENT_TIMESTAMP
             where goal_id = $9`,
            [n.title, n.description, n.category, n.metric_unit, n.target_value, n.actual_value, n.progress_pct, n.weight, goalId]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidate();
    return { ok: true };
}

export async function deleteBannerGoal(goalId: number): Promise<{ ok: boolean; error?: string }> {
    // Individual targets survive — the FK is ON DELETE SET NULL, so they just
    // become unaligned rather than being destroyed along with the company goal.
    try {
        await query(`delete from banner_goals where goal_id = $1`, [goalId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidate();
    return { ok: true };
}

function normaliseGoal(i: BannerGoalInput) {
    return {
        title: i.title.trim(),
        description: i.description?.trim() || null,
        category: i.category?.trim() || null,
        metric_unit: i.metric_unit?.trim() || null,
        target_value: i.target_value ?? null,
        actual_value: i.actual_value ?? null,
        progress_pct: i.progress_pct ?? null,
        weight: i.weight ?? null,
    };
}

// ── Employee targets ──────────────────────────────────────────────────────

export interface EmployeeTarget {
    target_id: number;
    cycle_id: number;
    employee_position_id: number;
    employee_id: number;
    banner_goal_id: number | null;
    title: string;
    description: string | null;
    category: string | null;
    metric_unit: string | null;
    target_value: number | null;
    actual_value: number | null;
    progress_pct: number | null;
    weight: number | null;
    status: string;
    due_date: string | null;
    sort_order: number;
}

const TARGET_COLUMNS =
    "target_id,cycle_id,employee_position_id,employee_id,banner_goal_id,title,description,category,metric_unit,target_value,actual_value,progress_pct,weight,status,due_date,sort_order";

export async function listTargetsForPosition(cycleId: number, employeePositionId: number): Promise<EmployeeTarget[]> {
    return query<EmployeeTarget>(
        `select ${TARGET_COLUMNS} from employee_targets where cycle_id = $1 and employee_position_id = $2 order by sort_order, target_id`,
        [cycleId, employeePositionId]
    );
}

export interface EmployeeTargetInput {
    title: string;
    description?: string | null;
    category?: string | null;
    metric_unit?: string | null;
    target_value?: number | null;
    actual_value?: number | null;
    progress_pct?: number | null;
    weight?: number | null;
    banner_goal_id?: number | null;
    due_date?: string | null;
    status?: string;
}

export async function createEmployeeTarget(cycleId: number, employeePositionId: number, input: EmployeeTargetInput): Promise<{ ok: boolean; id?: number; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    // employee_id is denormalised onto the row (see migration 027) so the
    // profile card can fetch a person's targets across every seat in one query
    // — resolve it from the seat rather than trusting a caller-supplied value.
    const pos = await queryOne<{ employee_id: number; banner_id: number }>(
        `select employee_id, banner_id from employee_positions where employee_position_id = $1`,
        [employeePositionId]
    );
    if (!pos) return { ok: false, error: "Position not found" };

    const n = normaliseTarget(input);
    try {
        const row = await queryOne<{ target_id: number }>(
            `insert into employee_targets
                (cycle_id, employee_position_id, employee_id, banner_id, title, description, category, metric_unit,
                 target_value, actual_value, progress_pct, weight, banner_goal_id, due_date, status)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, coalesce($15, 'active'))
             returning target_id`,
            [
                cycleId, employeePositionId, pos.employee_id, pos.banner_id,
                n.title, n.description, n.category, n.metric_unit, n.target_value, n.actual_value, n.progress_pct, n.weight,
                n.banner_goal_id, n.due_date, input.status ?? null,
            ]
        );
        revalidate(pos.employee_id);
        return { ok: true, id: row?.target_id };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function updateEmployeeTarget(targetId: number, input: EmployeeTargetInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    const n = normaliseTarget(input);
    try {
        const row = await queryOne<{ employee_id: number }>(
            `update employee_targets set
                title=$1, description=$2, category=$3, metric_unit=$4, target_value=$5, actual_value=$6, progress_pct=$7,
                weight=$8, banner_goal_id=$9, due_date=$10, ${input.status ? "status=$12," : ""} updated_at=CURRENT_TIMESTAMP
             where target_id = $11
             returning employee_id`,
            input.status
                ? [n.title, n.description, n.category, n.metric_unit, n.target_value, n.actual_value, n.progress_pct, n.weight, n.banner_goal_id, n.due_date, targetId, input.status]
                : [n.title, n.description, n.category, n.metric_unit, n.target_value, n.actual_value, n.progress_pct, n.weight, n.banner_goal_id, n.due_date, targetId]
        );
        revalidate(row?.employee_id);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function deleteEmployeeTarget(targetId: number): Promise<{ ok: boolean; error?: string }> {
    const row = await queryOne<{ employee_id: number }>(`select employee_id from employee_targets where target_id = $1`, [targetId]);
    try {
        await query(`delete from employee_targets where target_id = $1`, [targetId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidate(row?.employee_id);
    return { ok: true };
}

function normaliseTarget(i: EmployeeTargetInput) {
    return {
        title: i.title.trim(),
        description: i.description?.trim() || null,
        category: i.category?.trim() || null,
        metric_unit: i.metric_unit?.trim() || null,
        target_value: i.target_value ?? null,
        actual_value: i.actual_value ?? null,
        progress_pct: i.progress_pct ?? null,
        weight: i.weight ?? null,
        banner_goal_id: i.banner_goal_id ?? null,
        due_date: i.due_date || null,
    };
}

// ── Overview (chart overlay + completion KPI) ─────────────────────────────

export interface PerfSummary {
    status: PerfStatus;
    pct: number | null;
    targetCount: number;
    withActualCount: number;
}

export interface PerfOverview {
    // Keyed by employee_position_id as a string, matching OrgFlatNode.id so the
    // chart can look a node's status up directly. A plain object rather than a
    // Map so it serialises across the server/client boundary unchanged.
    byPosition: Record<string, PerfSummary>;
    seatsWithTargets: number;
    totalSeats: number;
}

export async function getPerformanceOverview(cycleId: number, bannerId?: number): Promise<PerfOverview> {
    // Denominator = real (non-vacant) seats in scope. A vacant seat has no one
    // to set targets for, so counting it would make the completion figure
    // permanently unreachable.
    const [positions, targets] = await Promise.all([
        bannerId
            ? query<any>(`select employee_position_id, employee_id from employee_positions where banner_id = $1`, [bannerId])
            : query<any>(`select employee_position_id, employee_id from employee_positions`),
        query<any>(`select employee_position_id, target_value, actual_value, progress_pct, weight from employee_targets where cycle_id = $1`, [cycleId]),
    ]);

    const employeeIds = Array.from(new Set(positions.map((p) => p.employee_id)));
    const emps = employeeIds.length
        ? await query<any>(`select employee_id, status from employees where employee_id = any($1)`, [employeeIds])
        : [];
    const activeEmp = new Map<number, boolean>(emps.map((e) => [e.employee_id, e.status !== "Vacant"]));

    const inScope = positions.filter((p) => activeEmp.get(p.employee_id));
    const inScopeIds = new Set(inScope.map((p) => p.employee_position_id));

    const byPositionRows = new Map<number, any[]>();
    targets.forEach((t) => {
        if (!inScopeIds.has(t.employee_position_id)) return; // targets from another company's seats
        const arr = byPositionRows.get(t.employee_position_id) || [];
        arr.push(t);
        byPositionRows.set(t.employee_position_id, arr);
    });

    const byPosition: Record<string, PerfSummary> = {};
    inScope.forEach((p) => {
        const rows = byPositionRows.get(p.employee_position_id) || [];
        const pct = rollup(rows);
        byPosition[String(p.employee_position_id)] = {
            status: perfStatus(pct, rows.length),
            pct,
            targetCount: rows.length,
            withActualCount: rows.filter((r) => progressPct(r) != null).length,
        };
    });

    return {
        byPosition,
        seatsWithTargets: byPositionRows.size,
        totalSeats: inScope.length,
    };
}

// ── People who recorded targets here but have since moved on ──────────────

export interface DepartedHolder {
    employee_id: number;
    employee_position_id: number;
    name: string;
    position_title: string | null;
    movedToBannerName: string | null; // null = the seat is gone entirely
    targetCount: number;
    pct: number | null;
}

// Someone can have done a cycle's work for a company and then transferred out.
// Their targets stay recorded against that company (mig 028's snapshot), but
// they're no longer anywhere in its org chart — so without this they'd simply
// vanish from the cycle, taking their contribution with them.
//
// Resigned people are deliberately NOT here: they keep their seat, so they
// still appear on the chart and are flagged on the node itself instead.
export async function getDepartedHolders(cycleId: number, bannerId?: number): Promise<DepartedHolder[]> {
    if (!bannerId) return []; // only meaningful against one company's book

    const targets = await query<any>(
        `select employee_position_id, employee_id, target_value, actual_value, progress_pct, weight
         from employee_targets where cycle_id = $1 and banner_id = $2`,
        [cycleId, bannerId]
    );
    if (!targets.length) return [];

    const posIds = Array.from(new Set(targets.map((t) => t.employee_position_id)));
    const [positions, banners] = await Promise.all([
        query<any>(`select employee_position_id, employee_id, position_title, banner_id from employee_positions where employee_position_id = any($1)`, [posIds]),
        query<any>(`select banner_id, name from banners`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));
    const posMap = new Map<number, any>(positions.map((p) => [p.employee_position_id, p]));

    // Still sitting in this company → shown on the chart, not here.
    const departedPosIds = posIds.filter((id) => (posMap.get(id)?.banner_id ?? null) !== bannerId);
    if (!departedPosIds.length) return [];

    const empIds = Array.from(new Set(departedPosIds.map((id) => posMap.get(id)?.employee_id).filter(Boolean)));
    const emps = empIds.length
        ? await query<any>(`select employee_id, name from employees where employee_id = any($1)`, [empIds])
        : [];
    const empMap = new Map<number, any>(emps.map((e) => [e.employee_id, e]));

    return departedPosIds.map((id) => {
        const pos = posMap.get(id);
        const rows = targets.filter((t) => t.employee_position_id === id);
        return {
            employee_id: pos?.employee_id ?? 0,
            employee_position_id: id,
            name: empMap.get(pos?.employee_id)?.name ?? "(removed)",
            position_title: pos?.position_title ?? null,
            movedToBannerName: pos?.banner_id ? (bannerMap.get(pos.banner_id) ?? null) : null,
            targetCount: rows.length,
            pct: rollup(rows),
        };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Profile card ──────────────────────────────────────────────────────────

export interface SeatTargets {
    employee_position_id: number;
    position_title: string | null;
    banner_name: string | null;
    is_primary: boolean;
    targets: EmployeeTarget[];
}

// One person's targets for a cycle, grouped by the seat they belong to — a
// concurrent-position holder legitimately has two separate sets.
export async function getEmployeeTargets(employeeId: number, cycleId: number): Promise<SeatTargets[]> {
    const [positions, targets, banners] = await Promise.all([
        query<any>(`select employee_position_id, position_title, banner_id, is_primary from employee_positions where employee_id = $1`, [employeeId]),
        query<EmployeeTarget>(`select ${TARGET_COLUMNS} from employee_targets where employee_id = $1 and cycle_id = $2 order by sort_order, target_id`, [employeeId, cycleId]),
        query<any>(`select banner_id, name from banners`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));

    return positions
        .map((p) => ({
            employee_position_id: p.employee_position_id,
            position_title: p.position_title,
            banner_name: bannerMap.get(p.banner_id) ?? null,
            is_primary: !!p.is_primary,
            targets: targets.filter((t) => t.employee_position_id === p.employee_position_id),
        }))
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}
