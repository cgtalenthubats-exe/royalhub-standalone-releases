"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyRate } from "@/app/actions/currency";
import { updateCurrencyRate, addCurrency, deleteCurrency } from "@/app/actions/currency";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Loader2, Check, X, Coins } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

type Mode = "direct" | "inverse"; // direct: "1 CCY = ? EUR"   inverse: "? CCY = 1 EUR"

// GBP and CHF are naturally quoted "1 unit = X EUR" (direct); DKK is
// naturally quoted "X units = 1 EUR" (inverse, since 1 DKK is worth much
// less than 1 EUR) - letting each row pick its own entry direction avoids
// forcing an admin to type an awkward tiny decimal for currencies like DKK.
function directValue(rateToEur: number): string {
    return String(Math.round(rateToEur * 1e6) / 1e6);
}
function inverseValue(rateToEur: number): string {
    return rateToEur ? String(Math.round((1 / rateToEur) * 1e6) / 1e6) : "";
}
function guessMode(rateToEur: number): Mode {
    // A rate below 1 reads awkwardly as "1 CCY = 0.13 EUR" - default those to
    // the inverse convention ("7.45 CCY = 1 EUR") since that's how such
    // currencies are normally quoted; everything else defaults to direct.
    return rateToEur < 1 ? "inverse" : "direct";
}

function ModeToggle({ mode, onChange, code }: { mode: Mode; onChange: (m: Mode) => void; code: string }) {
    return (
        <div className="flex items-center gap-1">
            <button type="button" onClick={() => onChange("direct")}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${mode === "direct" ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                1 {code || "CCY"} = ? EUR
            </button>
            <button type="button" onClick={() => onChange("inverse")}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${mode === "inverse" ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                ? {code || "CCY"} = 1 EUR
            </button>
        </div>
    );
}

export function CurrencyAdmin({ rates }: { rates: CurrencyRate[] }) {
    const router = useRouter();
    const [busyCode, setBusyCode] = useState<string | "new" | null>(null);
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [editMode, setEditMode] = useState<Mode>("direct");
    const [editValue, setEditValue] = useState("");

    const [showAdd, setShowAdd] = useState(false);
    const [newCode, setNewCode] = useState("");
    const [newMode, setNewMode] = useState<Mode>("direct");
    const [newValue, setNewValue] = useState("");

    function startEdit(r: CurrencyRate) {
        const mode = guessMode(r.rate_to_eur);
        setEditingCode(r.currency_code);
        setEditMode(mode);
        setEditValue(mode === "direct" ? directValue(r.rate_to_eur) : inverseValue(r.rate_to_eur));
    }

    function toValueToEur(mode: Mode, raw: string): number | null {
        const n = Number(raw);
        if (!raw.trim() || !Number.isFinite(n) || n <= 0) return null;
        return mode === "direct" ? n : 1 / n;
    }

    async function submitEdit(code: string) {
        const rateToEur = toValueToEur(editMode, editValue);
        if (rateToEur == null) { toast.error("Enter a positive number"); return; }
        setBusyCode(code);
        const res = await updateCurrencyRate(code, rateToEur);
        setBusyCode(null);
        if (!res.ok) { toast.error(res.error || "Could not save"); return; }
        toast.success("Saved");
        setEditingCode(null);
        router.refresh();
    }

    async function submitAdd() {
        const rateToEur = toValueToEur(newMode, newValue);
        if (!newCode.trim()) { toast.error("Currency code is required"); return; }
        if (rateToEur == null) { toast.error("Enter a positive number"); return; }
        setBusyCode("new");
        const res = await addCurrency(newCode, rateToEur);
        setBusyCode(null);
        if (!res.ok) { toast.error(res.error || "Could not add currency"); return; }
        toast.success("Currency added");
        setShowAdd(false); setNewCode(""); setNewValue("");
        router.refresh();
    }

    async function remove(r: CurrencyRate) {
        if (!confirm(`Remove ${r.currency_code}? Only works if no record was entered in it.`)) return;
        setBusyCode(r.currency_code);
        const res = await deleteCurrency(r.currency_code);
        setBusyCode(null);
        if (!res.ok) { toast.error(res.error || "Could not remove"); return; }
        toast.success("Currency removed");
        router.refresh();
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span className="flex items-center gap-2"><Coins className="h-3.5 w-3.5" /> Currency</span>
                <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="px-4 pt-2.5 text-[11.5px] text-slate-400">
                EUR is the base currency — every other rate is quoted against it. Manual entry only; a rate you change here only affects new saves going forward, not records already saved.
            </div>
            {showAdd && (
                <div className="flex flex-wrap items-end gap-2 border-b bg-slate-50 px-4 py-2.5 mt-2.5">
                    <div>
                        <label className="mb-1 block text-[10.5px] text-slate-500">Code</label>
                        <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="e.g. SEK" maxLength={3} className="h-8 w-20" />
                    </div>
                    <div>
                        <ModeToggle mode={newMode} onChange={setNewMode} code={newCode} />
                        <Input className="h-8 w-28 mt-1" value={newValue} onChange={(e) => setNewValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }} placeholder="rate" />
                    </div>
                    <Button size="sm" className="h-8 gap-1" style={{ backgroundColor: "#0b1f3a" }} disabled={busyCode === "new"} onClick={submitAdd}>
                        {busyCode === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowAdd(false); setNewCode(""); setNewValue(""); }}>Cancel</Button>
                </div>
            )}
            <div className="divide-y divide-slate-100 mt-1">
                {rates.map((r) => {
                    const isEur = r.currency_code === "EUR";
                    const editing = editingCode === r.currency_code;
                    return (
                        <div key={r.currency_code} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                            {editing ? (
                                <>
                                    <div className="flex flex-1 flex-wrap items-end gap-2">
                                        <span className="font-semibold text-[#0f172a] w-12">{r.currency_code}</span>
                                        <div>
                                            <ModeToggle mode={editMode} onChange={(m) => { setEditMode(m); setEditValue(m === "direct" ? directValue(toValueToEur(editMode, editValue) ?? r.rate_to_eur) : inverseValue(toValueToEur(editMode, editValue) ?? r.rate_to_eur)); }} code={r.currency_code} />
                                            <Input className="h-8 w-28 mt-1" value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitEdit(r.currency_code); } }} autoFocus />
                                        </div>
                                    </div>
                                    <button onClick={() => submitEdit(r.currency_code)} disabled={busyCode === r.currency_code} className="text-emerald-600 hover:text-emerald-700 p-1">
                                        {busyCode === r.currency_code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    </button>
                                    <button onClick={() => setEditingCode(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-3.5 w-3.5" /></button>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <div className="font-semibold text-[#0f172a]">
                                            {r.currency_code} {!isEur && <span className="font-normal text-slate-500">— 1 {r.currency_code} = {directValue(r.rate_to_eur)} EUR</span>}
                                            {isEur && <span className="font-normal text-slate-400">— base currency</span>}
                                        </div>
                                        {!isEur && (
                                            <div className="text-[10.5px] text-slate-400">
                                                Last updated {formatDate(r.updated_at)}{r.updated_by ? ` by ${r.updated_by}` : ""}
                                            </div>
                                        )}
                                    </div>
                                    {!isEur && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => startEdit(r)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => remove(r)} disabled={busyCode === r.currency_code} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                                {busyCode === r.currency_code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
