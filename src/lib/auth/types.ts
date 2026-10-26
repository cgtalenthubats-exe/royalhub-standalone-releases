// Application login accounts (distinct from HR `employees` records).

export type Role = "super" | "regular" | "dev";
export type UserStatus = "active" | "hold" | "disabled";
export type CompVisibility = "visible" | "blurred" | "hidden";
// Age / Estimated Retirement — a separate, simpler sensitive category (no
// "blurred" state; a birthdate-derived age doesn't have a meaningful masked
// rendering the way a currency figure does).
export type PersonalVisibility = "visible" | "hidden";

export interface AppUser {
    user_id: number;
    email: string;
    display_name: string | null;
    role: Role;
    status: UserStatus;
    // null = fall back to the role default (super => visible, else => hidden)
    comp_visibility: CompVisibility | null;
    personal_visibility: PersonalVisibility | null;
}
