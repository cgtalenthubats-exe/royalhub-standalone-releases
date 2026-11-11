"use server";

import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireCompEditor } from "@/lib/permissions";
import { encryptCompensationHistory, encryptLocalValues } from "@/lib/compensation-crypto";
import { getCurrentRate } from "@/app/actions/currency";

export interface CompensationHistoryEntry {
    id: number;
    employee_id: number;
    fiscal_year: number;
    effective_date: string | null;
    currency: string;            // the currency this row was entered in (source currency)
    fx_rate_used: number | null; // rate_to_eur frozen at save time; null when currency is EUR
    base_salary: number | null;
    cash_allowance: number | null;
    sti_eligible_pct: number | null; // target the person was entitled to
    sti_eligible_amount: number | null; // display-only € equivalent; not counted in total_comp
    sti_actual_pct: number | null;   // what was actually achieved/paid
    sti_amount: number | null;       // € actual - amount and % stay in sync, see CompHistoryInput
    lti_eligible_pct: number | null;
    lti_eligible_amount: number | null;
    lti_actual_pct: number | null;
    lti_amount: number | null;
    pension_contribution: number | null; // € - stored source of truth
    pension_pct: number | null;          // display-only equivalent of pension_contribution
    other_bonus: number | null;
    total_comp: number | null;       // derived: everything above, prorated by effective_date
    // Every amount field above exactly as typed, in `currency`, plus a local
    // total_comp - null when currency is EUR or for a row saved before this
    // existed (see buildLocalValues/localDisplay in @/lib/format).
    local_values: Record<string, number | null> | null;
    note: string | null;
}

// Client feedback: an effective date mid-year was saved but had no effect on
// the total - the row counted as a full fiscal year regardless. Assumes a
// calendar-year fiscal year (Jan 1 - Dec 31 of fiscal_year), the only
// convention this app uses anywhere else (no other fiscal-year-start
// setting exists to read instead). 1.0 = full year (no effective date, or
// one on/before Jan 1); 0.0 = effective date after the year already ended.
function prorationFraction(fiscalYear: number, effectiveDate: string | null): number {
    if (!effectiveDate) return 1;
    const d = new Date(effectiveDate);
    if (isNaN(d.getTime())) return 1;
    const MS_PER_DAY = 86400000;
    const yearStart = Date.UTC(fiscalYear, 0, 1);
    const yearEnd = Date.UTC(fiscalYear, 11, 31);
    const effective = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (effective <= yearStart) return 1;
    if (effective > yearEnd) return 0;
    const totalDays = Math.round((yearEnd - yearStart) / MS_PER_DAY) + 1;
    const daysRemaining = Math.round((yearEnd - effective) / MS_PER_DAY) + 1;
    return daysRemaining / totalDays;
}

export type CompHistoryInput = {
    fiscal_year: number;
    effective_date: string | null;
    currency: string;
    base_salary: number | null;
    cash_allowance: number | null;
    sti_eligible_pct: number | null;
    sti_eligible_amount: number | null;
    sti_actual_pct: number | null;
    sti_amount: number | null;
    lti_eligible_pct: number | null;
    lti_eligible_amount: number | null;
    lti_actual_pct: number | null;
    lti_amount: number | null;
    pension_contribution: number | null;
    pension_pct: number | null;
    other_bonus: number | null;
    note: string | null;
}

const HIST_AMOUNT_KEYS = [
    "base_salary", "cash_allowance", "sti_eligible_amount", "sti_amount",
    "lti_eligible_amount", "lti_amount", "pension_contribution", "other_bonus",
] as const; // money fields only - the *_pct fields are unitless and never convert

