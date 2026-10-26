"use client";

import { createContext, useCallback, useContext, useRef } from "react";

// Lets a page with unsaved, in-memory changes (e.g. the Proposal Comparison
// tab's board) intercept navigation triggered from OUTSIDE itself — the top
// nav bar, in particular — without AppNav needing to know anything about
// what "unsaved" means for any given page. A page registers a guard while it
// has unsaved changes; AppNav (and anything else that navigates) routes every
// navigation through `requestNavigation` instead of calling the router
// directly. With no guard registered (the common case, every other page),
// navigation proceeds immediately — zero behavior change anywhere but the
// one page that opts in.
type Guard = (href: string, proceed: () => void) => void;

interface UnsavedChangesContextValue {
    requestNavigation: (href: string, proceed: () => void) => void;
    setGuard: (guard: Guard | null) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
    const guardRef = useRef<Guard | null>(null);
    const setGuard = useCallback((guard: Guard | null) => { guardRef.current = guard; }, []);
    const requestNavigation = useCallback((href: string, proceed: () => void) => {
        if (guardRef.current) guardRef.current(href, proceed);
        else proceed();
    }, []);
    return (
        <UnsavedChangesContext.Provider value={{ requestNavigation, setGuard }}>
            {children}
        </UnsavedChangesContext.Provider>
    );
}

export function useUnsavedChangesGuard() {
    const ctx = useContext(UnsavedChangesContext);
    if (!ctx) throw new Error("useUnsavedChangesGuard must be used within UnsavedChangesProvider");
    return ctx;
}
