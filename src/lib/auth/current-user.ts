import type { AppUser } from "./types";

// Standalone edition: no login, no session, no roles. Everyone who opens the
// app is this single fixed "local operator" — full access, nothing redacted.
// Access control for who can use the app at all is the user's own
// responsibility (their computer, their OS-level login).
//
// getCurrentUser()/requireUser()/requireSuper() keep the exact same
// signatures as the cloud edition so the 17 files that call them are
// unchanged — only this file's internals differ.
const LOCAL_USER: AppUser = {
    user_id: 1,
    email: "local@royalhub.standalone",
    display_name: "Operator",
    role: "super",
    status: "active",
    comp_visibility: "visible",
    personal_visibility: "visible",
};

export async function getCurrentUser(): Promise<AppUser | null> {
    return LOCAL_USER;
}

export async function requireUser(): Promise<AppUser> {
    return LOCAL_USER;
}

export async function requireSuper(): Promise<AppUser> {
    return LOCAL_USER;
}
