"use client";

import { createContext, useContext } from "react";
import { formatCurrency } from "@/lib/format";
import { useCurrencyDisplay } from "@/components/currency-display";
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
// `value` is always the stored EUR-equivalent amount, whatever currency the
// record was actually entered in (see currency-display.tsx) - this converts
// it live to whatever the viewer has picked to look at right now. A `currency`
// override is no longer accepted: display currency is a single global
// preference, not a per-record thing.
export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
    const vis = useContext(Ctx);
    const { displayCurrency, convert } = useCurrencyDisplay();
    if (vis === "visible") return <span className={className}>{formatCurrency(value == null ? value : convert(value), displayCurrency)}</span>;
    if (vis === "blurred") {
        return (
            <span className={className} title="Compensation hidden" aria-label="Compensation hidden">
                <span className="select-none blur-[3px]" aria-hidden>{formatCurrency(0, displayCurrency).replace("0", "000,000")}</span>
            </span>
        );
    }
    return (
        <span className={`text-slate-400 ${className ?? ""}`} title="Compensation restricted" aria-label="Compensation restricted">•••</span>
    );
}
