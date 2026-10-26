import type { AppUser, CompVisibility, PersonalVisibility } from "@/lib/auth/types";
import type { EmployeeListItem, EmployeeDetail } from "@/app/actions/employees";
import { getCurrentUser } from "@/lib/auth/current-user";

// Effective compensation visibility for a user. super always sees figures;
// everyone else defaults to hidden unless a per-user override says otherwise.
export function effectiveCompVisibility(user: AppUser | null): CompVisibility {
    if (!user) return "hidden";
    if (user.role === "super") return "visible";
    return user.comp_visibility ?? "hidden";
}

export function canSeeComp(user: AppUser | null): boolean {
    return effectiveCompVisibility(user) === "visible";
}

// Server guard for compensation mutations — the right to edit follows the right
// to see. Throws for anyone whose comp is masked (blurred/hidden), so a
// non-privileged client can't write comp even by calling the action directly.
export async function requireCompEditor(): Promise<AppUser> {
    const user = await getCurrentUser();
    if (!canSeeComp(user)) throw new Error("You don't have permission to edit compensation.");
    return user!;
}

// Age / Estimated Retirement — same shape as comp visibility (super always
// sees it; everyone else defaults to hidden unless a super opts them in).
export function effectivePersonalVisibility(user: AppUser | null): PersonalVisibility {
    if (!user) return "hidden";
    if (user.role === "super") return "visible";
    return user.personal_visibility ?? "hidden";
}

export function canSeePersonal(user: AppUser | null): boolean {
    return effectivePersonalVisibility(user) === "visible";
}

export async function requirePersonalEditor(): Promise<AppUser> {
    const user = await getCurrentUser();
    if (!canSeePersonal(user)) throw new Error("You don't have permission to edit this.");
    return user!;
}

// Compensation fields present on the list/detail shapes. Redaction NULLs these
// server-side so the numbers never reach an unauthorized client.
const NULLED_LIST = {
    total_compensation: null,
    base_salary: null,
    sti_target: null,
    lti_target: null,
    other_bonus: null,
} as const;

export function redactListItem(e: EmployeeListItem, seeComp: boolean, seePersonal: boolean): EmployeeListItem {
    return {
        ...e,
        ...(seeComp ? null : NULLED_LIST),
        ...(seePersonal ? null : { retirement_age: null }),
    };
}

export function redactDetail(d: EmployeeDetail, seeComp: boolean, seePersonal: boolean): EmployeeDetail {
    return {
        ...d,
        ...(seeComp ? null : { ...NULLED_LIST, compensation: null, comp_history: [] }),
        ...(seePersonal ? null : { retirement_age: null }),
    };
}