// This row can be entered in GBP/CHF/DKK, not just EUR - every numeric
// column always stores the EUR-equivalent, so totals/proration/comparisons
// keep working untouched. Converts once, server-side, using today's rate;
// that rate is frozen onto the row (fx_rate_used) so re-opening it later
// shows back the exact figures that were typed, not a drifted value.
async function convertHistoryToEur(input: CompHistoryInput): Promise<{ converted: CompHistoryInput; fxRateUsed: number | null; error?: string }> {
    if (input.currency === "EUR") return { converted: input, fxRateUsed: null };
    const rate = await getCurrentRate(input.currency);
    if (!rate) return { converted: input, fxRateUsed: null, error: `No exchange rate set for ${input.currency} — add one in Settings > Currency first.` };
    const converted = { ...input };
    for (const key of HIST_AMOUNT_KEYS) {
        // Two decimal places, not a whole EUR - see the identical note in
        // convertCompToEur (employee-crud.ts): rounding every field to a
        // whole EUR before summing them into total_comp and converting back
        // for display (toLocalAmount in @/lib/format) visibly drifts the
        // total, worse the further the currency's rate is from 1:1 with EUR.
        if (converted[key] != null) converted[key] = Math.round((converted[key] as number) * rate * 100) / 100;
    }
    return { converted, fxRateUsed: rate };
}

// The figures exactly as typed (pre-conversion `input`, not `converted`),
// kept verbatim so "Local" display never has to be reverse-engineered from
// the EUR columns again - same purpose and shape as employee-crud.ts's
// buildLocalValues, just using this row's own total formula/proration.
// NULL for a EUR row - the EUR columns already are the local figures.
function buildLocalValues(input: CompHistoryInput): Record<string, number | null> | null {
    if (input.currency === "EUR") return null;
    const out: Record<string, number | null> = {};
    for (const key of HIST_AMOUNT_KEYS) out[key] = input[key] ?? null;
    const fullYearTotal = (input.base_salary ?? 0) + (input.sti_amount ?? 0) + (input.lti_amount ?? 0)
        + (input.cash_allowance ?? 0) + (input.pension_contribution ?? 0) + (input.other_bonus ?? 0);
    const fraction = prorationFraction(input.fiscal_year, input.effective_date);
    out.total_comp = fraction < 1 ? Math.round(fullYearTotal * fraction) : fullYearTotal;
    return out;
}

function toRow(employeeId: number, input: CompHistoryInput, currency: string, fxRateUsed: number | null) {
    // STI/LTI Actual and Pension now support dual %/amount entry on the
    // client (whichever side the person typed into is the source of truth
    // for that save, the other side is the client's own back-conversion for
    // display) - the server just trusts the € amount it's given instead of
    // re-deriving it from the %, which used to silently round-trip drift
    // (e.g. a 2-decimal % stored from a precise € figure, then recomputed
    // back into a slightly different € figure on the next save).
    //
    // Client feedback (B4/C10): total was silently dropping Cash Allowance,
    // Pension and Other Bonus - it now adds up everything entered on this
    // row, then applies the effective-date proration on top (B8).
    const fullYearTotal = (input.base_salary ?? 0) + (input.sti_amount ?? 0) + (input.lti_amount ?? 0)
        + (input.cash_allowance ?? 0) + (input.pension_contribution ?? 0) + (input.other_bonus ?? 0);
    const fraction = prorationFraction(input.fiscal_year, input.effective_date);
    const total_comp = fraction < 1 ? Math.round(fullYearTotal * fraction) : fullYearTotal;
    return {
        employee_id: employeeId,
        fiscal_year: input.fiscal_year,
        effective_date: input.effective_date,
        currency,
        fx_rate_used: fxRateUsed,
        base_salary: input.base_salary,
        cash_allowance: input.cash_allowance,
        sti_eligible_pct: input.sti_eligible_pct,
        sti_eligible_amount: input.sti_eligible_amount,
        sti_actual_pct: input.sti_actual_pct,
        sti_amount: input.sti_amount,
        lti_eligible_pct: input.lti_eligible_pct,
        lti_eligible_amount: input.lti_eligible_amount,
        lti_actual_pct: input.lti_actual_pct,
        lti_amount: input.lti_amount,
        pension_contribution: input.pension_contribution,
        pension_pct: input.pension_pct,
        other_bonus: input.other_bonus,
        total_comp,
        note: input.note,
    };
}

