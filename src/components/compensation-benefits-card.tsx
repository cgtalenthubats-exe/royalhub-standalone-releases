"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Compensation } from "@/app/actions/employees";
import { updateEmployeeCompensation } from "@/app/actions/employee-crud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommaNumberInput } from "@/components/ui/comma-number-input";
import { DualModeMoneyInput, type MoneyMode } from "@/components/ui/dual-mode-money-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency, toLocalAmount } from "@/lib/format";
import { Money, useCompVisibility } from "@/components/comp-visibility";
import { useCurrencyRates } from "@/components/currency-display";
import { LocalEurToggle, type MoneyDisplayMode } from "@/components/ui/local-eur-toggle";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const OTHER_BENEFIT_LABEL = "Other benefit (please specify)";

// STI/LTI support dual %/€ entry (C10) - both DualKey fields below carry a
// {pct, amount, mode} triple in the draft instead of one plain number.
type DualKey = "sti_target" | "sti_max" | "lti_target" | "lti_max";
const DUAL_KEYS: DualKey[] = ["sti_target", "sti_max", "lti_target", "lti_max"];

const ALLOWANCE_FIELDS = [
    { key: "allowance_company_car", label: "Allowance · Company Car" },
    { key: "allowance_mobility", label: "Allowance · Mobile" },
    { key: "allowance_home_office", label: "Allowance · Housing" },
    { key: "allowance_private_medical", label: "Benefit · Medical" },
] as const;
const MONEY_FIELDS = [{ key: "other_bonus", label: "Other Bonus" }, ...ALLOWANCE_FIELDS] as const;
type MoneyKey = (typeof MONEY_FIELDS)[number]["key"];
// allowance_family_cover is free text ("Other benefit — please specify", not a
// € amount — see migration 023), so it's kept out of the numeric fields and
// handled as its own bit of state instead.

// All fields in display order, used for the read-only table.
const DISPLAY_FIELDS: { key: DualKey | MoneyKey | "base_salary"; label: string; isDual: boolean }[] = [
    { key: "base_salary", label: "Base / Salary", isDual: false },
    { key: "sti_target", label: "STI Target", isDual: true },
    { key: "sti_max", label: "STI Max", isDual: true },
    { key: "lti_target", label: "LTI Target", isDual: true },
    { key: "lti_max", label: "LTI Max", isDual: true },
    { key: "other_bonus", label: "Other Bonus", isDual: false },
    { key: "allowance_company_car", label: "Allowance · Company Car", isDual: false },
    { key: "allowance_mobility", label: "Allowance · Mobile", isDual: false },
    { key: "allowance_home_office", label: "Allowance · Housing", isDual: false },
    { key: "allowance_private_medical", label: "Benefit · Medical", isDual: false },
];

type DualFieldDraft = { pct: number | ""; amount: number | ""; mode: MoneyMode };
type Draft = { currency: string; base_salary: number | "" } & Record<DualKey, DualFieldDraft> & Record<MoneyKey, number | "">;

// Every stored amount is always the EUR-equivalent, regardless of what
// currency this card was entered in (see employee-crud.ts) - re-opening it
// for edit converts those back to the ORIGINAL local-currency figures using
// the rate frozen at save time (fx_rate_used), not today's rate, so this
// shows back exactly what was typed, never a value that's drifted since.
function toDraft(c: Compensation | null): Draft {
    const rate = c && c.currency !== "EUR" && c.fx_rate_used ? c.fx_rate_used : null;
    const back = (v: number | null): number | "" => {
        if (v == null) return "";
        return rate ? Math.round((v / rate) * 100) / 100 : v;
    };
    const base = back((c?.base_salary as number | null) ?? null);
    const baseNum = Number(base) || 0;
    const dual = {} as Record<DualKey, DualFieldDraft>;
    DUAL_KEYS.forEach((k) => {
        const amt = back((c?.[k] as number | null) ?? null);
        // Rounded to 2dp, not a whole number - rounding to a whole % (e.g.
        // 60,000/170,000 -> "35%") and then recomputing € from that on save
        // silently turned 60,000 into 59,500 even when the person never
        // touched this field. The original stays untouched (amount below)
        // unless the person actually edits this pair, so a field nobody
        // touched can't drift regardless of rounding.
        const pct = amt !== "" && baseNum ? Math.round((Number(amt) / baseNum) * 10000) / 100 : "";
        dual[k] = { pct, amount: amt, mode: "pct" };
    });
    const money = {} as Record<MoneyKey, number | "">;
    MONEY_FIELDS.forEach((f) => { money[f.key] = back((c?.[f.key] as number | null) ?? null); });
    return { currency: c?.currency || "EUR", base_salary: base, ...dual, ...money };
}

