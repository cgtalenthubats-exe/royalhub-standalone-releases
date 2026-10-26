"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canSeeComp, canSeePersonal, redactListItem, redactDetail } from "@/lib/permissions";
import { decryptEmployeeCompensation, decryptCompensationHistory } from "@/lib/compensation-crypto";

export interface Compensation {
    employee_id: number;
    currency: string;
    base_salary: number | null;
    sti_target: number | null;
    sti_max: number | null;
    lti_target: number | null;
    lti_max: number | null;
    other_bonus: number | null;
    allowance_company_car: number | null;
    allowance_mobility: number | null;
    allowance_home_office: number | null;
    allowance_private_medical: number | null;
    /** Free text ("Other benefit — please specify"), not a euro amount — see migration 023. */
    allowance_family_cover: string | null;
    total_compensation: number | null;
}

export interface PerformanceGrade {
    fiscal_year: number;
    grade: string | null;
    label: string | null;
}

export interface EmployeeRow {
    employee_id: number;
    name: string;
    photo: string | null;
    date_of_birth: string | null;
    retirement_age: number | null;
    gender: string | null;
    nationality: string | null;
    country: string | null;
    city: string | null;
    status: string;
    banner_id: number | null;
    office_id: number | null;
    function_id: number | null;
    position_title: string | null;
    job_grade: string | null;
    hire_date: string | null;
    position_effective_date: string | null;
    readiness_potential: string | null;
    resign_date: string | null;
    resignation_reason: string | null;
    tag_color: string | null;
}

export interface EmployeeListItem extends EmployeeRow {
    banner_name: string | null;
    function_name: string | null;
    total_compensation: number | null;
    base_salary: number | null;
    sti_target: number | null;
    lti_target: number | null;
    other_bonus: number | null;
    latest_grade: string | null;
    team_size: number;
}

export interface EmployeeScores {
    leadership: number | null;
    experiences: number | null;
    skill: number | null;
    market: number | null;
}

// One position a person holds — a person can hold more than one at once
// (see migration 026 / docs/SYSTEM_AUDIT.md "seat model"). Each is its own
// org-chart node with its own reporting line, independently placed.
export interface EmployeePositionSummary {
    employee_position_id: number;
    position_title: string;
    position_id: number | null;
    function_id: number | null;
    function_name: string | null;
    banner_id: number;
    banner_name: string | null;
    office_id: number;
    office_country: string | null;
    is_primary: boolean;
    manager_name: string | null; // banner-dimension parent, for display
}

export interface EmployeeDetail extends EmployeeListItem {
    position_id: number | null;
    compensation: Compensation | null;
    performance: PerformanceGrade[];
    comp_history: any[];
    employment_history: any[];
    background: any[];
    insights: any[];
    scores: EmployeeScores | null;
    position_req: { req_leadership: number | null; req_experiences: number | null; req_skill: number | null; req_market: number | null } | null;
    manager: { employee_id: number; name: string; position_title: string | null; photo: string | null; banner_name: string | null; team_size: number } | null;
    // A distinct Head of Function this employee reports to (function-dimension
    // parent), only set when it differs from `manager` — i.e. a real
    // cross-company/cross-function reporting line, not the everyday case
    // where both dimensions point at the same manager.
    functionManager?: { employee_id: number; name: string; position_title: string | null; photo: string | null; banner_name: string | null; team_size: number; cross_banner: boolean } | null;
    // Real reports in either the banner (management chain) or function
    // dimension, deduped — someone can be a Head of Function's report without
    // also being their banner-dimension direct report, or both at once.
    // Resolved off this employee's PRIMARY position only — a concurrent
    // position's own reports show on the Positions card instead.
    reports: { employee_id: number; name: string; position_title: string | null; status: string; photo: string | null; banner_name: string | null; team_size: number; cross_banner: boolean }[];
    // Every position this person holds (primary first) — powers the profile's
    // Positions card. Empty array only if the migration 026 backfill somehow
    // missed them (shouldn't happen — every employee gets a primary row).
    positions: EmployeePositionSummary[];
    // Set only on synthetic "what-if / adjusted" comparison rows (negative
    // employee_id) — the real employee the scenario was modeled from.
    simulated_from?: number;
}

