"use server";

// Importer for the "Individual Profile" Excel template (see the file sent to
// HR banners — Instructions / Employees / Work Experience tabs). A separate
// pipeline from the existing CSV import (employee-crud.ts's
// analyzeEmployeesCsv/commitEmployeesCsv): different file format (.xlsx,
// parsed server-side with exceljs — never trust a client-side parse of an
// untrusted upload), richer per-person fields (compensation), and a second,
// one-to-many sheet (work experience) that has to be matched back to the
// first sheet by name before any of it means anything.
//
// Follows the same two-phase analyze -> review -> commit shape as the CSV
// importer, and the same philosophy: nothing is silently dropped or
// silently guessed. Anything that doesn't resolve cleanly (unmatched
// company/position, a likely-duplicate name, a Work Experience row whose
// name doesn't match anyone on the Employees tab) is surfaced for a human
// to decide, never auto-resolved.

import ExcelJS from "exceljs";
import { query, queryOne, withTransaction } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { encryptAmount } from "@/lib/crypto";
import { findBestNameMatch } from "@/lib/fuzzy";

// ── Cell parsing helpers — exceljs hands back strings, numbers, Dates (if
// Excel auto-detected a typed date), or rich-text objects depending on how
// the user actually typed into the cell, never just one consistent shape. ──
function cellToString(v: ExcelJS.CellValue): string {
    if (v == null) return "";
    if (typeof v === "object") {
        if ("richText" in v && Array.isArray((v as any).richText)) return (v as any).richText.map((p: any) => p.text).join("");
        if ("text" in v) return String((v as any).text);
        if (v instanceof Date) return formatDate(v);
        if ("result" in v) return String((v as any).result ?? ""); // formula cell
    }
    return String(v).trim();
}
function formatDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function cellToDateString(v: ExcelJS.CellValue): string | null {
    if (v == null) return null;
    if (v instanceof Date) return formatDate(v);
    const s = cellToString(v).trim();
    return s || null;
}
function cellToNumber(v: ExcelJS.CellValue): number | null {
    const s = cellToString(v).trim();
    if (!s) return null;
    const n = Number(s.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}
function norm(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}
// employees.gender has a CHECK (Male|Female|Other|NULL) — the template's
// dropdown also offers "Prefer not to say" (non-blocking, so free typing is
// possible too), either of which would violate the constraint and crash the
// insert. Anything else unrecognized is dropped to NULL rather than guessed.
function normalizeGender(g: string): string | null {
    return ["Male", "Female", "Other"].includes(g) ? g : null;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface ProfileExperienceRow {
    company: string;
    position: string;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    // Only meaningful when the owning row is a confirmed re-import of an
    // existing employee (sameAsEmployeeId) — true means this exact entry is
    // already in employment_history for them, so committing it again would
    // duplicate it. Always false for a brand-new person (nothing to compare
    // against yet).
    alreadyExists: boolean;
}

export interface ProfileDuplicateMatch { employeeId: number; name: string; positionTitle: string | null; bannerName: string | null; score: number }

export interface AnalyzedProfileEmployee {
    rowNo: number; // Employees-tab row number, for messages
    name: string;
    companyName: string;
    countryName: string;
    city: string;
    posTitle: string;
    function: string;
    jobGrade: string;
    managerName: string;
    dateOfBirth: string | null;
    gender: string;
    nationality: string;
    hireDate: string | null;
    positionEffectiveDate: string | null;
    status: string;
    resignDate: string | null;
    resignationReason: string;
    readiness: string;
    currency: string;
    baseSalary: number | null;
    stiTargetPct: number | null;
    ltiTargetPct: number | null;
    otherBonus: number | null;
    allowanceCar: number | null;
    allowanceMobility: number | null;
    allowanceHomeOffice: number | null;
    allowancePrivateMedical: number | null;
    otherBenefit: string;
    experience: ProfileExperienceRow[];
    invalidReason: string | null;
    duplicate: ProfileDuplicateMatch | null;
    // Set when this row's name matches an existing employee EXACTLY and
    // their current Company + Position also match what's in the file —
    // confident enough to treat as a re-export of the same person rather
    // than a possible-duplicate that needs a human call. When set, nothing
    // about the existing employee record is touched except adding any
    // genuinely new rows from `experience` (see alreadyExists above) —
    // never their core profile, status, or compensation, even if the file
    // carries different values for those.
    sameAsEmployeeId: number | null;
    resolvedOfficeId: number | null;
    resolvedPositionId: number | null;
    resolvedBannerId: number | null;
    resolvedFunctionId: number | null;
    needsOffice: boolean;
    needsPosition: boolean;
}

export interface OrphanExperienceRow { rowNo: number; employeeName: string; company: string; position: string }

export interface AnalyzeProfileImportResult {
    ok: boolean;
    error?: string;
    employees: AnalyzedProfileEmployee[];
    orphanExperience: OrphanExperienceRow[];
}

// A row's values exactly matching the template's own filled-in example —
// excluded automatically so forgetting to delete it before sending doesn't
// import a fictional "Jane Doe".
function isEmployeeExampleRow(name: string, company: string, position: string): boolean {
    return norm(name) === "jane doe" && norm(company) === "selfridges" && norm(position) === "marketing manager";
}
function isExperienceExampleRow(name: string, company: string): boolean {
    return norm(name) === "jane doe" && (norm(company) === "tesco" || norm(company) === "unilever");
}

export async function analyzeProfileImport(formData: FormData): Promise<AnalyzeProfileImportResult> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided", employees: [], orphanExperience: [] };

    const workbook = new ExcelJS.Workbook();
    try {
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer as any);
    } catch (err: any) {
        return { ok: false, error: "Could not read this file — is it the .xlsx template?", employees: [], orphanExperience: [] };
    }

    const empSheet = workbook.getWorksheet("Employees");
    const expSheet = workbook.getWorksheet("Work Experience");
    if (!empSheet) return { ok: false, error: "No 'Employees' tab found in this file", employees: [], orphanExperience: [] };

    const [banners, offices, positions, existingEmployees, existingHistory] = await Promise.all([
        query<any>(`select banner_id, name from banners`),
        query<any>(`select office_id, banner_id, country, city from banner_offices`),
        query<any>(`select position_id, title, function_id, banner_id from positions`),
        query<any>(`select employee_id, name, position_title, banner_id, status from employees where status <> 'Vacant'`),
        query<any>(`select employee_id, banner, position, start_date from employment_history`),
    ]);
    const bannerByName = new Map<string, any>(banners.map((b) => [norm(b.name), b]));
    const bannerById = new Map<number, any>(banners.map((b) => [b.banner_id, b]));
    const officesByBanner = new Map<number, any[]>();
    offices.forEach((o) => { const a = officesByBanner.get(o.banner_id) || []; a.push(o); officesByBanner.set(o.banner_id, a); });
    const posByBannerTitle = new Map<string, any>(positions.map((p) => [`${p.banner_id}::${norm(p.title)}`, p]));

    // Same dedup key used below when checking whether an incoming Work
    // Experience row is already recorded for a confirmed-same-person match.
    const historyKey = (banner: string | null, position: string | null, start: string | null) =>
        `${norm(banner || "")}::${norm(position || "")}::${(start || "").slice(0, 10)}`;
    const historyByEmployee = new Map<number, Set<string>>();
    existingHistory.forEach((h) => {
        const set = historyByEmployee.get(h.employee_id) || new Set<string>();
        set.add(historyKey(h.banner, h.position, h.start_date));
        historyByEmployee.set(h.employee_id, set);
    });

    const employees: AnalyzedProfileEmployee[] = [];
    let rowNo = 0;
    empSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // header
        rowNo = rowNumber;
        const get = (col: number) => row.getCell(col);
        const name = cellToString(get(1).value);
        const companyName = cellToString(get(2).value);
        const posTitle = cellToString(get(5).value);
        if (!name && !companyName && !posTitle) return; // fully blank row
        if (isEmployeeExampleRow(name, companyName, posTitle)) return; // template's own sample row

        const countryName = cellToString(get(3).value);
        const city = cellToString(get(4).value);
        const status = cellToString(get(14).value) || "Active";

        let invalidReason: string | null = null;
        if (!name) invalidReason = "Missing name";
        else if (!companyName) invalidReason = "Missing company";
        else if (!posTitle) invalidReason = "Missing position title";
        else if (!["Active", "Resigned"].includes(status)) invalidReason = `Invalid status "${status}" (Active|Resigned)`;

        const banner = companyName ? bannerByName.get(norm(companyName)) : null;
        const office = banner && countryName ? officesByBanner.get(banner.banner_id)?.find((o: any) => norm(o.country) === norm(countryName)) : null;
        const pos = posTitle && banner ? posByBannerTitle.get(`${banner.banner_id}::${norm(posTitle)}`) : null;
        const best = name ? findBestNameMatch(name, existingEmployees, (e: any) => e.name) : null;

        // Confident "this is the same person, not just a similar name" check:
        // exact name match (not just above the fuzzy threshold) AND their
        // current Company + Position in the system match the file. Anything
        // less certain stays a human-reviewed "possible duplicate" below —
        // getting this wrong either merges two different people's history
        // together, or nags the user on every routine re-export.
        let sameAsEmployeeId: number | null = null;
        if (best && norm(name) === norm(best.match.name) && banner && best.match.banner_id === banner.banner_id && norm(best.match.position_title || "") === norm(posTitle)) {
            sameAsEmployeeId = best.match.employee_id;
        }
        const duplicate: ProfileDuplicateMatch | null = best && !sameAsEmployeeId
            ? { employeeId: best.match.employee_id, name: best.match.name, positionTitle: best.match.position_title, bannerName: bannerById.get(best.match.banner_id)?.name ?? null, score: best.score }
            : null;

        employees.push({
            rowNo, name, companyName, countryName, city, posTitle,
            function: cellToString(get(6).value),
            jobGrade: cellToString(get(7).value),
            managerName: cellToString(get(8).value),
            dateOfBirth: cellToDateString(get(9).value),
            gender: cellToString(get(10).value),
            nationality: cellToString(get(11).value),
            hireDate: cellToDateString(get(12).value),
            positionEffectiveDate: cellToDateString(get(13).value),
            status,
            resignDate: cellToDateString(get(15).value),
            resignationReason: cellToString(get(16).value),
            readiness: cellToString(get(17).value),
            currency: cellToString(get(18).value) || "EUR",
            baseSalary: cellToNumber(get(19).value),
            stiTargetPct: cellToNumber(get(20).value),
            ltiTargetPct: cellToNumber(get(21).value),
            otherBonus: cellToNumber(get(22).value),
            allowanceCar: cellToNumber(get(23).value),
            allowanceMobility: cellToNumber(get(24).value),
            allowanceHomeOffice: cellToNumber(get(25).value),
            allowancePrivateMedical: cellToNumber(get(26).value),
            otherBenefit: cellToString(get(27).value),
            experience: [],
            invalidReason,
            duplicate,
            sameAsEmployeeId,
            resolvedOfficeId: office?.office_id ?? null,
            resolvedPositionId: pos?.position_id ?? null,
            resolvedBannerId: banner?.banner_id ?? null,
            resolvedFunctionId: pos?.function_id ?? null,
            // A confirmed-same-person row never creates anything, so it never
            // needs a resolved office/position — only new people do.
            needsOffice: !invalidReason && !sameAsEmployeeId && !!(companyName || countryName) && !office,
            needsPosition: !invalidReason && !sameAsEmployeeId && !!posTitle && !pos,
        });
    });

    // Match Work Experience rows back to an Employees-tab row by exact
    // (trimmed, case-insensitive) name — reliable because the template's
    // "Employee Name" column is a dropdown sourced from the Employees tab,
    // so a name typed through it can't drift from the Employees tab's spelling.
    const byName = new Map<string, AnalyzedProfileEmployee>();
    for (const e of employees) if (e.name) byName.set(norm(e.name), e);
    const orphanExperience: OrphanExperienceRow[] = [];

    if (expSheet) {
        expSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const get = (col: number) => row.getCell(col);
            const empName = cellToString(get(1).value);
            const company = cellToString(get(2).value);
            const position = cellToString(get(3).value);
            if (!empName && !company && !position) return;
            if (isExperienceExampleRow(empName, company)) return;

            const owner = empName ? byName.get(norm(empName)) : null;
            if (!owner) {
                orphanExperience.push({ rowNo: rowNumber, employeeName: empName, company, position });
                return;
            }
            const start_date = cellToDateString(get(5).value);
            const alreadyExists = owner.sameAsEmployeeId != null
                && (historyByEmployee.get(owner.sameAsEmployeeId)?.has(historyKey(company, position, start_date)) ?? false);
            owner.experience.push({
                company, position,
                location: cellToString(get(4).value) || null,
                start_date,
                end_date: cellToDateString(get(6).value),
                is_current: norm(cellToString(get(7).value)) === "y",
                alreadyExists,
            });
        });
    }

    return { ok: true, employees, orphanExperience };
}

