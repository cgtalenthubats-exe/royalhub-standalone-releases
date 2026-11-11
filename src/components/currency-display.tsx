"use client";

import { createContext, useContext } from "react";

export type CurrencyRateMap = Record<string, number>; // currency_code -> rate_to_eur ("1 unit = ? EUR")

// Just the rates, fetched once server-side in the root layout - used by the
// Compensation & Benefits / Compensation History edit dialogs (the currency
// picker's list of codes, and the live "≈ €X at today's rate" hint while
// editing). Read-only displays no longer need a shared "display currency":
// each table/card shows every record in its own entered currency by
// default, with its own local Local/EUR toggle (see local-eur-toggle.tsx) -
// there's no single global preference to track anymore.
const CurrencyRatesContext = createContext<CurrencyRateMap>({ EUR: 1 });

export function CurrencyRatesProvider({ rates, children }: { rates: CurrencyRateMap; children: React.ReactNode }) {
    return <CurrencyRatesContext.Provider value={rates}>{children}</CurrencyRatesContext.Provider>;
}

export function useCurrencyRates(): CurrencyRateMap {
    return useContext(CurrencyRatesContext);
}
