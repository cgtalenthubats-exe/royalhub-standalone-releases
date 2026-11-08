"use client";

import { Input } from "@/components/ui/input";
import { CommaNumberInput } from "@/components/ui/comma-number-input";

export type MoneyMode = "pct" | "amount";

// Client feedback (C10): every STI/LTI/Pension figure in the app should be
// enterable either as a % of base or as a € amount, with the other side
// converted automatically - "ใส่เป็น % ไป มันก็คำนวนออกมาว่าเป็น amount เท่าไหร่
// และถ้าใส่ amount ไป มันก็ย้อนกลับมาเป็น %". Only the field the person is
// actively editing drives the conversion; the untouched side is just a
// read-out, so a field nobody touched can never drift from what's stored.
export function DualModeMoneyInput({ mode, onModeChange, pct, amount, onChange, base, disabled }: {
    mode: MoneyMode;
    onModeChange: (m: MoneyMode) => void;
    pct: number | "";
    amount: number | "";
    onChange: (next: { pct: number | ""; amount: number | "" }) => void;
    base: number | null;
    disabled?: boolean;
}) {
    function setPct(p: number | "") {
        const amt: number | "" = p === "" || !base ? "" : Math.round((base * Number(p)) / 100);
        onChange({ pct: p, amount: amt });
    }
    function setAmount(a: number | "") {
        const p: number | "" = a === "" || !base ? "" : Math.round((Number(a) / base) * 10000) / 100;
        onChange({ pct: p, amount: a });
    }
    return (
        <div>
            <div className="mb-1 flex items-center gap-1">
                <button type="button" disabled={disabled} onClick={() => onModeChange("pct")}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${mode === "pct" ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    %
                </button>
                <button type="button" disabled={disabled} onClick={() => onModeChange("amount")}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${mode === "amount" ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    €
                </button>
            </div>
            {mode === "pct" ? (
                <Input type="number" disabled={disabled} value={pct} onChange={(e) => setPct(e.target.value === "" ? "" : Number(e.target.value))} />
            ) : (
                <CommaNumberInput disabled={disabled} value={amount} onChange={setAmount} />
            )}
            {base ? (
                <div className="mt-0.5 text-[10.5px] text-slate-400">
                    {mode === "pct"
                        ? (amount === "" ? "= —" : `= €${Number(amount).toLocaleString()}`)
                        : (pct === "" ? "= —" : `= ${pct}%`)}
                </div>
            ) : null}
        </div>
    );
}