// ---- shared loaders ----
async function loadLookups() {
    const [banners, functions] = await Promise.all([
        query<any>(`select banner_id, name from banners`),
        query<any>(`select function_id, name from functions`),
    ]);
    const bannerMap = new Map<number, any>(banners.map((b) => [b.banner_id, b]));
    const functionMap = new Map<number, any>(functions.map((f) => [f.function_id, f]));
    return { banners, functions, bannerMap, functionMap };
}

// A person's currently-designated primary employee_position_id (or null if
// they somehow have none). Used everywhere a caller still deals in
// employeeId but org_edges needs an employee_position_id.
export async function primaryPositionId(employeeId: number): Promise<number | null> {
    const row = await queryOne<{ employee_position_id: number }>(
        `select employee_position_id from employee_positions where employee_id = $1 and is_primary = true`,
        [employeeId]
    );
    return row?.employee_position_id ?? null;
}

// employees.position_id/position_title/function_id/banner_id/office_id are
// kept as a denormalized "primary position cache" so every display-only
// reader elsewhere in the app (CSV import, AI Assessment, PDF export, etc.)
// keeps working unchanged — call this after any write to a primary
// employee_positions row so the cache never drifts.
export async function syncEmployeeCache(employeeId: number): Promise<void> {
    const primary = await queryOne<any>(
        `select position_id, position_title, function_id, banner_id, office_id
         from employee_positions where employee_id = $1 and is_primary = true`,
        [employeeId]
    );
    if (!primary) return;
    await query(
        `update employees set position_id = $1, position_title = $2, function_id = $3, banner_id = $4, office_id = $5, updated_at = CURRENT_TIMESTAMP
         where employee_id = $6`,
        [primary.position_id, primary.position_title, primary.function_id, primary.banner_id, primary.office_id, employeeId]
    );
}

// Count of active direct reports (banner dimension), keyed by
// parent_employee_position_id — a manager's "team size" now counts seats
// reporting to that specific position, not people reporting to them overall.
async function teamSizeMap(): Promise<Map<number, number>> {
    const rows = await query<{ parent_employee_position_id: number; count: string }>(`
        select oe.parent_employee_position_id, count(*) as count
        from org_edges oe
        join employee_positions ep on ep.employee_position_id = oe.employee_position_id
        join employees e on e.employee_id = ep.employee_id and e.status = 'Active'
        where oe.dimension = 'banner' and oe.parent_employee_position_id is not null
        group by oe.parent_employee_position_id
    `);
    const map = new Map<number, number>();
    rows.forEach((r) => map.set(r.parent_employee_position_id, Number(r.count)));
    return map;
}

export async function listEmployees(): Promise<EmployeeListItem[]> {
    // "Vacant" rows are org-chart seat placeholders, not people — keep them out of every
    // employee-picker/directory view (Comparison, Proposals, the Employees table itself).
    const [emps, comps, perfs, lookups, teams, primaries] = await Promise.all([
        query<any>(`select * from employees where status <> 'Vacant' order by employee_id`),
        query<any>(`select * from employee_compensation`),
        query<any>(`select employee_id, fiscal_year, grade from performance_grades`),
        loadLookups(),
        teamSizeMap(),
        query<any>(`select employee_id, employee_position_id from employee_positions where is_primary = true`),
    ]);
    const compMap = new Map<number, any>(comps.map((c) => [c.employee_id, decryptEmployeeCompensation(c)]));
    const latestGrade = new Map<number, { fy: number; grade: string }>();
    perfs.forEach((p) => {
        const cur = latestGrade.get(p.employee_id);
        if (!cur || p.fiscal_year > cur.fy) latestGrade.set(p.employee_id, { fy: p.fiscal_year, grade: p.grade });
    });
    const primaryPositionByEmployee = new Map<number, number>(primaries.map((p) => [p.employee_id, p.employee_position_id]));

    const user = await getCurrentUser();
    const seeComp = canSeeComp(user);
    const seePersonal = canSeePersonal(user);
    return emps.map((e) => {
        const c = compMap.get(e.employee_id);
        const positionId = primaryPositionByEmployee.get(e.employee_id);
        const item: EmployeeListItem = {
            ...e,
            banner_name: lookups.bannerMap.get(e.banner_id)?.name ?? null,
            function_name: lookups.functionMap.get(e.function_id)?.name ?? null,
            total_compensation: c?.total_compensation ?? null,
            base_salary: c?.base_salary ?? null,
            sti_target: c?.sti_target ?? null,
            lti_target: c?.lti_target ?? null,
            other_bonus: c?.other_bonus ?? null,
            latest_grade: latestGrade.get(e.employee_id)?.grade ?? null,
            team_size: positionId != null ? teams.get(positionId) || 0 : 0,
        };
        return redactListItem(item, seeComp, seePersonal);
    });
}

