"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getEmployee, type EmployeeDetail, type Compensation } from "./employees";
import { compensationOnly } from "@/lib/format";
import { requireCompEditor, canSeeComp } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decryptProposalCompensation, encryptProposalCompensation, encryptWhatifCompensation, decryptWhatifCompensation } from "@/lib/compensation-crypto";

export interface ProposalListItem {
    proposal_id: number;
    employee_id: number;
    employee_name: string;
    position_title: string | null;
    banner_name: string | null;
    status: "draft" | "submitted" | "approved";
    effective_date: string | null;
    target_fiscal_year: number | null;
    updated_at: string;
}

export interface ProposalRow {
    proposal_id: number;
    employee_id: number;
    status: "draft" | "submitted" | "approved";
    approval_new_role: boolean;
    approval_comp_adjustment: boolean;
    approval_other_label: string | null;
    new_position_id: number | null;
    new_manager_id: number | null;
    effective_date: string | null;
    justification: string | null;
    role_description: string | null;
    target_fiscal_year: number | null;
    created_at: string;
    updated_at: string;
    // Who last clicked "Save" on the Comparison tab, and when — the board
    // itself (peers + what-ifs + order) is saved explicitly, not auto-persisted.
    board_updated_by: string | null;
    board_updated_at: string | null;
}

export interface ProposalCompensation {
    proposal_id: number;
    currency: string;
    base_salary: number | null;
    cash_allowance: number | null;
    sti_eligible_pct: number | null;
    sti_amount: number | null;
    lti_eligible_pct: number | null;
    lti_amount: number | null;
    pension_contribution: number | null;
    other_items: string | null;
    other_remarks: string | null;
}

// One column of the salary-review table (a historical fiscal year, the
// current year, or — with proposed=true — the "Propose" column).
export interface SalaryReviewColumn {
    fiscal_year: number | null;
    label: string;
    banner: string | null;
    role: string | null;
    effective: string | null;
    base_salary: number | null;
    cash_allowance: number | null;
    guaranteed_cash: number | null;
    sti_eligible_pct: number | null;
    sti_actual_pct?: number | null;
    sti_amount: number | null;
    lti_eligible_pct: number | null;
    lti_actual_pct?: number | null;
    lti_amount: number | null;
    total_comp: number | null;
    pension_contribution: number | null;
    other_items: string | null;
    other_remarks: string | null;
    proposed?: boolean;
}

export interface ProposalDetail {
    proposal: ProposalRow;
    compensation: ProposalCompensation;
    employee: EmployeeDetail;
    positions: { position_id: number; title: string; jd_content: string | null; jd_pdf_url: string | null }[];
    employees: { employee_id: number; name: string }[];
    historyColumns: SalaryReviewColumn[]; // past fiscal years + current, oldest first
}

function guaranteedCash(base: number | null, allowance: number | null) {
    return (base ?? 0) + (allowance ?? 0);
}
// D8: Total Comp = Base + STI + LTI (no allowance) — same formula used app-wide.
function totalComp(base: number | null, sti: number | null, lti: number | null) {
    return (base ?? 0) + (sti ?? 0) + (lti ?? 0);
}

// Which employment_history stint (banner/position) was active on a given date.
function roleAt(dateStr: string | null, employmentHistory: any[]): { banner: string | null; role: string | null } {
    if (!employmentHistory?.length) return { banner: null, role: null };
    const date = dateStr ? new Date(dateStr) : new Date();
    const candidates = employmentHistory.filter((h) => {
        const start = h.start_date ? new Date(h.start_date) : null;
        const end = h.end_date ? new Date(h.end_date) : null;
        return (!start || start <= date) && (!end || end >= date);
    });
    const best = candidates.sort((a, b) => new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime())[0];
    return best ? { banner: best.banner ?? null, role: best.position ?? null } : { banner: null, role: null };
}

// Builds `col1 = $n, col2 = $n+1, ...` plus the matching param array from a
// partial patch object.
function buildSet(patch: Record<string, unknown>, startAt: number): { clause: string; params: unknown[] } {
    const keys = Object.keys(patch);
    const clause = keys.map((k, i) => `${k} = $${startAt + i}`).join(", ");
    return { clause, params: keys.map((k) => patch[k]) };
}

