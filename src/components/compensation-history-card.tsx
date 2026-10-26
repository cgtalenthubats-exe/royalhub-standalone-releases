"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompensationHistoryEntry, CompHistoryInput } from "@/app/actions/compensation-history";
import { upsertCompensationHistory, updateCompensationHistory, deleteCompensationHistory } from "@/app/actions/compensation-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

const n = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

// Money is always derived from actual% × base so what's shown matches what the
// server will store.
const euro = (base: number | null, actualPct: number | null): number | null =>
    base == null || actualPct == null ? null : Math.round((base * actualPct) / 100);

type Draft = {
    id?: number;
    fiscal_year: number | "";
    effective_date: string;
    base_salary: number | "";
    cash_allowance: number | "";
    sti_eligible_pct: number | "";
    sti_actual_pct: number | "";
    lti_eligible_pct: number | "";
    lti_actual_pct: number | "";
    pension_contribution: number | "";
    note: string;
};

function emptyDraft(): Draft {
    return {
        fiscal_year: new Date().getFullYear() - 1,
        effective_date: "", base_salary: "", cash_allowance: "",
        sti_eligible_pct: "", sti_actual_pct: "", lti_eligible_pct: "", lti_actual_pct: "",
        pension_contribution: "", note: "",
    };
}

function toDraft(h: CompensationHistoryEntry): Draft {
    return {
        id: h.id,
        fiscal_year: n(h.fiscal_year) ?? "",
        effective_date: h.effective_date || "",
        base_salary: n(h.base_salary) ?? "",
        cash_allowance: n(h.cash_allowance) ?? "",
        sti_eligible_pct: n(h.sti_eligible_pct) ?? "",
        sti_actual_pct: n(h.sti_actual_pct) ?? "",
        lti_eligible_pct: n(h.lti_eligible_pct) ?? "",
        lti_actual_pct: n(h.lti_actual_pct) ?? "",
        pension_contribution: n(h.pension_contribution) ?? "",
        note: h.note || "",
    };
}