// ── Commit ───────────────────────────────────────────────────────────────

export interface CommitProfileEmployee {
    name: string;
    office_id: number | null;
    position_id: number | null;
    function_id: number | null;
    banner_id: number | null;
    status: string;
    date_of_birth: string | null;
    gender: string | null;
    nationality: string | null;
    job_grade: string | null;
    hire_date: string | null;
    position_effective_date: string | null;
    resign_date: string | null;
    resignation_reason: string | null;
    readiness_potential: string | null;
    currency: string;
    base_salary: number | null;
    sti_target_pct: number | null;
    lti_target_pct: number | null;
    other_bonus: number | null;
    allowance_car: number | null;
    allowance_mobility: number | null;
    allowance_home_office: number | null;
    allowance_private_medical: number | null;
    experience: ProfileExperienceRow[];
}

// A row recognized as a re-export of someone already in the system (see
// sameAsEmployeeId) — commits ONLY the new-to-them experience rows against
// their existing employee_id. Never touches their core profile, status, or
// compensation, even if the file carries different values for those: a
// routine re-export shouldn't silently overwrite anything hand-edited since.
export interface MergeExperienceInput {
    employeeId: number;
    name: string;
    experience: ProfileExperienceRow[]; // already filtered to alreadyExists === false by the caller
}

