"use client";

import { createContext, useContext } from "react";
import { formatCurrency } from "@/lib/format";
import type { CompVisibility } from "@/lib/auth/types";

// The viewer's effective compensation visibility, provided once at the root.
// Redaction already happens server-side (values arrive null for non-privileged
// users); this only decides how a compensation slot is *rendered*.
const Ctx = createContext<CompVisibility>("visible");

export function CompVisibilityProvider({ value, children }: { value: CompVisibility; children: React.ReactNode }) {
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompVisibility() {
    return useContext(Ctx);
}

// Render a compensation figure honoring the viewer's visibility:
//  visible → the real (formatted) amount
//  blurred → a blurred masked amount (no real value underneath)
//  hidden  → a small "restricted" mark
// `currency` is whatever the caller has already decided to show this figure
// in (each table/card picks that per its own Local/EUR toggle - see
// local-eur-toggle.tsx) - this component only ever formats and masks, it
// never converts.
export function Money({ value, currency = "EUR", className }: { value: number | null | undefined; currency?: string; className?: string }) {
    const vis = useContext(Ctx);
    if (vis === "visible") return <span className={className}>{formatCurrency(value, currency)}</span>;
    if (vis === "blurred") {
        return (
            <span className={className} title="Compensation hidden" aria-label="Compensation hidden">
                <span className="select-none blur-[3px]" aria-hidden>{formatCurrency(0, currency).replace("0", "000,000")}</span>
            </span>
        );
    }
    return (
        <span className={`text-slate-400 ${className ?? ""}`} title="Compensation restricted" aria-label="Compensation restricted">•••</span>
    );
}
