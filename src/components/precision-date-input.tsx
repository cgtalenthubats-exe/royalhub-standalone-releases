"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

// Client feedback: Career History dates shouldn't force a specific day when
// the person only knows (or only wants to record) the month+year, or just
// the year - stores "2025-02-15" (day), "2025-02" (month), or "2025" (year)
// as plain text in the same column, matched by @/lib/format's formatDate.
export type DatePrecision = "day" | "month" | "year";

export function detectPrecision(value: string | null | undefined): DatePrecision {
    if (value && /^\d{4}$/.test(value)) return "year";
    if (value && /^\d{4}-\d{2}$/.test(value)) return "month";
    return "day";
}

export function PrecisionDateInput({ value, onChange, disabled }: {
    value: string | null | undefined;
    onChange: (value: string) => void;
    disabled?: boolean;
}) {
    // A brand-new (empty) field has nothing for detectPrecision to read, so
    // clicking a precision button has to be remembered here instead -
    // otherwise toggling to "Year" on an empty field just silently did
    // nothing (detectPrecision("") always falls back to "day", since an
    // empty string can't tell it what the user wants). This override is
    // only a bridge until something is actually typed: once value is real,
    // the effect below hands authority back to detectPrecision(value) -
    // important because this component is reused for a different record
    // without unmounting (the Dialog stays mounted across edits), so a
    // leftover override from a previous record must not stick around once
    // real data for the new one arrives.
    const [override, setOverride] = useState<DatePrecision | null>(null);
    useEffect(() => { if (value) setOverride(null); }, [value]);
    const precision = override ?? detectPrecision(value);

    // Re-derives a sensible value for the new precision from whatever's
    // already entered, rather than just clearing the field on toggle.
    function setPrecision(next: DatePrecision) {
        setOverride(next);
        if (!value) return;
        if (next === "year") onChange(value.slice(0, 4));
        else if (next === "month") onChange(/^\d{4}$/.test(value) ? value + "-01" : value.slice(0, 7));
        else onChange(/^\d{4}$/.test(value) ? value + "-01-01" : /^\d{4}-\d{2}$/.test(value) ? value + "-01" : value);
    }

    return (
        <div className="space-y-1">
            <div className="flex gap-1">
                {(["day", "month", "year"] as DatePrecision[]).map((p) => (
                    <button
                        key={p}
                        type="button"
                        disabled={disabled}
                        onClick={() => setPrecision(p)}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            precision === p ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                    >
                        {p === "day" ? "Day" : p === "month" ? "Month" : "Year"}
                    </button>
                ))}
            </div>
            {precision === "year" ? (
                <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 2025"
                    disabled={disabled}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                />
            ) : (
                <Input
                    type={precision === "month" ? "month" : "date"}
                    disabled={disabled}
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                />
            )}
        </div>
    );
}
