"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrencyDisplay } from "@/components/currency-display";
import { ChevronDown, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

// Fixed top-right, independent of whatever page/scroll position you're on -
// there's no single shared page header in this app (every page renders its
// own), so this mounts once at the root instead of being duplicated into
// every page's header.
export function CurrencySwitcher() {
    const { rates, displayCurrency, setDisplayCurrency } = useCurrencyDisplay();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const codes = Object.keys(rates).sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));

    useEffect(() => {
        function onClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    if (codes.length <= 1) return null; // nothing to switch between yet

    return (
        <div ref={ref} className="fixed top-3 right-4 z-50">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[12px] font-semibold text-[#0b1f3a] shadow-sm backdrop-blur hover:bg-slate-50 transition-colors"
                title="Display currency - changes how figures are shown on screen only, never what's stored"
            >
                <Coins className="h-3.5 w-3.5 text-slate-400" />
                {displayCurrency}
                <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {open && (
                <div className="absolute right-0 mt-1.5 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {codes.map((code) => (
                        <button
                            key={code}
                            onClick={() => { setDisplayCurrency(code); setOpen(false); }}
                            className={cn(
                                "flex w-full items-center justify-between px-3 py-1.5 text-[12.5px] hover:bg-slate-50 transition-colors",
                                code === displayCurrency ? "font-semibold text-[#0b1f3a]" : "text-slate-600"
                            )}
                        >
                            {code}
                            {code === displayCurrency && <span className="text-[10px] text-slate-400">current</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