export interface ProfileImportSummary {
    ok: boolean;
    employeesCreated: number;
    employeesUpdated: number;
    experienceRowsCreated: number;
    compensationRecordsCreated: number;
    errors: { name: string; message: string }[];
}

export async function commitProfileImport(rows: CommitProfileEmployee[], merges: MergeExperienceInput[] = []): Promise<ProfileImportSummary> {
    if (rows.length === 0 && merges.length === 0) {
        return { ok: false, employeesCreated: 0, employeesUpdated: 0, experienceRowsCreated: 0, compensationRecordsCreated: 0, errors: [] };
    }

    let experienceRowsCreated = 0;
    let compensationRecordsCreated = 0;
    let employeesUpdated = 0;

    try {
        await withTransaction(async (client) => {
            for (const r of rows) {
                const position_title = r.position_id
                    ? ((await client.query<{ title: string }>(`select title from positions where position_id = $1`, [r.position_id]))[0]?.title ?? "Unknown")
                    : "Unknown";

                const created = await client.query<{ employee_id: number }>(
                    `insert into employees
                        (name, banner_id, office_id, position_id, position_title, function_id, country, city, nationality,
                         gender, job_grade, date_of_birth, hire_date, position_effective_date, status, resign_date, resignation_reason, readiness_potential)
                     values ($1,$2,$3,$4,$5,$6,
                        (select country from banner_offices where office_id = $3),
                        (select city from banner_offices where office_id = $3),
                        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                     returning employee_id`,
                    [
                        r.name, r.banner_id, r.office_id, r.position_id, position_title, r.function_id,
                        r.nationality, normalizeGender(r.gender || ""), r.job_grade, r.date_of_birth, r.hire_date,
                        r.position_effective_date || r.hire_date, r.status, r.resign_date, r.resignation_reason, r.readiness_potential,
                    ]
                );
                const employeeId = created[0].employee_id;

                const pos = await client.query<{ employee_position_id: number }>(
                    `insert into employee_positions (employee_id, position_title, function_id, banner_id, office_id, is_primary)
                     values ($1,$2,$3,$4,$5,1) returning employee_position_id`,
                    [employeeId, position_title, r.function_id, r.banner_id, r.office_id]
                );
                await client.query(
                    `insert into org_edges (employee_position_id, dimension) values ($1,'banner'), ($1,'function'), ($1,'headcount')`,
                    [pos[0].employee_position_id]
                );

                if (r.base_salary != null || r.sti_target_pct != null || r.lti_target_pct != null || r.other_bonus != null) {
                    const stiTarget = r.base_salary != null && r.sti_target_pct != null ? Math.round((r.base_salary * r.sti_target_pct) / 100) : null;
                    const ltiTarget = r.base_salary != null && r.lti_target_pct != null ? Math.round((r.base_salary * r.lti_target_pct) / 100) : null;
                    const total = (r.base_salary ?? 0) + (stiTarget ?? 0) + (ltiTarget ?? 0) + (r.other_bonus ?? 0);
                    await client.query(
                        `insert into employee_compensation
                            (employee_id, currency, base_salary, sti_target, lti_target, other_bonus,
                             allowance_company_car, allowance_mobility, allowance_home_office, allowance_private_medical, total_compensation)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                        [
                            employeeId, r.currency || "EUR", encryptAmount(r.base_salary), encryptAmount(stiTarget), encryptAmount(ltiTarget), encryptAmount(r.other_bonus),
                            r.allowance_car, r.allowance_mobility, r.allowance_home_office, r.allowance_private_medical, encryptAmount(total),
                        ]
                    );
                    compensationRecordsCreated++;
                }

                for (const h of r.experience) {
                    if (!h.company && !h.position) continue;
                    await client.query(
                        `insert into employment_history (employee_id, banner, position, location, start_date, end_date, is_current) values ($1,$2,$3,$4,$5,$6,$7)`,
                        [employeeId, h.company, h.position, h.location, h.start_date, h.is_current ? null : h.end_date, h.is_current ? 1 : 0]
                    );
                    experienceRowsCreated++;
                }
            }

            for (const m of merges) {
                let added = 0;
                for (const h of m.experience) {
                    if (!h.company && !h.position) continue;
                    await client.query(
                        `insert into employment_history (employee_id, banner, position, location, start_date, end_date, is_current) values ($1,$2,$3,$4,$5,$6,$7)`,
                        [m.employeeId, h.company, h.position, h.location, h.start_date, h.is_current ? null : h.end_date, h.is_current ? 1 : 0]
                    );
                    experienceRowsCreated++;
                    added++;
                }
                if (added > 0) employeesUpdated++;
            }
        });
    } catch (err: any) {
        return { ok: false, employeesCreated: 0, employeesUpdated: 0, experienceRowsCreated: 0, compensationRecordsCreated: 0, errors: [{ name: "—", message: err.message }] };
    }

    revalidatePath("/employees");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
    return { ok: true, employeesCreated: rows.length, employeesUpdated, experienceRowsCreated, compensationRecordsCreated, errors: [] };
}
