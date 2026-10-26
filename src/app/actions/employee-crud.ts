"use server";

import { query, queryOne, withTransaction } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireCompEditor, canSeePersonal } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { encryptAmount } from "@/lib/crypto";

export interface NewEmployeeInput {
    name: string;
    office_id: number | null;
    position_id: number | null;
    date_of_birth?: string | null;
    hire_date?: string | null;
    position_effective_date?: string | null;
    status?: string;
    readiness_potential?: string | null;
    manager_id?: number | null;
}

// Builds a multi-row `($1,$2,...),($n+1,$n+2,...)` VALUES clause plus a
// flattened param array, for bulk inserts of same-shaped rows.
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

// Every employee needs a primary row in employee_positions (see migration
// 026 — org chart nodes are positions now, not people, so a person can hold
// more than one) plus a row in all three org dimensions for that position.
// getOrgTree walks org_edges (not employees), so a position with no edge is
// invisible on every org chart — and with no node on the chart there's
// nothing to drag, which used to leave them unreachable from the UI
// entirely. A NULL parent is fine: it just means "top of that tree", which
// still renders and can be re-pointed afterwards.
//
// The banner and headcount trees both follow the real management chain, so
// they take the given manager's primary position directly. The function
// tree is its own hierarchy per company, so a manager from a different
// function (or a different company) isn't a valid parent there — those
// fall back to NULL.
async function createOrgEdges(
    employeeId: number,
    managerId: number | null,
    employee: { banner_id: number | null; office_id: number | null; function_id: number | null; position_title: string | null }
): Promise<number> {
    const pos = await queryOne<{ employee_position_id: number }>(
        `insert into employee_positions (employee_id, position_title, function_id, banner_id, office_id, is_primary)
         values ($1,$2,$3,$4,$5,true) returning employee_position_id`,
        [employeeId, employee.position_title || "Unknown", employee.function_id, employee.banner_id, employee.office_id]
    );
    if (!pos) throw new Error("Could not create primary position");
    const employeePositionId = pos.employee_position_id;

    let managerPositionId: number | null = null;
    let functionParent: number | null = null;
    if (managerId) {
        const mgrPos = await queryOne<any>(
            `select employee_position_id, banner_id, function_id from employee_positions where employee_id = $1 and is_primary = true`,
            [managerId]
        );
        if (mgrPos) {
            managerPositionId = mgrPos.employee_position_id;
            if (mgrPos.function_id === employee.function_id && mgrPos.banner_id === employee.banner_id) functionParent = managerPositionId;
        }
    }
    await query(
        `insert into org_edges (employee_position_id, parent_employee_position_id, dimension, updated_at) values
         ($1, $2, 'banner', CURRENT_TIMESTAMP),
         ($1, $3, 'function', CURRENT_TIMESTAMP),
         ($1, $2, 'headcount', CURRENT_TIMESTAMP)`,
        [employeePositionId, managerPositionId, functionParent]
    );
    return employeePositionId;
}

async function resolveOfficePosition(office_id: number | null, position_id: number | null) {
    let banner_id: number | null = null, country: string | null = null, city: string | null = null;
    let position_title: string | null = null, function_id: number | null = null;
    if (office_id) {
        const o = await queryOne<any>(`select banner_id, country, city from banner_offices where office_id = $1`, [office_id]);
        banner_id = o?.banner_id ?? null; country = o?.country ?? null; city = o?.city ?? null;
    }
    if (position_id) {
        const p = await queryOne<any>(`select title, function_id from positions where position_id = $1`, [position_id]);
        position_title = p?.title ?? null; function_id = p?.function_id ?? null;
    }
    return { banner_id, country, city, position_title, function_id };
}

