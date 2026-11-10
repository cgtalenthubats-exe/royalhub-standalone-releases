"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type CurrencyRateMap = Record<string, number>; // currency_code -> rate_to_eur ("1 unit = ? EUR")

const STORAGE_KEY = "rf-display-currency";

interface Ctx {
    rates: CurrencyRateMap;
    displayCurrency: string;
    setDisplayCurrency: (code: string) => void;
    // Converts a stored EUR amount into the currently selected display
    // currency - purely cosmetic, always uses TODAY's rate (never a record's
    // own frozen fx_rate_used, which only matters when re-opening that
    // record to edit it, see compensation-benefits-card.tsx/
    // compensation-history-card.tsx).
    convert: (eurAmount: number) => number;
}

const CurrencyDisplayContext = createContext<Ctx>({
    rates: { EUR: 1 },
    displayCurrency: "EUR",
    setDisplayCurrency: () => {},
    convert: (v) => v,
});

export function CurrencyDisplayProvider({ rates, children }: { rates: CurrencyRateMap; children: React.ReactNode }) {
    const [displayCurrency, setDisplayCurrencyState] = useState("EUR");

    // Restored after mount (not during SSR) so the server-rendered page and
    // the first client render match - a per-viewer preference like this
    // belongs in localStorage, never written back to the shared database.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && rates[saved] != null) setDisplayCurrencyState(saved);
        } catch {}
    }, [rates]);

    function setDisplayCurrency(code: string) {
        setDisplayCurrencyState(code);
        try { localStorage.setItem(STORAGE_KEY, code); } catch {}
    }

    function convert(eurAmount: number): number {
        const rate = rates[displayCurrency];
        if (!rate) return eurAmount;
        return eurAmount / rate;
    }

    return (
        <CurrencyDisplayContext.Provider value={{ rates, displayCurrency, setDisplayCurrency, convert }}>
            {children}
        </CurrencyDisplayContext.Provider>
    );
}

export function useCurrencyDisplay() {
    return useContext(CurrencyDisplayContext);
}
