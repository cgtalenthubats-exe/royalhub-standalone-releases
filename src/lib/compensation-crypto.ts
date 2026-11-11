import { encryptAmount, decryptAmount, encryptJson, decryptJson } from "@/lib/crypto";

// Field lists for the 12 encrypted column-groups (4 tables) — see migration
// 029 and FEEDBACK_TRACKER.md's client infra/security item 1. Centralized
// here once so every action file that touches these tables uses the exact
// same set, instead of five separate copies that could quietly drift apart.

const EMPLOYEE_COMPENSATION_FIELDS = [
    "base_salary", "sti_target", "sti_max", "lti_target", "lti_max", "other_bonus", "total_compensation",
] as const;

const COMPENSATION_HISTORY_FIELDS = [
    "base_salary", "total_comp", "sti_eligible_pct", "sti_eligible_amount", "sti_actual_pct", "sti_amount",
    "lti_eligible_pct", "lti_eligible_amount", "lti_actual_pct", "lti_amount", "other_bonus",
] as const;

const PROPOSAL_COMPENSATION_FIELDS = [
    "base_salary", "cash_allowance", "sti_eligible_pct", "sti_amount", "lti_eligible_pct", "lti_amount",
] as const;

function decryptFields<T extends Record<string, any>>(row: T, fields: readonly string[]): T {
    const out = { ...row };
    for (const f of fields) out[f as keyof T] = decryptAmount(row[f]) as any;
    return out;
}

function encryptFields<T extends Record<string, any>>(input: T, fields: readonly string[]): T {
    const out = { ...input };
    for (const f of fields) {
        if (f in input) out[f as keyof T] = encryptAmount(input[f]) as any;
    }
    return out;
}

// local_values is a whole JSON object per row (every amount field exactly as
// typed, not a single number), so it decrypts via decryptJson rather than
// decryptFields' per-field decryptAmount loop above.
function decryptLocalValues<T extends Record<string, any>>(row: T): T {
    if (!("local_values" in row)) return row;
    return { ...row, local_values: decryptJson(row.local_values) };
}

export function decryptEmployeeCompensation<T extends Record<string, any>>(row: T): T {
    return decryptLocalValues(decryptFields(row, EMPLOYEE_COMPENSATION_FIELDS));
}
export function encryptEmployeeCompensation<T extends Record<string, any>>(input: T): T {
    return encryptFields(input, EMPLOYEE_COMPENSATION_FIELDS);
}

export function decryptCompensationHistory<T extends Record<string, any>>(row: T): T {
    return decryptLocalValues(decryptFields(row, COMPENSATION_HISTORY_FIELDS));
}
export function encryptCompensationHistory<T extends Record<string, any>>(input: T): T {
    return encryptFields(input, COMPENSATION_HISTORY_FIELDS);
}

// Encrypts the local_values JSON object for an insert/update - the counterpart
// to decryptLocalValues above. Exported directly (not folded into
// encryptEmployeeCompensation/encryptCompensationHistory) since the callers
// build this object themselves from the raw, pre-conversion input rather than
// from the same shape those two functions take.
export function encryptLocalValues(value: Record<string, number | null> | null): string | null {
    return value ? encryptJson(value) : null;
}

export function decryptProposalCompensation<T extends Record<string, any>>(row: T): T {
    return decryptFields(row, PROPOSAL_COMPENSATION_FIELDS);
}
export function encryptProposalCompensation<T extends Record<string, any>>(input: T): T {
    return encryptFields(input, PROPOSAL_COMPENSATION_FIELDS);
}

// salary_proposal_whatifs.compensation — one JSON blob per row, encrypted whole.
export function encryptWhatifCompensation(value: unknown): string | null {
    return encryptJson(value);
}
export function decryptWhatifCompensation<T>(stored: string | null | undefined): T | null {
    return decryptJson<T>(stored);
}