export async function createEmployee(input: NewEmployeeInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.name?.trim()) return { ok: false, error: "Name is required" };
    const { banner_id, country, city, position_title, function_id } = await resolveOfficePosition(input.office_id, input.position_id);
    try {
        const created = await queryOne<{ employee_id: number }>(
            `insert into employees
                (name, banner_id, office_id, position_id, position_title, function_id, country, city, nationality,
                 date_of_birth, hire_date, position_effective_date, status, readiness_potential)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning employee_id`,
            [
                input.name.trim(), banner_id, input.office_id, input.position_id, position_title, function_id, country, city, country,
                input.date_of_birth || null, input.hire_date || null, input.position_effective_date || input.hire_date || null,
                input.status || "Active", input.readiness_potential || null,
            ]
        );
        if (!created) return { ok: false, error: "Could not create employee" };
        await createOrgEdges(created.employee_id, input.manager_id ?? null, { banner_id, office_id: input.office_id, function_id, position_title });
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

// ── Full onboarding (the Add Employee wizard) ──────────────────────────────
// Everything an HR user would fill in for a new hire, gathered up front and
// created in one call instead of a bare-minimum row that gets filled in
// piecemeal later via each profile card's own edit dialog.
export interface NewEmployeeCompensationInput {
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
}
export interface NewEmployeeCareerEntry {
    banner: string;
    position: string;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
}
export interface NewEmployeeBackgroundEntry {
    type: "experience" | "education" | "certification";
    title: string;
    organization: string | null;
    detail: string | null;
}
export interface NewEmployeeFullInput {
    name: string;
    office_id: number;
    position_id: number;
    date_of_birth?: string | null;
    gender?: string | null;
    nationality?: string | null;
    job_grade?: string | null;
    hire_date?: string | null;
    position_effective_date?: string | null;
    status?: string;
    readiness_potential?: string | null;
    manager_id?: number | null;
    compensation?: NewEmployeeCompensationInput | null;
    career_history?: NewEmployeeCareerEntry[];
    background?: NewEmployeeBackgroundEntry[];
}

export async function createEmployeeFull(input: NewEmployeeFullInput): Promise<{ ok: boolean; id?: number; error?: string }> {
    if (!input.name?.trim()) return { ok: false, error: "Name is required" };
    if (!input.office_id) return { ok: false, error: "Company / office is required" };
    if (!input.position_id) return { ok: false, error: "Position is required" };

    const { banner_id, country, city, position_title, function_id } = await resolveOfficePosition(input.office_id, input.position_id);
    let employeeId: number;
    try {
        const created = await queryOne<{ employee_id: number }>(
            `insert into employees
                (name, banner_id, office_id, position_id, position_title, function_id, country, city, nationality,
                 gender, job_grade, date_of_birth, hire_date, position_effective_date, status, readiness_potential)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning employee_id`,
            [
                input.name.trim(), banner_id, input.office_id, input.position_id, position_title, function_id, country, city,
                input.nationality?.trim() || country, input.gender || null, input.job_grade?.trim() || null,
                input.date_of_birth || null, input.hire_date || null, input.position_effective_date || input.hire_date || null,
                input.status || "Active", input.readiness_potential || null,
            ]
        );
        if (!created) return { ok: false, error: "Could not create employee" };
        employeeId = created.employee_id;
        await createOrgEdges(employeeId, input.manager_id ?? null, { banner_id, office_id: input.office_id, function_id, position_title });
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    const c = input.compensation;
    if (c && Object.values(c).some((v) => v != null)) {
        try {
            await requireCompEditor();
            const total_compensation = (c.base_salary ?? 0) + (c.sti_target ?? 0) + (c.lti_target ?? 0) + (c.other_bonus ?? 0);
            await query(
                `insert into employee_compensation
                    (employee_id, currency, base_salary, sti_target, sti_max, lti_target, lti_max, other_bonus,
                     allowance_company_car, allowance_mobility, allowance_home_office, allowance_private_medical,
                     allowance_family_cover, total_compensation)
                 values ($1,'EUR',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [employeeId, encryptAmount(c.base_salary), encryptAmount(c.sti_target), encryptAmount(c.sti_max), encryptAmount(c.lti_target), encryptAmount(c.lti_max), encryptAmount(c.other_bonus),
                 c.allowance_company_car, c.allowance_mobility, c.allowance_home_office, c.allowance_private_medical,
                 c.allowance_family_cover, encryptAmount(total_compensation)]
            );
        } catch {
            // not authorized to enter compensation (matches updateEmployeeCompensation's
            // guard) — the employee row itself still gets created either way
        }
    }

    const career = (input.career_history || []).filter((h) => h.banner.trim() && h.position.trim());
    if (career.length) {
        const rows = career.map((h) => [employeeId, h.banner.trim(), h.position.trim(), h.location || null, h.start_date || null, h.end_date || null, false]);
        const { placeholders, params } = buildValuesRows(rows);
        await query(`insert into employment_history (employee_id, banner, position, location, start_date, end_date, is_current) values ${placeholders}`, params);
    }

    const background = (input.background || []).filter((b) => b.title.trim());
    if (background.length) {
        const rows = background.map((b, i) => [employeeId, b.type, b.title.trim(), b.organization || null, b.detail || null, i]);
        const { placeholders, params } = buildValuesRows(rows);
        await query(`insert into employee_background (employee_id, type, title, organization, detail, sort_order) values ${placeholders}`, params);
    }

    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true, id: employeeId };
}

export interface CsvRow { [k: string]: string }

// ── CSV import, phase 1: analyze (no writes) ────────────────────────────────
// Fuzzy-matches every row's name against existing employees (possible
// duplicate) and separately checks whether Company+Country / Position
// resolve to real master rows — without inserting anything. The review
// screen (employee-toolbar.tsx) uses this to let the user decide row by row
// instead of the old "silently reject the whole row" behavior.
export interface CsvDuplicateMatch { employeeId: number; name: string; positionTitle: string | null; bannerName: string | null; score: number }
export interface AnalyzedCsvRow {
    rowNo: number; // 1-based, header = row 1
    name: string;
    companyName: string;
    countryName: string;
    posTitle: string;
    status: string;
    date_of_birth: string;
    hire_date: string;
    position_effective_date: string;
    readiness_potential: string;
    invalidReason: string | null; // unfixable in the review screen (missing name, bad status) — always excluded
    duplicate: CsvDuplicateMatch | null;
    resolvedOfficeId: number | null;
    resolvedPositionId: number | null;
    resolvedBannerId: number | null; // set even when needsOffice (company matched, just missing this country) — lets the review screen quick-add a position under the right company before the office itself is resolved
    needsOffice: boolean; // company/country given but didn't resolve to an existing office
    needsPosition: boolean; // position given but didn't resolve to an existing one
}

export async function analyzeEmployeesCsv(rows: CsvRow[]): Promise<AnalyzedCsvRow[]> {
    const { findBestNameMatch } = await import("@/lib/fuzzy");
    const [banners, offices, positions, existingEmployees] = await Promise.all([
        query<any>(`select banner_id, name from banners`),
        query<any>(`select office_id, banner_id, country, city from banner_offices`),
        query<any>(`select position_id, title, function_id, banner_id from positions`),
        query<any>(`select employee_id, name, position_title, banner_id, status from employees where status <> 'Vacant'`),
    ]);
    const bannerByName = new Map<string, any>(banners.map((b) => [b.name.trim().toLowerCase(), b]));
    const bannerById = new Map<number, any>(banners.map((b) => [b.banner_id, b]));
    const officesByBanner = new Map<number, any[]>();
    offices.forEach((o) => { const a = officesByBanner.get(o.banner_id) || []; a.push(o); officesByBanner.set(o.banner_id, a); });
    // Positions are scoped per company now — keyed by banner_id + title so the
    // same title in two different companies resolves to the right one.
    const posByBannerTitle = new Map<string, any>(positions.map((p) => [`${p.banner_id}::${p.title.trim().toLowerCase()}`, p]));

    return rows.map((r, i): AnalyzedCsvRow => {
        const rowNo = i + 2;
        const get = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()] ?? "").toString().trim();
        const name = get("name");
        const companyName = get("company");
        const countryName = get("country");
        const posTitle = get("position");
        const status = get("status") || "Active";

        const base = {
            rowNo, name, companyName, countryName, posTitle, status,
            date_of_birth: get("date_of_birth"), hire_date: get("hire_date"),
            position_effective_date: get("position_effective_date"), readiness_potential: get("readiness_potential"),
        };
        if (!name) return { ...base, invalidReason: "Missing name", duplicate: null, resolvedOfficeId: null, resolvedPositionId: null, resolvedBannerId: null, needsOffice: false, needsPosition: false };
        if (!["Active", "Resigned"].includes(status)) return { ...base, invalidReason: `Invalid status "${status}" (Active|Resigned)`, duplicate: null, resolvedOfficeId: null, resolvedPositionId: null, resolvedBannerId: null, needsOffice: false, needsPosition: false };

        const banner = companyName ? bannerByName.get(companyName.toLowerCase()) : null;
        const office = banner && countryName ? officesByBanner.get(banner.banner_id)?.find((o: any) => o.country.toLowerCase() === countryName.toLowerCase()) : null;
        const pos = posTitle && banner ? posByBannerTitle.get(`${banner.banner_id}::${posTitle.toLowerCase()}`) : null;

        const best = findBestNameMatch(name, existingEmployees, (e: any) => e.name);
        const duplicate: CsvDuplicateMatch | null = best
            ? { employeeId: best.match.employee_id, name: best.match.name, positionTitle: best.match.position_title, bannerName: bannerById.get(best.match.banner_id)?.name ?? null, score: best.score }
            : null;

        return {
            ...base, invalidReason: null, duplicate,
            resolvedOfficeId: office?.office_id ?? null,
            resolvedPositionId: pos?.position_id ?? null,
            resolvedBannerId: banner?.banner_id ?? null,
            needsOffice: !!(companyName || countryName) && !office,
            needsPosition: !!posTitle && !pos,
        };
    });
}

// ── CSV import, phase 2: commit ─────────────────────────────────────────────
// Only rows the user explicitly kept after reviewing phase 1's analysis —
// office_id/position_id are already final here (either matched in phase 1 or
// quick-added client-side via createCompanyOffice/createPosition, same "+
// New" flow the Add Employee wizard uses).
export interface CommitCsvRow {
    name: string;
    office_id: number | null;
    position_id: number | null;
    status: string;
    date_of_birth: string | null;
    hire_date: string | null;
    position_effective_date: string | null;
    readiness_potential: string | null;
}
export interface CommitResult { ok: boolean; inserted: number; errors: { row: number; message: string }[] }

export async function commitEmployeesCsv(rows: CommitCsvRow[]): Promise<CommitResult> {
    if (rows.length === 0) return { ok: false, inserted: 0, errors: [] };
    const resolved = await Promise.all(rows.map((r) => resolveOfficePosition(r.office_id, r.position_id)));
    const payload = rows.map((r, i) => ({
        name: r.name,
        banner_id: resolved[i].banner_id,
        office_id: r.office_id,
        position_id: r.position_id,
        position_title: resolved[i].position_title,
        function_id: resolved[i].function_id,
        country: resolved[i].country,
        city: resolved[i].city,
        nationality: resolved[i].country,
        date_of_birth: r.date_of_birth || null,
        hire_date: r.hire_date || null,
        position_effective_date: r.position_effective_date || r.hire_date || null,
        status: r.status,
        readiness_potential: r.readiness_potential || null,
    }));

    // The employees / employee_positions / org_edges inserts below must all
    // succeed or all fail together — previously each ran as its own
    // auto-committed statement, so a failure partway through (as the
    // is_primary bug below used to cause on every single import) left a
    // ghost employee row with no position/org placement, silently different
    // from a clean failure and indistinguishable from a real duplicate on
    // the next retry.
    try {
        const result = await withTransaction(async (client) => {
            const empValueRows = payload.map((p) => [
                p.name, p.banner_id, p.office_id, p.position_id, p.position_title, p.function_id, p.country, p.city,
                p.nationality, p.date_of_birth, p.hire_date, p.position_effective_date, p.status, p.readiness_potential,
            ]);
            const { placeholders: empPlaceholders, params: empParams } = buildValuesRows(empValueRows);
            const empRows = await client.query<{ employee_id: number }>(
                `insert into employees
                    (name, banner_id, office_id, position_id, position_title, function_id, country, city, nationality,
                     date_of_birth, hire_date, position_effective_date, status, readiness_potential)
                 values ${empPlaceholders} returning employee_id`,
                empParams
            );

            // Every imported employee needs a primary employee_positions row (see
            // migration 026) before org_edges can be wired up — insert() preserves
            // row order, so `empRows[i]` lines up with `payload[i]` here exactly
            // like `resolved[i]` did above.
            const positionsPayload = empRows.map((e, i) => ({
                employee_id: e.employee_id,
                position_title: payload[i].position_title || "Unknown",
                function_id: payload[i].function_id,
                banner_id: payload[i].banner_id,
                office_id: payload[i].office_id,
            }));

            let insertedPositions: { employee_position_id: number }[] = [];
            if (positionsPayload.length) {
                // 1, not `true` — SQLite can only bind numbers/strings/
                // bigints/buffers/null, never a JS boolean, and this row goes
                // through buildValuesRows so it's a bound param, not literal SQL text.
                const posValueRows = positionsPayload.map((p) => [p.employee_id, p.position_title, p.function_id, p.banner_id, p.office_id, 1]);
                const { placeholders, params } = buildValuesRows(posValueRows);
                insertedPositions = await client.query<{ employee_position_id: number }>(
                    `insert into employee_positions (employee_id, position_title, function_id, banner_id, office_id, is_primary)
                     values ${placeholders} returning employee_position_id`,
                    params
                );
            }

            // Same as the old single-shot import: no manager column in a CSV, so
            // everyone lands at the top of each tree (NULL parent) rather than
            // nowhere at all — visible on the org charts, re-pointable afterward.
            const now = new Date().toISOString();
            const edgeRows = insertedPositions.flatMap((p) =>
                (["banner", "function", "headcount"] as const).map((dimension) => [p.employee_position_id, dimension, now])
            );
            if (edgeRows.length) {
                const { placeholders, params } = buildValuesRows(edgeRows);
                await client.query(`insert into org_edges (employee_position_id, dimension, updated_at) values ${placeholders}`, params);
            }

            return payload.length;
        });

        revalidatePath("/employees");
        revalidatePath("/org/banner");
        revalidatePath("/org/function");
        revalidatePath("/org/headcount");
        return { ok: true, inserted: result, errors: [] };
    } catch (err: any) {
        return { ok: false, inserted: 0, errors: [{ row: 0, message: err.message }] };
    }
}

export interface PersonalEmploymentInput {
    date_of_birth: string | null;
    hire_date: string | null;
    position_effective_date: string | null;
    nationality: string | null;
    gender: string | null;
    job_grade: string | null;
    // Retirement age varies by country, so it's entered per employee rather
    // than assumed — undefined = "not included in this save" (leave as-is),
    // distinct from null ("clear it"), so callers without visibility can omit
    // it entirely instead of accidentally wiping it.
    retirement_age?: number | null;
}

// Editable "personal" attributes only — country/city/position/banner are
// derived from the employee's office/position assignment (an org-chart move,
// not a profile edit) and stay read-only on this form.
export async function updateEmployeePersonal(employeeId: number, input: PersonalEmploymentInput): Promise<{ ok: boolean; error?: string }> {
    // Retirement age is a sensitive field in its own right — only accept a
    // change to it from someone who can currently see it (defense in depth;
    // the edit UI already hides the input for everyone else).
    let includeRetirement = false;
    if (input.retirement_age !== undefined) {
        if (!canSeePersonal(await getCurrentUser())) {
            return { ok: false, error: "You don't have permission to edit retirement age." };
        }
        includeRetirement = true;
    }
    try {
        if (includeRetirement) {
            await query(
                `update employees set date_of_birth=$1, hire_date=$2, position_effective_date=$3, nationality=$4, gender=$5, job_grade=$6, retirement_age=$7, updated_at=CURRENT_TIMESTAMP
                 where employee_id=$8`,
                [input.date_of_birth || null, input.hire_date || null, input.position_effective_date || null,
                 input.nationality?.trim() || null, input.gender || null, input.job_grade?.trim() || null,
                 input.retirement_age, employeeId]
            );
        } else {
            await query(
                `update employees set date_of_birth=$1, hire_date=$2, position_effective_date=$3, nationality=$4, gender=$5, job_grade=$6, updated_at=CURRENT_TIMESTAMP
                 where employee_id=$7`,
                [input.date_of_birth || null, input.hire_date || null, input.position_effective_date || null,
                 input.nationality?.trim() || null, input.gender || null, input.job_grade?.trim() || null, employeeId]
            );
        }
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export interface EmployeeStatusInput {
    status: "Active" | "Resigned";
    resign_date: string | null;
    resignation_reason: string | null;
}

// Resigning clears nothing on its own — comp/org placement/etc. all stay as
// historical record. resign_date/resignation_reason are only meaningful for
// Resigned, but writing them as null on a re-activate (rehire) is deliberate:
// a fresh resignation later shouldn't inherit a stale prior reason/date.
export async function updateEmployeeStatus(employeeId: number, input: EmployeeStatusInput): Promise<{ ok: boolean; error?: string }> {
    if (input.status === "Resigned" && !input.resign_date) {
        return { ok: false, error: "Effective date is required when marking someone as resigned." };
    }
    try {
        await query(
            `update employees set status = $1, resign_date = $2, resignation_reason = $3, updated_at = CURRENT_TIMESTAMP where employee_id = $4`,
            [
                input.status,
                input.status === "Resigned" ? input.resign_date : null,
                input.status === "Resigned" ? (input.resignation_reason?.trim() || null) : null,
                employeeId,
            ]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath("/employees");
    return { ok: true };
}

// Free-form planning tag (src/lib/tag-colors.ts) — no HR meaning, so no
// permission gate: anyone who can see the org chart can mark it up.
export async function setEmployeeTagColor(employeeId: number, tagColor: string | null): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update employees set tag_color = $1, updated_at = CURRENT_TIMESTAMP where employee_id = $2`, [tagColor, employeeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true };
}

export interface CompensationInput {
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
}

// Total Compensation is always derived (base + STI target + LTI target + other
// bonus — the same "D8" formula used app-wide, e.g. comparison_v2's scenarioTotalOf),
// never a freely-typed field, so it can never drift from the line items.
export async function updateEmployeeCompensation(employeeId: number, input: CompensationInput): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    const total_compensation = (input.base_salary ?? 0) + (input.sti_target ?? 0) + (input.lti_target ?? 0) + (input.other_bonus ?? 0);
    try {
        await query(
            `insert into employee_compensation
                (employee_id, currency, base_salary, sti_target, sti_max, lti_target, lti_max, other_bonus,
                 allowance_company_car, allowance_mobility, allowance_home_office, allowance_private_medical,
                 allowance_family_cover, total_compensation, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, CURRENT_TIMESTAMP)
             on conflict (employee_id) do update set
                currency = excluded.currency,
                base_salary = excluded.base_salary,
                sti_target = excluded.sti_target,
                sti_max = excluded.sti_max,
                lti_target = excluded.lti_target,
                lti_max = excluded.lti_max,
                other_bonus = excluded.other_bonus,
                allowance_company_car = excluded.allowance_company_car,
                allowance_mobility = excluded.allowance_mobility,
                allowance_home_office = excluded.allowance_home_office,
                allowance_private_medical = excluded.allowance_private_medical,
                allowance_family_cover = excluded.allowance_family_cover,
                total_compensation = excluded.total_compensation,
                updated_at = excluded.updated_at`,
            [employeeId, input.currency || "EUR", encryptAmount(input.base_salary), encryptAmount(input.sti_target), encryptAmount(input.sti_max), encryptAmount(input.lti_target), encryptAmount(input.lti_max),
             encryptAmount(input.other_bonus), input.allowance_company_car, input.allowance_mobility, input.allowance_home_office,
             input.allowance_private_medical, input.allowance_family_cover, encryptAmount(total_compensation)]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Background (education / experience / certification / strength /
//    development area) ──────────────────────────────────────────────────
// createEmployeeFull's onboarding wizard bulk-inserts these at creation
// time, but there was no way to add, edit, or remove one afterward — the
// Background card on the profile was read-only.
export interface EmployeeBackgroundInput {
    type: string; // 'education' | 'experience' | 'certification' | 'strength' | 'development_area' — free text, not a DB enum
    title: string;
    organization: string | null;
    detail: string | null;
}

export async function createBackground(employeeId: number, input: EmployeeBackgroundInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    try {
        await query(
            `insert into employee_background (employee_id, type, title, organization, detail) values ($1,$2,$3,$4,$5)`,
            [employeeId, input.type, input.title.trim(), input.organization?.trim() || null, input.detail?.trim() || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateBackground(id: number, employeeId: number, input: EmployeeBackgroundInput): Promise<{ ok: boolean; error?: string }> {
    if (!input.title?.trim()) return { ok: false, error: "Title is required" };
    try {
        await query(
            `update employee_background set type = $1, title = $2, organization = $3, detail = $4 where id = $5`,
            [input.type, input.title.trim(), input.organization?.trim() || null, input.detail?.trim() || null, id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteBackground(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_background where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Delete ──────────────────────────────────────────────────────────────
// There was previously no way to remove a single employee record at all
// (only scripts/wipe_sample_employees.mjs, which clears everyone at once) —
// this fills that gap, e.g. for cleaning up a duplicate created by a
// mis-clicked or retried CSV import.
//
// Most child tables have `ON DELETE CASCADE` on their employee_id FK and
// clean up automatically once the `employees` row itself is deleted
// (employee_positions -> org_edges, employee_targets, document_folders,
// employee_documents; departments.owner_employee_id goes to NULL). The
// tables/columns below don't cascade and would otherwise block the delete
// with a foreign-key error, so they're handled explicitly, in an order that
// respects the remaining FKs: references FROM other people TO this one are
// cleared first (so nobody else's data gets swept away), this person's own
// records are deleted next, and the employees row goes last.
export async function deleteEmployee(employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await withTransaction(async (client) => {
            // Someone else's mentor / office head / proposed new manager —
            // clear the reference rather than touching their data.
            await client.query(`update employees set mentor_employee_id = NULL where mentor_employee_id = $1`, [employeeId]);
            await client.query(`update banner_offices set country_head_id = NULL where country_head_id = $1`, [employeeId]);
            await client.query(`update functions set global_head_id = NULL where global_head_id = $1`, [employeeId]);
            await client.query(`update salary_proposals set new_manager_id = NULL where new_manager_id = $1`, [employeeId]);
            // A position this person held may be someone else's reporting-line
            // parent on the org chart — clear it so their reports become
            // unplaced instead of the delete failing outright.
            await client.query(
                `update org_edges set parent_employee_position_id = NULL
                 where parent_employee_position_id in (select employee_position_id from employee_positions where employee_id = $1)`,
                [employeeId]
            );
            // A candidacy or "current incumbent" without the person behind it
            // isn't meaningful — drop the candidacy (attributes cascade with
            // it), clear the seat's incumbent but keep the seat itself.
            await client.query(`delete from succession_candidates where candidate_employee_id = $1`, [employeeId]);
            await client.query(`update succession_seats set employee_id = NULL where employee_id = $1`, [employeeId]);
            // This person referenced as a benchmark peer inside someone ELSE's
            // proposal (a different proposal_id than any of their own below).
            await client.query(`delete from salary_proposal_comparisons where employee_id = $1`, [employeeId]);
            await client.query(`delete from salary_proposal_whatifs where base_employee_id = $1`, [employeeId]);
            // Their own proposals — compensation/comparisons/whatifs/assessments
            // for THESE proposal_ids cascade automatically.
            await client.query(`delete from salary_proposals where employee_id = $1`, [employeeId]);

            const ownedTables = [
                "employee_scores", "employee_compensation", "compensation_history",
                "performance_grades", "employment_history", "employee_background", "employee_insights",
                "employee_development_plans", "employee_achievements", "employee_periodic_assessments",
                "employee_competencies", "employee_career_steps",
            ];
            for (const table of ownedTables) {
                await client.query(`delete from ${table} where employee_id = $1`, [employeeId]);
            }

            await client.query(`delete from employees where employee_id = $1`, [employeeId]);
        });
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    revalidatePath("/org/succession");
    return { ok: true };
}
