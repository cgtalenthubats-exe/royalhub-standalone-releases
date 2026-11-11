"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompensationHistoryEntry, CompHistoryInput } from "@/app/actions/compensation-history";
import { upsertCompensationHistory, updateCompensationHistory, deleteCompensationHistory } from "@/app/actions/compensation-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommaNumberInput } from "@/components/ui/comma-number-input";
import { DualModeMoneyInput, type MoneyMode } from "@/components/ui/dual-mode-money-input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, localDisplay } from "@/lib/format";
import { useCurrencyRates } from "@/components/currency-display";
import { LocalEurToggle, type MoneyDisplayMode } from "@/components/ui/local-eur-toggle";

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

// STI/LTI Eligible and Actual, and Pension, all support dual %/€ entry
// (C10) — each carries a {pct, amount, mode} triple in the draft.
type DualKey = "sti_eligible" | "sti_actual" | "lti_eligible" | "lti_actual" | "pension";
const DUAL_KEYS: DualKey[] = ["sti_eligible", "sti_actual", "lti_eligible", "lti_actual", "pension"];
type DualFieldDraft = { pct: number | ""; amount: number | ""; mode: MoneyMode };

type Draft = {
    id?: number;
    fiscal_year: number | "";
    effective_date: string;
    currency: string;
    base_salary: number | "";
    cash_allowance: number | "";
    other_bonus: number | "";
    note: string;
} & Record<DualKey, DualFieldDraft>;

function emptyDualField(): DualFieldDraft { return { pct: "", amount: "", mode: "pct" }; }

function emptyDraft(): Draft {
    return {
        fiscal_year: new Date().getFullYear() - 1,
        effective_date: "", currency: "EUR", base_salary: "", cash_allowance: "", other_bonus: "", note: "",
        sti_eligible: emptyDualField(), sti_actual: emptyDualField(), lti_eligible: emptyDualField(), lti_actual: emptyDualField(),
        pension: { pct: "", amount: "", mode: "amount" },
    };
}

// A non-EUR row stores the figures exactly as typed in local_values (see
// compensation-history.ts) - re-opening it for edit reads those straight
// back, no conversion involved, so it can never drift. local_values is only
// null for a row saved before this existed, or saved in EUR to begin with -
// for those, fall back to back-converting the stored EUR via the rate
// frozen at that save (the old behavior).
function toDraft(h: CompensationHistoryEntry): Draft {
    const lv = h.local_values;
    const rate = h.currency !== "EUR" && h.fx_rate_used ? h.fx_rate_used : null;
    const back = (key: string, v: number | null): number | "" => {
        if (lv && lv[key] != null) return lv[key] as number;
        if (v == null) return "";
        return rate ? Math.round((v / rate) * 100) / 100 : v;
    };
    return {
        id: h.id,
        fiscal_year: n(h.fiscal_year) ?? "",
        effective_date: h.effective_date || "",
        currency: h.currency || "EUR",
        base_salary: back("base_salary", n(h.base_salary)),
        cash_allowance: back("cash_allowance", n(h.cash_allowance)),
        other_bonus: back("other_bonus", n(h.other_bonus)),
        note: h.note || "",
        sti_eligible: { pct: n(h.sti_eligible_pct) ?? "", amount: back("sti_eligible_amount", n(h.sti_eligible_amount)), mode: "pct" },
        sti_actual: { pct: n(h.sti_actual_pct) ?? "", amount: back("sti_amount", n(h.sti_amount)), mode: "pct" },
        lti_eligible: { pct: n(h.lti_eligible_pct) ?? "", amount: back("lti_eligible_amount", n(h.lti_eligible_amount)), mode: "pct" },
        lti_actual: { pct: n(h.lti_actual_pct) ?? "", amount: back("lti_amount", n(h.lti_amount)), mode: "pct" },
        pension: { pct: n(h.pension_pct) ?? "", amount: back("pension_contribution", n(h.pension_contribution)), mode: "amount" },
    };
}

// Mirrors compensation-history.ts's prorationFraction exactly, for the
// dialog's live total preview — that file is a "use server" action module,
// so this small pure formula is kept in sync here rather than imported.
function prorationFraction(fiscalYear: number, effectiveDate: string | null): number {
    if (!effectiveDate) return 1;
    const d = new Date(effectiveDate);
    if (isNaN(d.getTime())) return 1;
    const MS_PER_DAY = 86400000;
    const yearStart = Date.UTC(fiscalYear, 0, 1);
    const yearEnd = Date.UTC(fiscalYear, 11, 31);
    const effective = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (effective <= yearStart) return 1;
    if (effective > yearEnd) return 0;
    const totalDays = Math.round((yearEnd - yearStart) / MS_PER_DAY) + 1;
    const daysRemaining = Math.round((yearEnd - effective) / MS_PER_DAY) + 1;
    return daysRemaining / totalDays;
}