export async function getEmployee(id: number): Promise<EmployeeDetail | null> {
    const emp = await queryOne<any>(`select * from employees where employee_id = $1`, [id]);
    if (!emp) return null;

    const [comp, perf, hist, empHist, bg, ins, scores, lookups, teams, myPositions] = await Promise.all([
        queryOne<any>(`select * from employee_compensation where employee_id = $1`, [id]),
        query<any>(`select fiscal_year, grade, label from performance_grades where employee_id = $1 order by fiscal_year`, [id]),
        query<any>(`select * from compensation_history where employee_id = $1 order by fiscal_year`, [id]),
        query<any>(`select * from employment_history where employee_id = $1 order by start_date`, [id]),
        query<any>(`select * from employee_background where employee_id = $1 order by sort_order`, [id]),
        query<any>(`select * from employee_insights where employee_id = $1 order by id`, [id]),
        queryOne<any>(`select leadership, experiences, skill, market from employee_scores where employee_id = $1`, [id]),
        loadLookups(),
        teamSizeMap(),
        query<any>(
            `select employee_position_id, position_title, position_id, function_id, banner_id, office_id, is_primary
             from employee_positions where employee_id = $1 order by is_primary desc`,
            [id]
        ),
    ]);
    const decryptedComp = comp ? decryptEmployeeCompensation(comp) : comp;
    const decryptedHist = hist.map((h: any) => decryptCompensationHistory(h));

    const positionRows = myPositions;
    const primary = positionRows.find((p: any) => p.is_primary) ?? positionRows[0];
    const subjectPositionId: number | null = primary?.employee_position_id ?? null;

    // position requirements — the primary position's catalog link
    let position_req = null;
    if (emp.position_id) {
        position_req = await queryOne<any>(
            `select req_leadership, req_experiences, req_skill, req_market from positions where position_id = $1`,
            [emp.position_id]
        );
    }

    // manager / functionManager / reports — resolved off the PRIMARY
    // position's own org_edges rows only. A concurrent position's own
    // manager/reports show on the Positions card, not folded in here.
    let manager: EmployeeDetail["manager"] = null;
    let functionManager: EmployeeDetail["functionManager"] = null;
    let reports: EmployeeDetail["reports"] = [];
    if (subjectPositionId != null) {
        const [bannerEdge, functionEdge, bannerRepEdges, functionRepEdges] = await Promise.all([
            queryOne<any>(`select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = 'banner'`, [subjectPositionId]),
            queryOne<any>(`select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = 'function'`, [subjectPositionId]),
            query<any>(`select employee_position_id from org_edges where parent_employee_position_id = $1 and dimension = 'banner'`, [subjectPositionId]),
            query<any>(`select employee_position_id from org_edges where parent_employee_position_id = $1 and dimension = 'function'`, [subjectPositionId]),
        ]);

        const neededPositionIds = Array.from(new Set([
            bannerEdge?.parent_employee_position_id, functionEdge?.parent_employee_position_id,
            ...bannerRepEdges.map((r: any) => r.employee_position_id),
            ...functionRepEdges.map((r: any) => r.employee_position_id),
        ].filter((v): v is number => v != null)));

        const posMap = new Map<number, any>();
        if (neededPositionIds.length) {
            const posRows = await query<any>(
                `select employee_position_id, employee_id, position_title, banner_id from employee_positions where employee_position_id = any($1)`,
                [neededPositionIds]
            );
            posRows.forEach((p) => posMap.set(p.employee_position_id, p));
        }
        const neededEmployeeIds = Array.from(new Set(Array.from(posMap.values()).map((p: any) => p.employee_id)));
        const empMap = new Map<number, any>();
        if (neededEmployeeIds.length) {
            const empRows = await query<any>(`select employee_id, name, photo, status from employees where employee_id = any($1)`, [neededEmployeeIds]);
            empRows.forEach((e) => empMap.set(e.employee_id, e));
        }
        const buildPerson = (positionId: number | null | undefined) => {
            if (positionId == null) return null;
            const p = posMap.get(positionId); if (!p) return null;
            const e = empMap.get(p.employee_id); if (!e) return null;
            return {
                employee_id: e.employee_id, name: e.name, position_title: p.position_title, photo: e.photo,
                banner_name: lookups.bannerMap.get(p.banner_id)?.name ?? null, team_size: teams.get(positionId) || 0,
            };
        };

        manager = buildPerson(bannerEdge?.parent_employee_position_id);
        const fnParentId = functionEdge?.parent_employee_position_id ?? null;
        if (fnParentId != null && fnParentId !== (bannerEdge?.parent_employee_position_id ?? null)) {
            const built = buildPerson(fnParentId);
            const fp = posMap.get(fnParentId);
            functionManager = built ? { ...built, cross_banner: fp ? fp.banner_id !== emp.banner_id : false } : null;
        }

        const repPositionIds = Array.from(new Set([
            ...bannerRepEdges.map((r: any) => r.employee_position_id),
            ...functionRepEdges.map((r: any) => r.employee_position_id),
        ]));
        reports = repPositionIds.map((pid) => {
            const p = posMap.get(pid); const e = p ? empMap.get(p.employee_id) : null;
            if (!p || !e) return null;
            return {
                employee_id: e.employee_id, name: e.name, position_title: p.position_title, status: e.status, photo: e.photo,
                banner_name: lookups.bannerMap.get(p.banner_id)?.name ?? null, team_size: teams.get(pid) || 0,
                cross_banner: p.banner_id !== emp.banner_id,
            };
        }).filter((r): r is NonNullable<typeof r> => r !== null);
    }

    // Every position this person holds, for the profile's Positions card —
    // each with its own banner-dimension manager name.
    const officeIds = Array.from(new Set(positionRows.map((p: any) => p.office_id).filter((v: any) => v != null)));
    const officeRows = officeIds.length
        ? await query<any>(`select office_id, country from banner_offices where office_id = any($1)`, [officeIds])
        : [];
    const officeCountryMap = new Map<number, string>(officeRows.map((o) => [o.office_id, o.country]));

    const posBannerParents = new Map<number, number | null>();
    if (positionRows.length) {
        const posEdges = await query<any>(
            `select employee_position_id, parent_employee_position_id from org_edges where dimension = 'banner' and employee_position_id = any($1)`,
            [positionRows.map((p: any) => p.employee_position_id)]
        );
        posEdges.forEach((e) => posBannerParents.set(e.employee_position_id, e.parent_employee_position_id));
    }
    const managerPositionIds = Array.from(new Set(Array.from(posBannerParents.values()).filter((v): v is number => v != null)));
    const managerPosOwner = new Map<number, number>();
    if (managerPositionIds.length) {
        const mgrPosRows = await query<any>(`select employee_position_id, employee_id from employee_positions where employee_position_id = any($1)`, [managerPositionIds]);
        mgrPosRows.forEach((p) => managerPosOwner.set(p.employee_position_id, p.employee_id));
    }
    const managerEmployeeIds = Array.from(new Set(Array.from(managerPosOwner.values())));
    const managerNameMap = new Map<number, string>();
    if (managerEmployeeIds.length) {
        const mgrEmpRows = await query<any>(`select employee_id, name from employees where employee_id = any($1)`, [managerEmployeeIds]);
        mgrEmpRows.forEach((e) => managerNameMap.set(e.employee_id, e.name));
    }

    const positions: EmployeePositionSummary[] = positionRows.map((p: any) => {
        const parentPositionId = posBannerParents.get(p.employee_position_id) ?? null;
        const managerEmployeeId = parentPositionId != null ? managerPosOwner.get(parentPositionId) ?? null : null;
        return {
            employee_position_id: p.employee_position_id,
            position_title: p.position_title,
            position_id: p.position_id ?? null,
            function_id: p.function_id ?? null,
            function_name: p.function_id ? lookups.functionMap.get(p.function_id)?.name ?? null : null,
            banner_id: p.banner_id,
            banner_name: lookups.bannerMap.get(p.banner_id)?.name ?? null,
            office_id: p.office_id,
            office_country: officeCountryMap.get(p.office_id) ?? null,
            is_primary: p.is_primary,
            manager_name: managerEmployeeId != null ? managerNameMap.get(managerEmployeeId) ?? null : null,
        };
    });

    const detail: EmployeeDetail = {
        ...emp,
        banner_name: lookups.bannerMap.get(emp.banner_id)?.name ?? null,
        function_name: lookups.functionMap.get(emp.function_id)?.name ?? null,
        total_compensation: decryptedComp?.total_compensation ?? null,
        base_salary: decryptedComp?.base_salary ?? null,
        sti_target: decryptedComp?.sti_target ?? null,
        lti_target: decryptedComp?.lti_target ?? null,
        other_bonus: decryptedComp?.other_bonus ?? null,
        latest_grade: (perf && perf.length) ? perf[perf.length - 1].grade : null,
        team_size: subjectPositionId != null ? teams.get(subjectPositionId) || 0 : 0,
        compensation: decryptedComp ?? null,
        performance: perf || [],
        comp_history: decryptedHist || [],
        employment_history: empHist || [],
        background: bg || [],
        insights: ins || [],
        scores: scores ?? null,
        position_id: emp.position_id ?? null,
        position_req,
        manager,
        functionManager,
        reports,
        positions,
    };
    const user = await getCurrentUser();
    return redactDetail(detail, canSeeComp(user), canSeePersonal(user));
}

