"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

function formatWithCommas(raw: string): string {
    if (raw === "" || raw === "-") return raw;
    const neg = raw.startsWith("-");
    const body = neg ? raw.slice(1) : raw;
    const [intPart, decPart] = body.split(".");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + withCommas + (decPart !== undefined ? "." + decPart : "");
}

function stripCommas(s: string): string {
    return s.replace(/,/g, "");
}

// A plain number input whose value is comma-grouped as the person types
// (client feedback: compensation figures were hard to read without
// thousand separators). Still reports a clean number via onChange — the
// formatting is display-only.
export function CommaNumberInput({ value, onChange, className, placeholder, disabled }: {
    value: number | "";
    onChange: (v: number | "") => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState(value === "" ? "" : formatWithCommas(String(value)));

    // Re-sync from outside (switching record, a sibling recomputing this
    // field) but never while the person is actively typing in it, so this
    // doesn't fight their cursor.
    useEffect(() => {
        if (document.activeElement === inputRef.current) return;
        setText(value === "" ? "" : formatWithCommas(String(value)));
    }, [value]);

    return (
        <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            className={className}
            placeholder={placeholder}
            disabled={disabled}
            value={text}
            onChange={(e) => {
                const el = e.target;
                const raw = stripCommas(el.value);
                if (!/^-?\d*\.?\d*$/.test(raw)) return;
                const digitsBeforeCursor = stripCommas(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
                const formatted = formatWithCommas(raw);
                setText(formatted);
                onChange(raw === "" || raw === "-" ? "" : Number(raw));
                requestAnimationFrame(() => {
                    if (!inputRef.current) return;
                    let count = 0, pos = 0;
                    for (; pos < formatted.length && count < digitsBeforeCursor; pos++) {
                        if (formatted[pos] !== ",") count++;
                    }
                    inputRef.current.setSelectionRange(pos, pos);
                });
            }}
        />
    );
}
