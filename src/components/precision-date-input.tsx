"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

// Client feedback: date fields shouldn't force a specific day when the
// person only knows (or only wants to record) the month+year, or just the
// year - stores "2025-02-15" (day), "2025-02" (month), or "2025" (year) as
// plain text in the same column, matched by @/lib/format's formatDate.
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
    // Precision is set ONCE from the starting value and never re-derived
    // from `value` on every keystroke - it used to be computed fresh as
    // detectPrecision(value) on every render, which broke year/month entry
    // completely: typing the first digit of "2025" makes value "2", and
    // detectPrecision("2") can't tell that's a year-in-progress (it only
    // recognizes a COMPLETE 4-digit year), so it fell back to "day" and
    // flipped the field back to a date picker after every single
    // keystroke - "2" typed, falls back to Day, user clicks Year again,
    // types "0" i.e. only ever gets one character in before resetting.
    // Plain local state avoids that: once the user picks a precision, nothing
    // overrides their choice while they're still typing into it. This is
    // safe to never re-sync from a later `value` prop change because this
    // component is only ever mounted inside a Dialog, which unmounts (so
    // this re-initializes fresh) every time it's closed and reopened for a
    // different record - see DialogContent, no forceMount - so there's no
    // stale-precision-from-a-different-record risk either.
    const [precision, setPrecision] = useState<DatePrecision>(() => detectPrecision(value));

    // Re-derives a sensible value for the new precision from whatever's
    // already entered, rather than just clearing the field on toggle.
    function changePrecision(next: DatePrecision) {
        setPrecision(next);
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
                        onClick={() => changePrecision(p)}
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