export function CompensationBenefitsCard({ employeeId, compensation, totalCompensation, canEdit = true }: {
    employeeId: number; compensation: Compensation | null; totalCompensation: number | null; canEdit?: boolean;
}) {
    const router = useRouter();
    const rates = useCurrencyRates();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<Draft>(toDraft(compensation));
    const [otherBenefit, setOtherBenefit] = useState(compensation?.allowance_family_cover || "");
    const [mode, setMode] = useState<MoneyDisplayMode>("local");

    function openEdit() { setDraft(toDraft(compensation)); setOtherBenefit(compensation?.allowance_family_cover || ""); setOpen(true); }

    // Switching "Entered in" mid-edit must re-express every figure already in
    // the form in the new currency's magnitude, not just relabel it - every
    // field here was typed assuming the OLD currency, so leaving the raw
    // numbers untouched would silently turn e.g. a €220,000 base into a
    // (much more valuable) CHF 220,000 the moment someone picks CHF without
    // retyping every field by hand.
    function changeCurrency(nextCurrency: string) {
        const rateOf = (code: string) => (code === "EUR" ? 1 : rates[code] ?? 1);
        const factor = rateOf(draft.currency) / rateOf(nextCurrency);
        const conv = (v: number | ""): number | "" => (v === "" ? "" : Math.round(Number(v) * factor * 100) / 100);
        setDraft((prev) => {
            const next: Draft = { ...prev, currency: nextCurrency, base_salary: conv(prev.base_salary) };
            DUAL_KEYS.forEach((k) => { next[k] = { ...prev[k], amount: conv(prev[k].amount) }; });
            MONEY_FIELDS.forEach((f) => { (next as any)[f.key] = conv(prev[f.key]); });
            return next;
        });
    }

    const draftBase = Number(draft.base_salary) || 0;
    function setDual(key: DualKey, next: { pct: number | ""; amount: number | "" }) {
        setDraft((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
    }
    function setDualMode(key: DualKey, mode: MoneyMode) {
        setDraft((prev) => ({ ...prev, [key]: { ...prev[key], mode } }));
    }

    // Client feedback (C10): total was silently dropping all 4 allowance
    // fields, even though they're right here on this same card. Max isn't
    // added in - it's a ceiling, not a paid amount.
    const draftTotal = draftBase + (Number(draft.sti_target.amount) || 0) + (Number(draft.lti_target.amount) || 0)
        + (Number(draft.other_bonus) || 0)
        + (Number(draft.allowance_company_car) || 0) + (Number(draft.allowance_mobility) || 0)
        + (Number(draft.allowance_home_office) || 0) + (Number(draft.allowance_private_medical) || 0);
    // Today's rate, for a live "≈ €X" hint only - the actual conversion that
    // gets stored uses whatever rate is current at the moment Save is
    // clicked (see getCurrentRate in employee-crud.ts).
    const draftRate = draft.currency !== "EUR" ? rates[draft.currency] : 1;

    async function save() {
        setSaving(true);
        const num = (v: number | "") => (v === "" ? null : v);
        const res = await updateEmployeeCompensation(employeeId, {
            currency: draft.currency,
            base_salary: num(draft.base_salary),
            sti_target: num(draft.sti_target.amount),
            sti_max: num(draft.sti_max.amount),
            lti_target: num(draft.lti_target.amount),
            lti_max: num(draft.lti_max.amount),
            other_bonus: num(draft.other_bonus),
            allowance_company_car: num(draft.allowance_company_car),
            allowance_mobility: num(draft.allowance_mobility),
            allowance_home_office: num(draft.allowance_home_office),
            allowance_private_medical: num(draft.allowance_private_medical),
            allowance_family_cover: otherBenefit.trim() || null,
        });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    const c = compensation;
    // Precise (not rounded-to-whole-%) percentage of base salary, for display
    // next to the € amount on the bonus rows — e.g. "(35.3%)". Computed off
    // the raw stored EUR figures - the ratio is identical whatever currency
    // the figures are then shown in, so this is unaffected by `mode` below.
    const pctOfBase = (amt: number | null | undefined): string | null => {
        if (amt == null || !c?.base_salary) return null;
        return `${((amt / c.base_salary) * 100).toFixed(1)}%`;
    };
    const rows: [string, number | null | undefined, string | null][] = [
        ["Compensation (Total)", totalCompensation, null],
        ...DISPLAY_FIELDS.map((f) => [f.label, c?.[f.key as keyof Compensation] as number | null | undefined, f.isDual ? pctOfBase(c?.[f.key as keyof Compensation] as number | null) : null] as [string, number | null | undefined, string | null]),
    ];
    // This card shows every figure in whatever currency the record was
    // entered in by default ("local") - every field here shares the same
    // currency/fx_rate_used since it's all one record - with a toggle to
    // force everything to EUR instead.
    const conv = (v: number | null | undefined) => (mode === "eur" ? { value: v ?? null, currency: "EUR" } : toLocalAmount(v, c?.currency, c?.fx_rate_used));
    const otherBenefitVis = useCompVisibility();

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Compensation &amp; Benefits</span>
                <div className="flex items-center gap-2">
                    <LocalEurToggle mode={mode} onChange={setMode} dark />
                    {canEdit && (
                        <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
                            <Pencil className="h-3 w-3" /> Edit
                        </Button>
                    )}
                </div>
            </div>
            <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-slate-100">
                    {rows.map(([k, v, pct]) => {
                        const { value, currency } = conv(v);
                        return (
                        <tr key={k}>
                            <td className="px-3.5 py-2 text-slate-500">
                                {k}
                                {k === "Compensation (Total)" && c && c.currency !== "EUR" && (
                                    <div className="text-[9px] font-normal text-slate-400">entered in {c.currency}</div>
                                )}
                            </td>
                            <td className="px-3.5 py-2 text-right font-mono font-medium text-[#0f172a]">
                                {pct && <span className="mr-1.5 font-sans text-[10.5px] font-normal text-slate-400">({pct})</span>}
                                <Money value={value} currency={currency} />
                            </td>
                        </tr>
                        );
                    })}
                    <tr>
                        <td className="px-3.5 py-2 text-slate-500">{OTHER_BENEFIT_LABEL}</td>
                        <td className="px-3.5 py-2 text-right font-medium text-[#0f172a]">
                            {otherBenefitVis === "visible" ? (c?.allowance_family_cover || "—")
                                : otherBenefitVis === "blurred" ? <span className="select-none blur-[3px]" aria-hidden>hidden</span>
                                : <span className="text-slate-400">•••</span>}
                        </td>
                    </tr>
                </tbody>
            </table>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Edit Compensation &amp; Benefits</DialogTitle></DialogHeader>
                    <div className="space-y-4">
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
                                <label className="mb-1 block text-xs font-medium text-slate-600">Base / Salary ({draft.currency})</label>
                                <CommaNumberInput value={draft.base_salary} onChange={(v) => setDraft({ ...draft, base_salary: v })} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Other Bonus ({draft.currency})</label>
                                <CommaNumberInput value={draft.other_bonus} onChange={(v) => setDraft({ ...draft, other_bonus: v })} />
                            </div>
                        </div>

                        {/* STI Target and Max grouped together — they're the same thing, just shown apart before */}
                        <div className="rounded-lg border border-slate-200 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">STI / Short-term incentive</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[11px] text-slate-500">Target</label>
                                    <DualModeMoneyInput mode={draft.sti_target.mode} onModeChange={(m) => setDualMode("sti_target", m)} pct={draft.sti_target.pct} amount={draft.sti_target.amount} base={draftBase} onChange={(next) => setDual("sti_target", next)} currencyLabel={draft.currency} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] text-slate-500">Max</label>
                                    <DualModeMoneyInput mode={draft.sti_max.mode} onModeChange={(m) => setDualMode("sti_max", m)} pct={draft.sti_max.pct} amount={draft.sti_max.amount} base={draftBase} onChange={(next) => setDual("sti_max", next)} currencyLabel={draft.currency} />
                                </div>
                            </div>
                        </div>

                        {/* LTI Target and Max grouped together */}
                        <div className="rounded-lg border border-slate-200 p-3">
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">LTI / Long-term incentive</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[11px] text-slate-500">Target</label>
                                    <DualModeMoneyInput mode={draft.lti_target.mode} onModeChange={(m) => setDualMode("lti_target", m)} pct={draft.lti_target.pct} amount={draft.lti_target.amount} base={draftBase} onChange={(next) => setDual("lti_target", next)} currencyLabel={draft.currency} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] text-slate-500">Max</label>
                                    <DualModeMoneyInput mode={draft.lti_max.mode} onModeChange={(m) => setDualMode("lti_max", m)} pct={draft.lti_max.pct} amount={draft.lti_max.amount} base={draftBase} onChange={(next) => setDual("lti_max", next)} currencyLabel={draft.currency} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {ALLOWANCE_FIELDS.map((f) => (
                                <div key={f.key}>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">{f.label} ({draft.currency})</label>
                                    <CommaNumberInput value={draft[f.key]} onChange={(v) => setDraft({ ...draft, [f.key]: v })} />
                                </div>
                            ))}
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-slate-600">{OTHER_BENEFIT_LABEL}</label>
                                <Input value={otherBenefit} onChange={(e) => setOtherBenefit(e.target.value)} placeholder="e.g. gym membership, transport pass…" />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Comp (base + STI + LTI + other bonus + allowances)</span>
                        <div className="text-right">
                            <span className="text-[15px] font-extrabold tabular-nums text-[#0b1f3a]">{formatCurrency(draftTotal, draft.currency)}</span>
                            {draft.currency !== "EUR" && draftRate ? (
                                <div className="text-[10.5px] text-slate-400">≈ {formatCurrency(Math.round(draftTotal * draftRate), "EUR")} at today's rate</div>
                            ) : null}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