export function CompensationHistoryCard({ employeeId, history, canEdit = true }: { employeeId: number; history: CompensationHistoryEntry[]; canEdit?: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setDraft(emptyDraft()); setOpen(true); }
    function openEdit(h: CompensationHistoryEntry) { setDraft(toDraft(h)); setOpen(true); }

    async function save() {
        if (!draft) return;
        if (draft.fiscal_year === "" || Number(draft.fiscal_year) < 1900) { toast.error("Enter a valid fiscal year"); return; }
        setSaving(true);
        const payload: CompHistoryInput = {
            fiscal_year: Number(draft.fiscal_year),
            effective_date: draft.effective_date || null,
            base_salary: draft.base_salary === "" ? null : Number(draft.base_salary),
            cash_allowance: draft.cash_allowance === "" ? null : Number(draft.cash_allowance),
            sti_eligible_pct: draft.sti_eligible_pct === "" ? null : Number(draft.sti_eligible_pct),
            sti_actual_pct: draft.sti_actual_pct === "" ? null : Number(draft.sti_actual_pct),
            lti_eligible_pct: draft.lti_eligible_pct === "" ? null : Number(draft.lti_eligible_pct),
            lti_actual_pct: draft.lti_actual_pct === "" ? null : Number(draft.lti_actual_pct),
            pension_contribution: draft.pension_contribution === "" ? null : Number(draft.pension_contribution),
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

    // live-computed figures for the dialog
    const dBase = draft && draft.base_salary !== "" ? Number(draft.base_salary) : null;
    const dStiEur = euro(dBase, draft && draft.sti_actual_pct !== "" ? Number(draft.sti_actual_pct) : null);
    const dLtiEur = euro(dBase, draft && draft.lti_actual_pct !== "" ? Number(draft.lti_actual_pct) : null);
    const dTotal = (dBase ?? 0) + (dStiEur ?? 0) + (dLtiEur ?? 0);

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Compensation History <span className="font-normal text-white/50">· per fiscal year</span></span>
                {canEdit && (
                    <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add year
                    </button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[12px]">
                    <thead>
                        <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-400">
                            <th className="px-3 py-2 text-left font-medium">FY</th>
                            <th className="px-3 py-2 text-right font-medium">Base</th>
                            <th className="px-3 py-2 text-right font-medium">Cash Allow.</th>
                            <th className="px-3 py-2 text-right font-medium">STI (act · elig)</th>
                            <th className="px-3 py-2 text-right font-medium">LTI (act · elig)</th>
                            <th className="px-3 py-2 text-right font-medium">Pension</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            <th className="px-3 py-2 text-right font-medium"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sorted.map((h) => (
                            <tr key={h.id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2 font-semibold text-[#0f172a]">{h.fiscal_year}A</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(n(h.base_salary))}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCurrency(n(h.cash_allowance))}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                    {formatCurrency(n(h.sti_amount))}
                                    <div className="text-[9.5px] text-slate-400">{pctPair(n(h.sti_actual_pct), n(h.sti_eligible_pct))}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                    {formatCurrency(n(h.lti_amount))}
                                    <div className="text-[9.5px] text-slate-400">{pctPair(n(h.lti_actual_pct), n(h.lti_eligible_pct))}</div>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{formatCurrency(n(h.pension_contribution))}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0b1f3a]">{formatCurrency(n(h.total_comp))}</td>
                                <td className="px-3 py-2">
                                    {canEdit && (
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => openEdit(h)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors"><Pencil className="h-3 w-3" /></button>
                                            <button onClick={() => remove(h)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"><Trash2 className="h-3 w-3" /></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr><td colSpan={8} className="px-3.5 py-4 text-[12px] text-slate-400">No compensation history yet — click “Add year” to record base, STI/LTI and pension for a fiscal year.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Base Salary (€)</label>
                                    <Input type="number" value={draft.base_salary} onChange={(e) => setDraft({ ...draft, base_salary: e.target.value === "" ? "" : Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Cash Allowance (€)</label>
                                    <Input type="number" value={draft.cash_allowance} onChange={(e) => setDraft({ ...draft, cash_allowance: e.target.value === "" ? "" : Number(e.target.value) })} />
                                </div>
                            </div>

                            {/* STI */}
                            <div className="rounded-lg border border-slate-200 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">STI / Short-term incentive</span>
                                    <span className="text-[12px] font-bold tabular-nums text-[#0b1f3a]">{dStiEur == null ? "—" : formatCurrency(dStiEur)}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Eligible % (target)</label>
                                        <Input type="number" value={draft.sti_eligible_pct} onChange={(e) => setDraft({ ...draft, sti_eligible_pct: e.target.value === "" ? "" : Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Actual % (paid)</label>
                                        <Input type="number" value={draft.sti_actual_pct} onChange={(e) => setDraft({ ...draft, sti_actual_pct: e.target.value === "" ? "" : Number(e.target.value) })} />
                                    </div>
                                </div>
                            </div>

                            {/* LTI */}
                            <div className="rounded-lg border border-slate-200 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">LTI / Long-term incentive</span>
                                    <span className="text-[12px] font-bold tabular-nums text-[#0b1f3a]">{dLtiEur == null ? "—" : formatCurrency(dLtiEur)}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Eligible % (target)</label>
                                        <Input type="number" value={draft.lti_eligible_pct} onChange={(e) => setDraft({ ...draft, lti_eligible_pct: e.target.value === "" ? "" : Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] text-slate-500">Actual % (paid)</label>
                                        <Input type="number" value={draft.lti_actual_pct} onChange={(e) => setDraft({ ...draft, lti_actual_pct: e.target.value === "" ? "" : Number(e.target.value) })} />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Pension Contribution (€)</label>
                                    <Input type="number" value={draft.pension_contribution} onChange={(e) => setDraft({ ...draft, pension_contribution: e.target.value === "" ? "" : Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Note</label>
                                    <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="optional" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total Comp (base + STI + LTI)</span>
                                <span className="text-[15px] font-extrabold tabular-nums text-[#0b1f3a]">{formatCurrency(dTotal)}</span>
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
