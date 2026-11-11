"use client";

export type MoneyDisplayMode = "local" | "eur";

// A table/card that shows each compensation record in whatever currency it
// was originally entered in (the default) can flip every figure to EUR for
// an apples-to-apples view instead - this is that two-way switch. Unlike the
// old global display-currency switcher, this is local to whatever
// table/card it's mounted on, and only ever shows EUR or each record's own
// currency - never a third currency.
export function LocalEurToggle({ mode, onChange, dark }: { mode: MoneyDisplayMode; onChange: (m: MoneyDisplayMode) => void; dark?: boolean }) {
    const base = "rounded px-2 py-0.5 text-[10.5px] font-semibold transition-colors";
    const active = dark ? "bg-white text-[#0b1f3a]" : "bg-[#0b1f3a] text-white";
    const inactive = dark ? "bg-white/10 text-white/60 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200";
    return (
        <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChange("local")} className={`${base} ${mode === "local" ? active : inactive}`}>
                Local
            </button>
            <button type="button" onClick={() => onChange("eur")} className={`${base} ${mode === "eur" ? active : inactive}`}>
                EUR
            </button>
        </div>
    );
}