// Move an employee's position (and, implicitly, their whole reporting line —
// anyone still pointing at that position keeps doing so) under a new parent
// position. dimension defaults to banner.
export async function moveEmployee(employeePositionId: number, newParentId: number | null, dimension: "banner" | "function" | "headcount" = "banner"): Promise<{ ok: boolean; error?: string }> {
    if (employeePositionId === newParentId) return { ok: false, error: "Cannot report to self" };
    try {
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where employee_position_id = $2 and dimension = $3`,
            [newParentId, employeePositionId, dimension]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// Move just the dragged position. If it has direct reports in this dimension, a
// "(Vacant)" placeholder position is created at its old spot (same title/company/
// office/function) and those reports are re-pointed at it — so the team keeps a home
// in the tree instead of silently following the move. No placeholder is created if
// there are no reports (nothing there to preserve).
export async function moveEmployeeAlone(employeePositionId: number, newParentId: number | null, dimension: "banner" | "function" | "headcount" = "banner"): Promise<{ ok: boolean; error?: string }> {
    if (employeePositionId === newParentId) return { ok: false, error: "Cannot report to self" };

    const [pos, ownEdge, reportEdges] = await Promise.all([
        queryOne<any>(`select position_title, banner_id, office_id, function_id from employee_positions where employee_position_id = $1`, [employeePositionId]),
        queryOne<any>(`select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = $2`, [employeePositionId, dimension]),
        query<any>(`select employee_position_id from org_edges where parent_employee_position_id = $1 and dimension = $2`, [employeePositionId, dimension]),
    ]);
    if (!pos || !ownEdge) return { ok: false, error: "Position not found in this view" };

    try {
        if (reportEdges.length > 0) {
            const vacantEmp = await queryOne<{ employee_id: number }>(
                `insert into employees (name, status, position_title, banner_id, office_id, function_id)
                 values ('(Vacant)', 'Vacant', $1, $2, $3, $4) returning employee_id`,
                [pos.position_title, pos.banner_id, pos.office_id, pos.function_id]
            );
            if (!vacantEmp) return { ok: false, error: "Could not create vacant placeholder" };

            const vacantPos = await queryOne<{ employee_position_id: number }>(
                `insert into employee_positions (employee_id, position_title, banner_id, office_id, function_id, is_primary)
                 values ($1,$2,$3,$4,$5,true) returning employee_position_id`,
                [vacantEmp.employee_id, pos.position_title, pos.banner_id, pos.office_id, pos.function_id]
            );
            if (!vacantPos) return { ok: false, error: "Could not create vacant position" };

            await query(
                `insert into org_edges (employee_position_id, parent_employee_position_id, dimension, updated_at) values ($1,$2,$3, CURRENT_TIMESTAMP)`,
                [vacantPos.employee_position_id, ownEdge.parent_employee_position_id, dimension]
            );
            await query(
                `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where parent_employee_position_id = $2 and dimension = $3`,
                [vacantPos.employee_position_id, employeePositionId, dimension]
            );
        }

        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where employee_position_id = $2 and dimension = $3`,
            [newParentId, employeePositionId, dimension]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// "Replace" — drag a real position onto a Vacant seat to fill it. The vacant placeholder
// (and its phantom employee row) is removed entirely; the incoming position inherits its
// spot (parent) and its reports.
export async function replaceVacant(vacantPositionId: number, newOccupantPositionId: number, dimension: "banner" | "function" | "headcount" = "banner"): Promise<{ ok: boolean; error?: string }> {
    if (vacantPositionId === newOccupantPositionId) return { ok: false, error: "Cannot replace with self" };
    const vacantPos = await queryOne<{ employee_id: number }>(`select employee_id from employee_positions where employee_position_id = $1`, [vacantPositionId]);
    if (!vacantPos) return { ok: false, error: "Target position not found" };
    const vacantEmp = await queryOne<{ status: string }>(`select status from employees where employee_id = $1`, [vacantPos.employee_id]);
    if (!vacantEmp || vacantEmp.status !== "Vacant") return { ok: false, error: "Target is not a vacant seat" };

    const vacantEdge = await queryOne<{ parent_employee_position_id: number | null }>(
        `select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = $2`,
        [vacantPositionId, dimension]
    );
    if (!vacantEdge) return { ok: false, error: "Vacant seat not found in this view" };

    try {
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where employee_position_id = $2 and dimension = $3`,
            [vacantEdge.parent_employee_position_id, newOccupantPositionId, dimension]
        );
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where parent_employee_position_id = $2 and dimension = $3`,
            [newOccupantPositionId, vacantPositionId, dimension]
        );
        await query(`delete from org_edges where employee_position_id = $1 and dimension = $2`, [vacantPositionId, dimension]);
        // Deleting the phantom employees row cascades its employee_positions row
        // (and any remaining org_edges for it) automatically.
        await query(`delete from employees where employee_id = $1`, [vacantPos.employee_id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// Create a brand-new open position under a manager's position — a Vacant seat
// that didn't come from anyone moving away. Commits immediately (typed dialog
// action, not a drag gesture, so it isn't part of the staged-move queue).
export async function createVacantSeat(parentPositionId: number, title: string | null, dimension: "banner" | "function" | "headcount" = "banner"): Promise<{ ok: boolean; error?: string; id?: number }> {
    const parentPos = await queryOne<any>(`select banner_id, office_id, function_id from employee_positions where employee_position_id = $1`, [parentPositionId]);
    if (!parentPos) return { ok: false, error: "Parent not found" };

    try {
        const vacantEmp = await queryOne<{ employee_id: number }>(
            `insert into employees (name, status, position_title, banner_id, office_id, function_id)
             values ('(Vacant)', 'Vacant', $1, $2, $3, $4) returning employee_id`,
            [title || null, parentPos.banner_id, parentPos.office_id, parentPos.function_id]
        );
        if (!vacantEmp) return { ok: false, error: "Could not create vacant seat" };

        const vacantPos = await queryOne<{ employee_position_id: number }>(
            `insert into employee_positions (employee_id, position_title, banner_id, office_id, function_id, is_primary)
             values ($1,$2,$3,$4,$5,true) returning employee_position_id`,
            [vacantEmp.employee_id, title || "Vacant", parentPos.banner_id, parentPos.office_id, parentPos.function_id]
        );
        if (!vacantPos) return { ok: false, error: "Could not create vacant position" };

        await query(
            `insert into org_edges (employee_position_id, parent_employee_position_id, dimension, updated_at) values ($1,$2,$3, CURRENT_TIMESTAMP)`,
            [vacantPos.employee_position_id, parentPositionId, dimension]
        );

        revalidatePath("/org/banner");
        revalidatePath("/org/function");
        revalidatePath("/org/headcount");
        return { ok: true, id: vacantPos.employee_position_id };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

// Promote a direct report to replace their own manager. The promoted position
// takes the incumbent's exact spot (and inherits the incumbent's other direct
// reports); the incumbent position lands as a direct report of the position
// they just promoted — a common "successor takes the role, outgoing manager
// stays on in an IC/support capacity under them" pattern.
export async function promoteToReplace(promotedPositionId: number, incumbentPositionId: number, dimension: "banner" | "function" | "headcount" = "banner"): Promise<{ ok: boolean; error?: string }> {
    if (promotedPositionId === incumbentPositionId) return { ok: false, error: "Cannot replace with self" };
    const [promotedEdge, incumbentEdge] = await Promise.all([
        queryOne<any>(`select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = $2`, [promotedPositionId, dimension]),
        queryOne<any>(`select parent_employee_position_id from org_edges where employee_position_id = $1 and dimension = $2`, [incumbentPositionId, dimension]),
    ]);
    if (!promotedEdge || !incumbentEdge) return { ok: false, error: "Not found in this view" };

    try {
        // Swap position title/catalog-link/function between the two POSITIONS —
        // job_grade is still a person-level field, swapped on the employees rows.
        const [promotedPos, incumbentPos] = await Promise.all([
            queryOne<any>(`select employee_id, position_title, position_id, function_id, is_primary from employee_positions where employee_position_id = $1`, [promotedPositionId]),
            queryOne<any>(`select employee_id, position_title, position_id, function_id, is_primary from employee_positions where employee_position_id = $1`, [incumbentPositionId]),
        ]);
        if (promotedPos && incumbentPos) {
            await Promise.all([
                query(`update employee_positions set position_title = $1, position_id = $2, function_id = $3, updated_at = CURRENT_TIMESTAMP where employee_position_id = $4`,
                    [incumbentPos.position_title, incumbentPos.position_id, incumbentPos.function_id, promotedPositionId]),
                query(`update employee_positions set position_title = $1, position_id = $2, function_id = $3, updated_at = CURRENT_TIMESTAMP where employee_position_id = $4`,
                    [promotedPos.position_title, promotedPos.position_id, promotedPos.function_id, incumbentPositionId]),
            ]);
            const [promotedEmp, incumbentEmp] = await Promise.all([
                queryOne<{ job_grade: string | null }>(`select job_grade from employees where employee_id = $1`, [promotedPos.employee_id]),
                queryOne<{ job_grade: string | null }>(`select job_grade from employees where employee_id = $1`, [incumbentPos.employee_id]),
            ]);
            if (promotedEmp && incumbentEmp) {
                await Promise.all([
                    query(`update employees set job_grade = $1, updated_at = CURRENT_TIMESTAMP where employee_id = $2`, [incumbentEmp.job_grade, promotedPos.employee_id]),
                    query(`update employees set job_grade = $1, updated_at = CURRENT_TIMESTAMP where employee_id = $2`, [promotedEmp.job_grade, incumbentPos.employee_id]),
                ]);
            }
            if (promotedPos.is_primary) await syncEmployeeCache(promotedPos.employee_id);
            if (incumbentPos.is_primary) await syncEmployeeCache(incumbentPos.employee_id);
        }

        // the incumbent's other direct reports (not the one being promoted) now report to the promoted position
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP
             where parent_employee_position_id = $2 and dimension = $3 and employee_position_id <> $4`,
            [promotedPositionId, incumbentPositionId, dimension, promotedPositionId]
        );

        // promoted position takes the incumbent's old spot
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where employee_position_id = $2 and dimension = $3`,
            [incumbentEdge.parent_employee_position_id, promotedPositionId, dimension]
        );

        // incumbent becomes a direct report of the position they just promoted
        await query(
            `update org_edges set parent_employee_position_id = $1, updated_at = CURRENT_TIMESTAMP where employee_position_id = $2 and dimension = $3`,
            [promotedPositionId, incumbentPositionId, dimension]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// ── Typed org placement (profile "Org Snapshot" editor) ────────────────────
// Dragging on the org chart is the fast path, but it only works for people
// already ON the chart and only within the view you happen to have open. This
// is the explicit, form-based equivalent: pick this employee's parent in each
// dimension from a list. It's also the recovery path for anyone whose edge
// row is missing or points somewhere wrong. Scoped to the employee's PRIMARY
// position only, same as `manager`/`reports` on their profile — a concurrent
// position's own reporting line is set once, at creation, from the Positions
// card, not re-editable here.

export type OrgDimension = "banner" | "function" | "headcount";
const ORG_DIMENSIONS: OrgDimension[] = ["banner", "function", "headcount"];

export interface OrgCandidate { employee_id: number; name: string; position_title: string | null; banner_name: string | null; function_name: string | null }
export interface OrgPlacement {
    dimension: OrgDimension;
    parentId: number | null;
    candidates: OrgCandidate[];
}

// Everyone at or below `positionId` in this dimension — they can't become the
// position's own parent without creating a cycle (which would make the whole
// subtree vanish from the chart, since a cycle has no root to render from).
function descendantsOf(positionId: number, edges: { employee_position_id: number; parent_employee_position_id: number | null }[]): Set<number> {
    const childrenOf = new Map<number, number[]>();
    edges.forEach((e) => {
        if (e.parent_employee_position_id == null) return;
        const arr = childrenOf.get(e.parent_employee_position_id) || [];
        arr.push(e.employee_position_id);
        childrenOf.set(e.parent_employee_position_id, arr);
    });
    const seen = new Set<number>([positionId]);
    const stack = [positionId];
    while (stack.length) {
        for (const child of childrenOf.get(stack.pop()!) || []) {
            if (seen.has(child)) continue; // already-broken data: don't loop forever
            seen.add(child);
            stack.push(child);
        }
    }
    return seen;
}

export async function getOrgPlacement(employeeId: number): Promise<OrgPlacement[]> {
    const [edges, positions, emps, banners, functions] = await Promise.all([
        query<any>(`select employee_position_id, parent_employee_position_id, dimension from org_edges`),
        query<any>(`select employee_position_id, employee_id, is_primary from employee_positions`),
        query<any>(`select employee_id, name, position_title, banner_id, function_id, status from employees`),
        query<any>(`select banner_id, name from banners`),
        query<any>(`select function_id, name from functions`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));
    const functionMap = new Map<number, string>(functions.map((f) => [f.function_id, f.name]));
    const primaryPositionByEmployee = new Map<number, number>();
    positions.forEach((p) => { if (p.is_primary) primaryPositionByEmployee.set(p.employee_id, p.employee_position_id); });
    const subjectPositionId = primaryPositionByEmployee.get(employeeId) ?? null;

    return ORG_DIMENSIONS.map((dimension) => {
        const dimEdges = edges.filter((e) => e.dimension === dimension);
        const blocked = subjectPositionId != null ? descendantsOf(subjectPositionId, dimEdges) : new Set<number>();
        const candidates = emps
            .filter((e) => e.employee_id !== employeeId)
            .filter((e) => {
                const pid = primaryPositionByEmployee.get(e.employee_id);
                return pid == null || !blocked.has(pid);
            })
            .map((e) => ({
                employee_id: e.employee_id, name: e.name, position_title: e.position_title,
                banner_name: e.banner_id ? bannerMap.get(e.banner_id) ?? null : null,
                function_name: e.function_id ? functionMap.get(e.function_id) ?? null : null,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        const ownEdge = subjectPositionId != null ? dimEdges.find((e) => e.employee_position_id === subjectPositionId) : undefined;
        const parentPositionId = ownEdge?.parent_employee_position_id ?? null;
        const parentEmployeeId = parentPositionId != null
            ? positions.find((p) => p.employee_position_id === parentPositionId)?.employee_id ?? null
            : null;
        return { dimension, parentId: parentEmployeeId, candidates };
    });
}

export async function setEmployeeManager(employeeId: number, dimension: OrgDimension, parentId: number | null): Promise<{ ok: boolean; error?: string }> {
    if (employeeId === parentId) return { ok: false, error: "Cannot report to self" };

    const subjectPositionId = await primaryPositionId(employeeId);
    if (subjectPositionId == null) return { ok: false, error: "Employee has no primary position" };
    const parentPositionId = parentId != null ? await primaryPositionId(parentId) : null;
    if (parentId != null && parentPositionId == null) return { ok: false, error: "Selected manager has no primary position" };

    if (parentPositionId != null) {
        const edges = await query<any>(`select employee_position_id, parent_employee_position_id from org_edges where dimension = $1`, [dimension]);
        if (descendantsOf(subjectPositionId, edges).has(parentPositionId)) {
            return { ok: false, error: "That person already reports to this employee — pick someone outside their team." };
        }
    }

    try {
        // upsert, not update: a position whose edge row is missing entirely is
        // exactly the case this editor exists to repair, and a bare update would
        // silently match zero rows and report success.
        await query(
            `insert into org_edges (employee_position_id, parent_employee_position_id, dimension, updated_at)
             values ($1,$2,$3, CURRENT_TIMESTAMP)
             on conflict (employee_position_id, dimension) do update set
                parent_employee_position_id = excluded.parent_employee_position_id,
                updated_at = excluded.updated_at`,
            [subjectPositionId, parentPositionId, dimension]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidatePath(`/employees/${employeeId}`);
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// For Comparison page — full detail for a set of employees
export async function getComparisonData(ids: number[]): Promise<EmployeeDetail[]> {
    const results = await Promise.all(ids.map((id) => getEmployee(id)));
    return results.filter((r): r is EmployeeDetail => r !== null);
}
