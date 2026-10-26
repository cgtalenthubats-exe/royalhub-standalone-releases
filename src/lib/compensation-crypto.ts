import { encryptAmount, decryptAmount, encryptJson, decryptJson } from "@/lib/crypto";

// Field lists for the 12 encrypted column-groups (4 tables) — see migration
// 029 and FEEDBACK_TRACKER.md's client infra/security item 1. Centralized
// here once so every action file that touches these tables uses the exact
// same set, instead of five separate copies that could quietly drift apart.

const EMPLOYEE_COMPENSATION_FIELDS = [
    "base_salary", "sti_target", "sti_max", "lti_target", "lti_max", "other_bonus", "total_compensation",
] as const;

const COMPENSATION_HISTORY_FIELDS = [
    "base_salary", "total_comp", "sti_eligible_pct", "sti_actual_pct", "sti_amount",
    "lti_eligible_pct", "lti_actual_pct", "lti_amount",
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

export function decryptEmployeeCompensation<T extends Record<string, any>>(row: T): T {
    return decryptFields(row, EMPLOYEE_COMPENSATION_FIELDS);
}
export function encryptEmployeeCompensation<T extends Record<string, any>>(input: T): T {
    return encryptFields(input, EMPLOYEE_COMPENSATION_FIELDS);
}

export function decryptCompensationHistory<T extends Record<string, any>>(row: T): T {
    return decryptFields(row, COMPENSATION_HISTORY_FIELDS);
}
export function encryptCompensationHistory<T extends Record<string, any>>(input: T): T {
    return encryptFields(input, COMPENSATION_HISTORY_FIELDS);
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
