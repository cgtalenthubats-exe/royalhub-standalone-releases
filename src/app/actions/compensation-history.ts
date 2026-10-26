"use server";

import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireCompEditor } from "@/lib/permissions";
import { encryptCompensationHistory } from "@/lib/compensation-crypto";

export interface CompensationHistoryEntry {
    id: number;
    employee_id: number;
    fiscal_year: number;
    effective_date: string | null;
    base_salary: number | null;
    cash_allowance: number | null;
    sti_eligible_pct: number | null; // target the person was entitled to
    sti_actual_pct: number | null;   // what was actually achieved/paid
    sti_amount: number | null;       // derived: actual% × base
    lti_eligible_pct: number | null;
    lti_actual_pct: number | null;
    lti_amount: number | null;
    pension_contribution: number | null;
    total_comp: number | null;       // derived: base + sti + lti
    note: string | null;
}

// The two bonus euro figures and the total are always derived so the stored
// numbers can never drift from the entered percentages.
function derive(base: number | null, actualPct: number | null): number | null {
    if (base == null || actualPct == null) return null;
    return Math.round((base * actualPct) / 100);
}

export type CompHistoryInput = {
    fiscal_year: number;
    effective_date: string | null;
    base_salary: number | null;
    cash_allowance: number | null;
    sti_eligible_pct: number | null;
    sti_actual_pct: number | null;
    lti_eligible_pct: number | null;
    lti_actual_pct: number | null;
    pension_contribution: number | null;
    note: string | null;
}

function toRow(employeeId: number, input: CompHistoryInput) {
    const sti_amount = derive(input.base_salary, input.sti_actual_pct);
    const lti_amount = derive(input.base_salary, input.lti_actual_pct);
    const total_comp = (input.base_salary ?? 0) + (sti_amount ?? 0) + (lti_amount ?? 0);
    return {
        employee_id: employeeId,
        fiscal_year: input.fiscal_year,
        effective_date: input.effective_date,
        base_salary: input.base_salary,
        cash_allowance: input.cash_allowance,
        sti_eligible_pct: input.sti_eligible_pct,
        sti_actual_pct: input.sti_actual_pct,
        sti_amount,
        lti_eligible_pct: input.lti_eligible_pct,
        lti_actual_pct: input.lti_actual_pct,
        lti_amount,
        pension_contribution: input.pension_contribution,
        total_comp,
        note: input.note,
    };
}

// Create a new row, or replace the one already on that (employee, fiscal year).
export async function upsertCompensationHistory(employeeId: number, input: CompHistoryInput): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    const r = toRow(employeeId, input);
    const enc = encryptCompensationHistory(r);
    try {
        await query(
            `insert into compensation_history
                (employee_id, fiscal_year, effective_date, base_salary, cash_allowance,
                 sti_eligible_pct, sti_actual_pct, sti_amount, lti_eligible_pct, lti_actual_pct, lti_amount,
                 pension_contribution, total_comp, note)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             on conflict (employee_id, fiscal_year) do update set
                effective_date = excluded.effective_date,
                base_salary = excluded.base_salary,
                cash_allowance = excluded.cash_allowance,
                sti_eligible_pct = excluded.sti_eligible_pct,
                sti_actual_pct = excluded.sti_actual_pct,
                sti_amount = excluded.sti_amount,
                lti_eligible_pct = excluded.lti_eligible_pct,
                lti_actual_pct = excluded.lti_actual_pct,
                lti_amount = excluded.lti_amount,
                pension_contribution = excluded.pension_contribution,
                total_comp = excluded.total_comp,
                note = excluded.note`,
            [enc.employee_id, enc.fiscal_year, enc.effective_date, enc.base_salary, enc.cash_allowance,
             enc.sti_eligible_pct, enc.sti_actual_pct, enc.sti_amount, enc.lti_eligible_pct, enc.lti_actual_pct, enc.lti_amount,
             enc.pension_contribution, enc.total_comp, enc.note]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// Edit an existing row by id (allows changing the fiscal year of that row).
export async function updateCompensationHistory(id: number, employeeId: number, input: CompHistoryInput): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    const r = toRow(employeeId, input);
    const enc = encryptCompensationHistory(r);
    try {
        await query(
            `update compensation_history set
                fiscal_year = $1, effective_date = $2, base_salary = $3, cash_allowance = $4,
                sti_eligible_pct = $5, sti_actual_pct = $6, sti_amount = $7,
                lti_eligible_pct = $8, lti_actual_pct = $9, lti_amount = $10,
                pension_contribution = $11, total_comp = $12, note = $13
             where id = $14 and employee_id = $15`,
            [enc.fiscal_year, enc.effective_date, enc.base_salary, enc.cash_allowance,
             enc.sti_eligible_pct, enc.sti_actual_pct, enc.sti_amount,
             enc.lti_eligible_pct, enc.lti_actual_pct, enc.lti_amount,
             enc.pension_contribution, enc.total_comp, enc.note, id, employeeId]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteCompensationHistory(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    try {
        await query(`delete from compensation_history where id = $1 and employee_id = $2`, [id, employeeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}