export function CompensationHistoryCard({ employeeId, history, canEdit = true }: { employeeId: number; history: CompensationHistoryEntry[]; canEdit?: boolean }) {
    const router = useRouter();
    const rates = useCurrencyRates();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<MoneyDisplayMode>("local");

    function openAdd() { setDraft(emptyDraft()); setOpen(true); }
    function openEdit(h: CompensationHistoryEntry) { setDraft(toDraft(h)); setOpen(true); }

    // Switching "Entered in" mid-edit must re-express every figure already in
    // the form in the new currency's magnitude, not just relabel it - see the
    // identical note in compensation-benefits-card.tsx.
    function changeCurrency(nextCurrency: string) {
        const rateOf = (code: string) => (code === "EUR" ? 1 : rates[code] ?? 1);
        setDraft((prev) => {
            if (!prev) return prev;
            const factor = rateOf(prev.currency) / rateOf(nextCurrency);
            const conv = (v: number | ""): number | "" => (v === "" ? "" : Math.round(Number(v) * factor * 100) / 100);
            const next: Draft = { ...prev, currency: nextCurrency, base_salary: conv(prev.base_salary), cash_allowance: conv(prev.cash_allowance), other_bonus: conv(prev.other_bonus) };
            DUAL_KEYS.forEach((k) => { next[k] = { ...prev[k], amount: conv(prev[k].amount) }; });
            return next;
        });
    }

    function setDual(key: DualKey, next: { pct: number | ""; amount: number | "" }) {
        setDraft((prev) => prev && ({ ...prev, [key]: { ...prev[key], ...next } }));
    }
    function setDualMode(key: DualKey, mode: MoneyMode) {
        setDraft((prev) => prev && ({ ...prev, [key]: { ...prev[key], mode } }));
    }

    async function save() {
        if (!draft) return;
        if (draft.fiscal_year === "" || Number(draft.fiscal_year) < 1900) { toast.error("Enter a valid fiscal year"); return; }
        setSaving(true);
        const num = (v: number | "") => (v === "" ? null : v);
        const payload: CompHistoryInput = {
            fiscal_year: Number(draft.fiscal_year),
            effective_date: draft.effective_date || null,
            currency: draft.currency,
            base_salary: num(draft.base_salary),
            cash_allowance: num(draft.cash_allowance),
            other_bonus: num(draft.other_bonus),
            sti_eligible_pct: num(draft.sti_eligible.pct),
            sti_eligible_amount: num(draft.sti_eligible.amount),
            sti_actual_pct: num(draft.sti_actual.pct),
            sti_amount: num(draft.sti_actual.amount),
            lti_eligible_pct: num(draft.lti_eligible.pct),
            lti_eligible_amount: num(draft.lti_eligible.amount),
            lti_actual_pct: num(draft.lti_actual.pct),
            lti_amount: num(draft.lti_actual.amount),
            pension_contribution: num(draft.pension.amount),
            pension_pct: num(draft.pension.pct),
            note: draft.note || null,
        };
        const res = draft.id
            ? await updateCompensationHistory(draft.id, employeeId, payload)
            : await upsertCompensationHistory(employeeId, payload);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(h: CompensationHistoryEntry) {
        if (!confirm(`Delete the ${h.fiscal_year} compensation record?`)) return;
        const res = await deleteCompensationHistory(h.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const sorted = [...history].sort((a, b) => (n(b.fiscal_year) ?? 0) - (n(a.fiscal_year) ?? 0));

    // live-computed figures for the dialog — mirrors toRow()'s formula (base
    // + STI actual + LTI actual + cash allowance + pension + other bonus,
    // then prorated by effective date). Everything here is in draft.currency
    // units (whatever the picker below is set to), not necessarily EUR — the
    // server converts to EUR once, on save (see compensation-history.ts).
    const dBase = draft && draft.base_salary !== "" ? Number(draft.base_salary) : null;
    const dStiAmt = draft && draft.sti_actual.amount !== "" ? Number(draft.sti_actual.amount) : null;
    const dLtiAmt = draft && draft.lti_actual.amount !== "" ? Number(draft.lti_actual.amount) : null;
    const dPensionAmt = draft && draft.pension.amount !== "" ? Number(draft.pension.amount) : null;
    const dFullYearTotal = (dBase ?? 0) + (dStiAmt ?? 0) + (dLtiAmt ?? 0)
        + (draft && draft.cash_allowance !== "" ? Number(draft.cash_allowance) : 0)
        + (dPensionAmt ?? 0)
        + (draft && draft.other_bonus !== "" ? Number(draft.other_bonus) : 0);
    const dFraction = draft && draft.fiscal_year !== "" ? prorationFraction(Number(draft.fiscal_year), draft.effective_date || null) : 1;
    // Today's rate, for a live "≈ €X" hint only — the actual conversion that
    // gets stored uses whatever rate is current at the moment Save is
    // clicked (see getCurrentRate in employee-crud.ts/compensation-history.ts).
    const draftRate = draft && draft.currency !== "EUR" ? rates[draft.currency] : 1;
    const dTotal = dFraction < 1 ? Math.round(dFullYearTotal * dFraction) : dFullYearTotal;

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Compensation History <span className="font-normal text-white/50">· per fiscal year</span></span>
                <div className="flex items-center gap-3">
                    <LocalEurToggle mode={mode} onChange={setMode} dark />
                    {canEdit && (
                        <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                            <Plus className="h-3.5 w-3.5" /> Add year
                        </button>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-[12px]">
                    <thead>
                        <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-400">
                            <th className="px-3 py-2 text-left font-medium">FY</th>
                            <th className="px-3 py-2 text-right font-medium">Base</th>
                            <th className="px-3 py-2 text-right font-medium">Cash Allow.</th>
                            <th className="px-3 py-2 text-right font-medium">STI (act · elig)</th>
                            <th className="px-3 py-2 text-right font-medium">LTI (act · elig)</th>
                            <th className="px-3 py-2 text-right font-medium">Pension</th>
                            <th className="px-3 py-2 text-right font-medium">Other Bonus</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            <th className="px-3 py-2 text-right font-medium"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sorted.map((h) => {
                            // Each row keeps its OWN entered currency by default ("local") -
                            // one history card can hold a GBP year next to a CHF year next
                            // to a EUR year, each shown as it was actually entered - the
                            // toggle above forces every row to EUR instead.
                            const fmt = (v: number | null, key: string) => {
                                const conv = mode === "eur" ? { value: v, currency: "EUR" } : localDisplay(h.local_values?.[key], v, h.currency, h.fx_rate_used);
                                return formatCurrency(conv.value, conv.currency);
                            };
                            return (
                            <tr key={h.id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2 font-semibold text-[#0f172a]">
                                    {h.fiscal_year}A
                                    {h.currency !== "EUR" && <div className="text-[9px] font-normal text-slate-400">entered in {h.currency}</div>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(n(h.base_salary), "base_salary")}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(n(h.cash_allowance), "cash_allowance")}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                    {fmt(n(h.sti_amount), "sti_amount")}
                                    <div className="text-[9.5px] text-slate-400">{pctPair(n(h.sti_actual_pct), n(h.sti_eligible_pct))}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                    {fmt(n(h.lti_amount), "lti_amount")}
                                    <div className="text-[9.5px] text-slate-400">{pctPair(n(h.lti_actual_pct), n(h.lti_eligible_pct))}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(n(h.pension_contribution), "pension_contribution")}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(n(h.other_bonus), "other_bonus")}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0b1f3a]">{fmt(n(h.total_comp), "total_comp")}</td>
                                <td className="px-3 py-2">
                                    {canEdit && (
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(h)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors"><Pencil className="h-3 w-3" /></button>
                                            <button onClick={() => remove(h)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"><Trash2 className="h-3 w-3" /></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                            );
                        })}
                        {sorted.length === 0 && (
                            <tr><td colSpan={9} className="px-3.5 py-4 text-[12px] text-slate-400">No compensation history yet — click “Add year” to record base, STI/LTI and pension for a fiscal year.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{draft?.id ? "Edit Compensation Year" : "Add Compensation Year"}</DialogTitle></DialogHeader>
                    {draft && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Fiscal Year</label>
                                    <Input type="number" value={draft.fiscal_year} onChange={(e) => setDraft({ ...draft, fiscal_year: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="e.g. 2025" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Effective Date</label>
                                    <Input type="date" value={draft.effective_date} onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })} />
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Entered in</label>
                                <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={draft.currency}
                                    onChange={(e) => changeCurrency(e.target.value)}
                                >
                                    {Object.keys(rates).sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b))).map((code) => (
                                        <option key={code} value={code}>{code}</option>
                                    ))}
                                </select>
                                {draft.currency !== "EUR" && (
                                    <p className="mt-1 text-[10.5px] text-slate-400">
                                        Every amount below is in {draft.currency}. {draftRate ? `Saved as the EUR equivalent at today's rate (1 ${draft.currency} = ${Math.round(draftRate * 10000) / 10000} EUR).` : `No rate set for ${draft.currency} yet — add one in Settings > Currency before saving.`}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Base Salary ({draft.currency})</label>
                                    <CommaNumberInput value={draft.base_salary} onChange={(v) => setDraft({ ...draft, base_salary: v })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Cash Allowance ({draft.currency})</label>
                                    <CommaNumberInput value={draft.cash_allowance} onChange={(v) => setDraft({ ...draft, cash_allowance: v })} />
                                </div>
                            </div>

                            {/* STI */}
                            <div className="rounded-lg border border-slate-200 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">STI / Short-term incentive</span>
                                    <span className="text-[12px] font-bold tabular-nums text-[#0b1f3a]">{draft.sti_actual.amount === "" ? "—" : formatCurrency(Number(draft.sti_actual.amount), draft.currency)}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Eligible (target)</label>
                                        <DualModeMoneyInput mode={draft.sti_eligible.mode} onModeChange={(m) => setDualMode("sti_eligible", m)} pct={draft.sti_eligible.pct} amount={draft.sti_eligible.amount} base={dBase} onChange={(next) => setDual("sti_eligible", next)} currencyLabel={draft.currency} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Actual (paid)</label>
                                        <DualModeMoneyInput mode={draft.sti_actual.mode} onModeChange={(m) => setDualMode("sti_actual", m)} pct={draft.sti_actual.pct} amount={draft.sti_actual.amount} base={dBase} onChange={(next) => setDual("sti_actual", next)} currencyLabel={draft.currency} />
                                    </div>
                                </div>
                            </div>

                            {/* LTI */}
                            <div className="rounded-lg border border-slate-200 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">LTI / Long-term incentive</span>
                                    <span className="text-[12px] font-bold tabular-nums text-[#0b1f3a]">{draft.lti_actual.amount === "" ? "—" : formatCurrency(Number(draft.lti_actual.amount), draft.currency)}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Eligible (target)</label>
                                        <DualModeMoneyInput mode={draft.lti_eligible.mode} onModeChange={(m) => setDualMode("lti_eligible", m)} pct={draft.lti_eligible.pct} amount={draft.lti_eligible.amount} base={dBase} onChange={(next) => setDual("lti_eligible", next)} currencyLabel={draft.currency} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Actual (paid)</label>
                                        <DualModeMoneyInput mode={draft.lti_actual.mode} onModeChange={(m) => setDualMode("lti_actual", m)} pct={draft.lti_actual.pct} amount={draft.lti_actual.amount} base={dBase} onChange={(next) => setDual("lti_actual", next)} currencyLabel={draft.currency} />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Pension Contribution</label>
                                    <DualModeMoneyInput mode={draft.pension.mode} onModeChange={(m) => setDualMode("pension", m)} pct={draft.pension.pct} amount={draft.pension.amount} base={dBase} onChange={(next) => setDual("pension", next)} currencyLabel={draft.currency} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Other Bonus ({draft.currency})</label>
                                    <CommaNumberInput value={draft.other_bonus} onChange={(v) => setDraft({ ...draft, other_bonus: v })} />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Note</label>
                                <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="optional" />
                            </div>

                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Total Comp (base + STI + LTI + cash allow. + pension + other bonus){dFraction < 1 && ` · prorated ${Math.round(dFraction * 100)}%`}
                                </span>
                                <div className="text-right">
                                    <span className="text-[15px] font-extrabold tabular-nums text-[#0b1f3a]">{formatCurrency(dTotal, draft.currency)}</span>
                                    {draft.currency !== "EUR" && draftRate ? (
                                        <div className="text-[10.5px] text-slate-400">≈ {formatCurrency(Math.round(dTotal * draftRate), "EUR")} at today's rate</div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function pctPair(actual: number | null, eligible: number | null): string {
    const a = actual == null ? "—" : `${actual}%`;
    const e = eligible == null ? "—" : `${eligible}%`;
    return `act ${a} · elig ${e}`;
}
