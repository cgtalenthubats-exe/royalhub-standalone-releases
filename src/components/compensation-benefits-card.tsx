"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Compensation } from "@/app/actions/employees";
import { updateEmployeeCompensation } from "@/app/actions/employee-crud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { Money, useCompVisibility } from "@/components/comp-visibility";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

// STI/LTI are entered as % of base (how a bonus target is always talked
// about, and how Compensation History / Proposals already do it elsewhere in
// the app) — € is only ever a derived readout, never typed directly.
const PCT_KEYS = new Set(["sti_target", "sti_max", "lti_target", "lti_max"]);
const OTHER_BENEFIT_LABEL = "Other benefit (please specify)";
const FIELDS = [
    { key: "base_salary", label: "Base / Salary" },
    { key: "sti_target", label: "STI Target" },
    { key: "sti_max", label: "STI Max" },
    { key: "lti_target", label: "LTI Target" },
    { key: "lti_max", label: "LTI Max" },
    { key: "other_bonus", label: "Other Bonus" },
    { key: "allowance_company_car", label: "Allowance · Company Car" },
    { key: "allowance_mobility", label: "Allowance · Mobile" },
    { key: "allowance_home_office", label: "Allowance · Housing" },
    { key: "allowance_private_medical", label: "Benefit · Medical" },
] as const;
// allowance_family_cover is free text ("Other benefit — please specify", not a
// € amount — see migration 023), so it's kept out of FIELDS (which drives the
// uniform numeric Draft below) and handled as its own bit of state instead.

type Draft = Record<(typeof FIELDS)[number]["key"], number | "">;

// Draft holds % for the four bonus fields, € for everything else — convert
// the stored € back to a % (relative to the stored base) when opening the edit form.
// Rounded to 2dp, not a whole number — found a real bug: rounding to a whole
// % (e.g. 60,000/170,000 -> "35%") and then recomputing € from that on save
// silently turned 60,000 into 59,500 even when the user never touched this
// field. 2dp shrinks that round-trip error from hundreds of euros to single
// digits; save() below also skips the round-trip entirely for any field the
// user didn't actually edit (see dirtyPct), so an untouched field can't drift
// at all regardless of rounding.
function toDraft(c: Compensation | null): Draft {
    const d = {} as Draft;
    const base = c?.base_salary ?? 0;
    FIELDS.forEach((f) => {
        const raw = (c?.[f.key] as number | null) ?? null;
        if (PCT_KEYS.has(f.key) && raw != null && base) d[f.key] = Math.round((raw / base) * 10000) / 100;
        else if (PCT_KEYS.has(f.key)) d[f.key] = "";
        else d[f.key] = raw ?? "";
    });
    return d;
}

export function CompensationBenefitsCard({ employeeId, compensation, totalCompensation, canEdit = true }: {
    employeeId: number; compensation: Compensation | null; totalCompensation: number | null; canEdit?: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<Draft>(toDraft(compensation));
    const [otherBenefit, setOtherBenefit] = useState(compensation?.allowance_family_cover || "");
    // Which PCT_KEYS fields the user has actually edited this time round —
    // save() uses this to leave any untouched bonus field's € exactly as
    // stored, instead of round-tripping it through % and back (see toDraft's
    // comment for why that round-trip isn't safe to do unconditionally).
    const [dirtyPct, setDirtyPct] = useState<Set<string>>(new Set());

    function openEdit() { setDraft(toDraft(compensation)); setOtherBenefit(compensation?.allowance_family_cover || ""); setDirtyPct(new Set()); setOpen(true); }

    const draftBase = Number(draft.base_salary) || 0;
    const pctToAmt = (pct: number | "") => (pct === "" || !draftBase ? 0 : Math.round((draftBase * Number(pct)) / 100));
    // The € that will actually be saved for a bonus field: recomputed from its
    // % only if the user touched it, otherwise the original stored € untouched.
    function effectiveAmt(key: "sti_target" | "sti_max" | "lti_target" | "lti_max"): number {
        if (dirtyPct.has(key)) return pctToAmt(draft[key]);
        return (compensation?.[key] as number | null) ?? 0;
    }
    const draftTotal = draftBase + effectiveAmt("sti_target") + effectiveAmt("lti_target") + (Number(draft.other_bonus) || 0);

    async function save() {
        setSaving(true);
        const num = (v: number | "") => (v === "" ? null : v);
        const pctField = (key: "sti_target" | "sti_max" | "lti_target" | "lti_max") =>
            draft[key] === "" ? null : effectiveAmt(key);
        const res = await updateEmployeeCompensation(employeeId, {
            currency: compensation?.currency || "EUR",
            base_salary: num(draft.base_salary),
            sti_target: pctField("sti_target"),
            sti_max: pctField("sti_max"),
            lti_target: pctField("lti_target"),
            lti_max: pctField("lti_max"),
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
    // next to the € amount on the bonus rows — e.g. "(35.3%)".
    const pctOfBase = (amt: number | null | undefined): string | null => {
        if (amt == null || !c?.base_salary) return null;
        return `${((amt / c.base_salary) * 100).toFixed(1)}%`;
    };
    const rows: [string, number | null | undefined, string | null][] = [
        ["Compensation (Total)", totalCompensation, null],
        ...FIELDS.map((f) => [f.label, c?.[f.key], PCT_KEYS.has(f.key) ? pctOfBase(c?.[f.key] as number | null) : null] as [string, number | null | undefined, string | null]),
    ];
    const otherBenefitVis = useCompVisibility();

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Compensation &amp; Benefits</span>
                {canEdit && (
                    <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
                        <Pencil className="h-3 w-3" /> Edit
                    </Button>
                )}
            </div>
            <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-slate-100">
                    {rows.map(([k, v, pct]) => (
                        <tr key={k}>
                            <td className="px-3.5 py-2 text-slate-500">{k}</td>
                            <td className="px-3.5 py-2 text-right font-mono font-medium text-[#0f172a]">
                                {pct && <span className="mr-1.5 font-sans text-[10.5px] font-normal text-slate-400">({pct})</span>}
                                <Money value={v} currency={c?.currency} />
                            </td>
                        </tr>
                    ))}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FIELDS.map((f) => {
                            const isPct = PCT_KEYS.has(f.key);
                            return (
                                <div key={f.key}>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">{f.label} ({isPct ? "%" : "€"})</label>
                                    <Input
                                        type="number"
                                        value={draft[f.key]}
                                        onChange={(e) => {
                                            setDraft({ ...draft, [f.key]: e.target.value === "" ? "" : Number(e.target.value) });
                                            if (isPct) setDirtyPct((prev) => new Set(prev).add(f.key));
                                        }}
                                    />
                                    {isPct && draft[f.key] !== "" && draftBase > 0 && (
                                        <div className="mt-0.5 text-[10.5px] text-slate-400">
                                            = €{(dirtyPct.has(f.key) ? pctToAmt(draft[f.key]) : effectiveAmt(f.key as "sti_target" | "sti_max" | "lti_target" | "lti_max")).toLocaleString()}
                                            {!dirtyPct.has(f.key) && <span className="italic"> (unchanged)</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-slate-600">{OTHER_BENEFIT_LABEL}</label>
                            <Input value={otherBenefit} onChange={(e) => setOtherBenefit(e.target.value)} placeholder="e.g. gym membership, transport pass…" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Comp (base + STI + LTI + other bonus)</span>
                        <span className="text-[15px] font-extrabold tabular-nums text-[#0b1f3a]">{formatCurrency(draftTotal)}</span>
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