// Create a new row, or replace the one already on that (employee, fiscal year).
export async function upsertCompensationHistory(employeeId: number, input: CompHistoryInput): Promise<{ ok: boolean; error?: string }> {
    try { await requireCompEditor(); } catch (e: any) { return { ok: false, error: e.message }; }
    const { converted, fxRateUsed, error } = await convertHistoryToEur(input);
    if (error) return { ok: false, error };
    const r = toRow(employeeId, converted, input.currency, fxRateUsed);
    const enc = encryptCompensationHistory(r);
    const local_values = encryptLocalValues(buildLocalValues(input));
    try {
        await query(
            `insert into compensation_history
                (employee_id, fiscal_year, effective_date, currency, fx_rate_used, base_salary, cash_allowance,
                 sti_eligible_pct, sti_eligible_amount, sti_actual_pct, sti_amount,
                 lti_eligible_pct, lti_eligible_amount, lti_actual_pct, lti_amount,
                 pension_contribution, pension_pct, other_bonus, total_comp, local_values, note)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             on conflict (employee_id, fiscal_year) do update set
                effective_date = excluded.effective_date,
                currency = excluded.currency,
                fx_rate_used = excluded.fx_rate_used,
                base_salary = excluded.base_salary,
                cash_allowance = excluded.cash_allowance,
                sti_eligible_pct = excluded.sti_eligible_pct,
                sti_eligible_amount = excluded.sti_eligible_amount,
                sti_actual_pct = excluded.sti_actual_pct,
                sti_amount = excluded.sti_amount,
                lti_eligible_pct = excluded.lti_eligible_pct,
                lti_eligible_amount = excluded.lti_eligible_amount,
                lti_actual_pct = excluded.lti_actual_pct,
                lti_amount = excluded.lti_amount,
                pension_contribution = excluded.pension_contribution,
                pension_pct = excluded.pension_pct,
                other_bonus = excluded.other_bonus,
                total_comp = excluded.total_comp,
                local_values = excluded.local_values,
                note = excluded.note`,
            [enc.employee_id, enc.fiscal_year, enc.effective_date, enc.currency, enc.fx_rate_used, enc.base_salary, enc.cash_allowance,
             enc.sti_eligible_pct, enc.sti_eligible_amount, enc.sti_actual_pct, enc.sti_amount,
             enc.lti_eligible_pct, enc.lti_eligible_amount, enc.lti_actual_pct, enc.lti_amount,
             enc.pension_contribution, enc.pension_pct, enc.other_bonus, enc.total_comp, local_values, enc.note]
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
    const { converted, fxRateUsed, error } = await convertHistoryToEur(input);
    if (error) return { ok: false, error };
    const r = toRow(employeeId, converted, input.currency, fxRateUsed);
    const enc = encryptCompensationHistory(r);
    const local_values = encryptLocalValues(buildLocalValues(input));
    try {
        await query(
            `update compensation_history set
                fiscal_year = $1, effective_date = $2, currency = $3, fx_rate_used = $4, base_salary = $5, cash_allowance = $6,
                sti_eligible_pct = $7, sti_eligible_amount = $8, sti_actual_pct = $9, sti_amount = $10,
                lti_eligible_pct = $11, lti_eligible_amount = $12, lti_actual_pct = $13, lti_amount = $14,
                pension_contribution = $15, pension_pct = $16, other_bonus = $17, total_comp = $18, local_values = $19, note = $20
             where id = $21 and employee_id = $22`,
            [enc.fiscal_year, enc.effective_date, enc.currency, enc.fx_rate_used, enc.base_salary, enc.cash_allowance,
             enc.sti_eligible_pct, enc.sti_eligible_amount, enc.sti_actual_pct, enc.sti_amount,
             enc.lti_eligible_pct, enc.lti_eligible_amount, enc.lti_actual_pct, enc.lti_amount,
             enc.pension_contribution, enc.pension_pct, enc.other_bonus, enc.total_comp, local_values, enc.note, id, employeeId]
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