export async function listProposals(): Promise<ProposalListItem[]> {
    const rows = await query<any>(`
        select
            p.proposal_id, p.employee_id, p.status, p.effective_date, p.target_fiscal_year, p.updated_at,
            coalesce(e.name, '—') as employee_name,
            e.position_title,
            b.name as banner_name
        from salary_proposals p
        left join employees e on e.employee_id = p.employee_id
        left join banners b on b.banner_id = e.banner_id
        order by p.updated_at desc
    `);
    return rows;
}

export async function createProposal(employeeId: number): Promise<{ ok: boolean; error?: string; id?: number }> {
    const targetYear = new Date().getFullYear() + 1;
    try {
        const row = await queryOne<{ proposal_id: number }>(
            `insert into salary_proposals (employee_id, target_fiscal_year) values ($1, $2) returning proposal_id`,
            [employeeId, targetYear]
        );
        if (!row) return { ok: false, error: "Could not create proposal" };
        await query(`insert into salary_proposal_compensation (proposal_id) values ($1)`, [row.proposal_id]);
        revalidatePath("/proposals");
        return { ok: true, id: row.proposal_id };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function getProposal(id: number): Promise<ProposalDetail | null> {
    const [proposal, compensationRow, employees] = await Promise.all([
        queryOne<any>(`select * from salary_proposals where proposal_id = $1`, [id]),
        queryOne<any>(`select * from salary_proposal_compensation where proposal_id = $1`, [id]),
        query<{ employee_id: number; name: string }>(`select employee_id, name from employees order by name`),
    ]);
    if (!proposal) return null;
    const compensation = compensationRow ? decryptProposalCompensation(compensationRow) : compensationRow;
    const employee = await getEmployee(proposal.employee_id);
    if (!employee) return null;
    // "New Position" only makes sense within the employee's own company —
    // positions are scoped per banner now, so a company-wide list would show
    // duplicate titles from every other company too.
    const positions = await query<any>(
        `select position_id, title, jd_content, jd_pdf_url from positions where banner_id = $1 order by title`,
        [employee.banner_id]
    );

    // historical + current columns, oldest first
    const histCols: SalaryReviewColumn[] = [...employee.comp_history]
        .sort((a: any, b: any) => a.fiscal_year - b.fiscal_year)
        .map((h: any) => {
            const { banner, role } = roleAt(h.effective_date, employee.employment_history);
            return {
                fiscal_year: h.fiscal_year,
                label: `${h.fiscal_year}A`,
                banner, role,
                effective: h.effective_date,
                base_salary: h.base_salary,
                cash_allowance: h.cash_allowance,
                guaranteed_cash: guaranteedCash(h.base_salary, h.cash_allowance),
                sti_eligible_pct: h.sti_eligible_pct,
                sti_actual_pct: h.sti_actual_pct,
                sti_amount: h.sti_amount,
                lti_eligible_pct: h.lti_eligible_pct,
                lti_actual_pct: h.lti_actual_pct,
                lti_amount: h.lti_amount,
                total_comp: h.total_comp ?? totalComp(h.base_salary, h.sti_amount, h.lti_amount),
                pension_contribution: h.pension_contribution,
                other_items: null,
                other_remarks: h.note ?? null,
            };
        });

    const c = employee.compensation;
    const currentCol: SalaryReviewColumn = {
        fiscal_year: null,
        label: `${new Date().getFullYear()} Current`,
        banner: employee.banner_name, role: employee.position_title,
        effective: employee.position_effective_date,
        base_salary: c?.base_salary ?? null,
        cash_allowance: (c?.allowance_company_car ?? 0) + (c?.allowance_mobility ?? 0) + (c?.allowance_home_office ?? 0),
        guaranteed_cash: guaranteedCash(c?.base_salary ?? null, (c?.allowance_company_car ?? 0) + (c?.allowance_mobility ?? 0) + (c?.allowance_home_office ?? 0)),
        sti_eligible_pct: c?.base_salary ? Math.round(((c.sti_target ?? 0) / c.base_salary) * 100) : null,
        sti_amount: c?.sti_target ?? null,
        lti_eligible_pct: c?.base_salary ? Math.round(((c.lti_target ?? 0) / c.base_salary) * 100) : null,
        lti_amount: c?.lti_target ?? null,
        total_comp: compensationOnly(c),
        pension_contribution: null,
        other_items: null,
        other_remarks: null,
    };

    // The proposal's own comp fields aren't covered by getEmployee()'s redaction
    // (they live in a separate table) — mirror the same seeComp gate here so a
    // non-privileged viewer can open the page but never receives the figures.
    const seeComp = canSeeComp(await getCurrentUser());
    const visibleCompensation: ProposalCompensation = seeComp ? compensation : {
        ...compensation,
        base_salary: null,
        cash_allowance: null,
        sti_eligible_pct: null,
        sti_amount: null,
        lti_eligible_pct: null,
        lti_amount: null,
        pension_contribution: null,
    };

    return {
        proposal, compensation: visibleCompensation, employee,
        positions,
        employees,
        historyColumns: [...histCols, currentCol],
    };
}

export async function updateProposal(id: number, fields: Partial<Omit<ProposalRow, "proposal_id" | "employee_id" | "created_at" | "updated_at">>): Promise<{ ok: boolean; error?: string }> {
    const { clause, params } = buildSet({ ...fields, updated_at: new Date().toISOString() }, 1);
    try {
        await query(`update salary_proposals set ${clause} where proposal_id = $${params.length + 1}`, [...params, id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/proposals");
    revalidatePath(`/proposals/${id}`);
    return { ok: true };
}

export async function updateProposalCompensation(id: number, fields: Partial<Omit<ProposalCompensation, "proposal_id">>): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    const { clause, params } = buildSet({ ...encryptProposalCompensation(fields), updated_at: new Date().toISOString() }, 1);
    try {
        await query(`update salary_proposal_compensation set ${clause} where proposal_id = $${params.length + 1}`, [...params, id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/proposals/${id}`);
    return { ok: true };
}

export async function deleteProposal(id: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from salary_proposals where proposal_id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/proposals");
    return { ok: true };
}

// ── Comparison board attached to a proposal ────────────────────────────────
// The proposal's own employee is always column 1 (implicit); everything below
// is the benchmark peers + what-if scenarios pinned on the embedded Comparison
// tab.
// One board entry, in on-screen (drag) order — either a real peer or an
// adjusted/what-if scenario (which carries its own frozen compensation
// snapshot rather than a live employee_id).
export type ProposalBoardEntry =
    | { type: "peer"; employee_id: number }
    | { type: "whatif"; base_employee_id: number; compensation: Compensation };

// The full comparison board (real peers + what-if scenarios), merged and
// ordered by the shared sort_order space `setProposalBoard` assigns — this is
// what makes a what-if scenario and the drag order survive a page reload.
export async function getProposalBoard(proposalId: number): Promise<ProposalBoardEntry[]> {
    const [peers, whatifs] = await Promise.all([
        query<any>(`select employee_id, sort_order from salary_proposal_comparisons where proposal_id = $1`, [proposalId]),
        query<any>(`select base_employee_id, compensation, sort_order from salary_proposal_whatifs where proposal_id = $1`, [proposalId]),
    ]);
    const entries = [
        ...peers.map((p) => ({ type: "peer" as const, employee_id: p.employee_id, sort_order: p.sort_order as number })),
        ...whatifs.map((w) => ({ type: "whatif" as const, base_employee_id: w.base_employee_id, compensation: decryptWhatifCompensation<Compensation>(w.compensation)!, sort_order: w.sort_order as number })),
    ];
    entries.sort((a, b) => a.sort_order - b.sort_order);
    return entries.map(({ sort_order, ...rest }) => rest);
}

// Replace the whole comparison board for a proposal — real peers AND what-if
// scenarios, in the exact order shown on screen. The proposal's own employee
// is always column 1 (implicit) and is stripped if present.
//
// Called only from an explicit "Save" click on the Comparison tab (not
// auto-persisted) — a debounced auto-save meant every add/remove/drag/what-if
// fired its own full-board-replace write, and two of those in flight at once
// could complete out of order, silently erasing whichever was more recent.
// A single deliberate save has no concurrent writes to race against.
export async function setProposalBoard(proposalId: number, board: ProposalBoardEntry[]): Promise<{ ok: boolean; error?: string; savedBy?: string; savedAt?: string }> {
    const prop = await queryOne<{ employee_id: number }>(`select employee_id from salary_proposals where proposal_id = $1`, [proposalId]);
    if (!prop) return { ok: false, error: "Proposal not found" };

    const peerRows: { employee_id: number; sort_order: number }[] = [];
    const whatIfRows: { base_employee_id: number; compensation: Compensation; sort_order: number }[] = [];
    board.forEach((entry, i) => {
        if (entry.type === "peer") {
            if (entry.employee_id !== prop.employee_id) peerRows.push({ employee_id: entry.employee_id, sort_order: i });
        } else {
            whatIfRows.push({ base_employee_id: entry.base_employee_id, compensation: entry.compensation, sort_order: i });
        }
    });

    try {
        await query(`delete from salary_proposal_comparisons where proposal_id = $1`, [proposalId]);
        await query(`delete from salary_proposal_whatifs where proposal_id = $1`, [proposalId]);

        if (peerRows.length) {
            const values = peerRows.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(", ");
            const params: unknown[] = [proposalId];
            peerRows.forEach((r) => params.push(r.employee_id, r.sort_order));
            await query(`insert into salary_proposal_comparisons (proposal_id, employee_id, sort_order) values ${values}`, params);
        }
        if (whatIfRows.length) {
            const values = whatIfRows.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(", ");
            const params: unknown[] = [proposalId];
            whatIfRows.forEach((r) => params.push(r.base_employee_id, encryptWhatifCompensation(r.compensation), r.sort_order));
            await query(`insert into salary_proposal_whatifs (proposal_id, base_employee_id, compensation, sort_order) values ${values}`, params);
        }
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    const user = await getCurrentUser();
    const savedBy = user?.display_name || user?.email || "Unknown";
    const savedAt = new Date().toISOString();
    await query(`update salary_proposals set board_updated_by = $1, board_updated_at = $2 where proposal_id = $3`, [savedBy, savedAt, proposalId]);

    revalidatePath(`/proposals/${proposalId}`);
    return { ok: true, savedBy, savedAt };
}

export async function addProposalComparison(proposalId: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    const last = await queryOne<{ sort_order: number }>(
        `select sort_order from salary_proposal_comparisons where proposal_id = $1 order by sort_order desc limit 1`,
        [proposalId]
    );
    const nextOrder = last ? (last.sort_order ?? 0) + 1 : 0;
    try {
        await query(
            `insert into salary_proposal_comparisons (proposal_id, employee_id, sort_order)
             values ($1, $2, $3)
             on conflict (proposal_id, employee_id) do update set sort_order = excluded.sort_order`,
            [proposalId, employeeId, nextOrder]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/proposals/${proposalId}`);
    return { ok: true };
}

export async function removeProposalComparison(proposalId: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from salary_proposal_comparisons where proposal_id = $1 and employee_id = $2`, [proposalId, employeeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/proposals/${proposalId}`);
    return { ok: true };
}

// Replace the whole comparison set for a proposal (used when attaching a board
// from /comparison_v2). The proposal's own employee is always column 1, so it's
// stripped from the stored peers; simulated/what-if columns (negative ids) too.
export async function setProposalComparisons(proposalId: number, employeeIds: number[]): Promise<{ ok: boolean; error?: string }> {
    const prop = await queryOne<{ employee_id: number }>(`select employee_id from salary_proposals where proposal_id = $1`, [proposalId]);
    if (!prop) return { ok: false, error: "Proposal not found" };
    const peers = Array.from(new Set(employeeIds)).filter((id) => id > 0 && id !== prop.employee_id);
    try {
        await query(`delete from salary_proposal_comparisons where proposal_id = $1`, [proposalId]);
        if (peers.length) {
            const values = peers.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(", ");
            const params: unknown[] = [proposalId];
            peers.forEach((id, i) => params.push(id, i));
            await query(`insert into salary_proposal_comparisons (proposal_id, employee_id, sort_order) values ${values}`, params);
        }
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/proposals/${proposalId}`);
    return { ok: true };
}

// Create a new proposal from a comparison board: pick the subject + optional
// new position, and seed its comparison set with the rest of the board.
export async function createProposalForComparison(
    employeeId: number,
    newPositionId: number | null,
    peerIds: number[],
): Promise<{ ok: boolean; error?: string; id?: number }> {
    const created = await createProposal(employeeId);
    if (!created.ok || !created.id) return created;
    if (newPositionId != null) {
        await query(`update salary_proposals set new_position_id = $1 where proposal_id = $2`, [newPositionId, created.id]);
    }
    const r = await setProposalComparisons(created.id, peerIds);
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/proposals");
    return { ok: true, id: created.id };
}
