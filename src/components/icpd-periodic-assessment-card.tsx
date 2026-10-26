"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PeriodicAssessment } from "@/app/actions/icpd";
import { upsertPeriodicAssessment, deletePeriodicAssessment } from "@/app/actions/icpd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Draft = { fiscal_year: number | ""; performance: string; commitment_engagement: string; promotion_readiness: string; risk_of_losing: string; isNew: boolean };

const AXES: { key: keyof Omit<Draft, "fiscal_year" | "isNew">; label: string }[] = [
    { key: "performance", label: "Performance" },
    { key: "commitment_engagement", label: "Commitment & Engagement" },
    { key: "promotion_readiness", label: "Promotion Readiness" },
    { key: "risk_of_losing", label: "Risk of Losing" },
];

export function PeriodicAssessmentCard({ employeeId, assessments }: { employeeId: number; assessments: PeriodicAssessment[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() {
        const nextYear = assessments.length ? Math.max(...assessments.map((a) => a.fiscal_year)) + 1 : new Date().getFullYear();
        setDraft({ fiscal_year: nextYear, performance: "", commitment_engagement: "", promotion_readiness: "", risk_of_losing: "", isNew: true });
        setOpen(true);
    }
    function openEdit(a: PeriodicAssessment) {
        setDraft({
            fiscal_year: a.fiscal_year, performance: a.performance || "", commitment_engagement: a.commitment_engagement || "",
            promotion_readiness: a.promotion_readiness || "", risk_of_losing: a.risk_of_losing || "", isNew: false,
        });
        setOpen(true);
    }

    async function save() {
        if (!draft || draft.fiscal_year === "") { toast.error("Enter a fiscal year"); return; }
        setSaving(true);
        const res = await upsertPeriodicAssessment(employeeId, {
            fiscal_year: Number(draft.fiscal_year),
            performance: draft.performance || null,
            commitment_engagement: draft.commitment_engagement || null,
            promotion_readiness: draft.promotion_readiness || null,
            risk_of_losing: draft.risk_of_losing || null,
        });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove() {
        if (!draft || draft.fiscal_year === "") return;
        if (!confirm(`Delete the FY${draft.fiscal_year} assessment?`)) return;
        const res = await deletePeriodicAssessment(employeeId, Number(draft.fiscal_year));
        if (res.ok) { toast.success("Deleted"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const sorted = [...assessments].sort((a, b) => b.fiscal_year - a.fiscal_year);

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Periodical Assessment</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add year
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {sorted.map((a) => (
                    <button key={a.fiscal_year} onClick={() => openEdit(a)} className="group block w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-500">FY{a.fiscal_year}</span>
                            <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            {AXES.map(({ key, label }) => (
                                <div key={key} className="flex items-center justify-between gap-1 rounded bg-slate-50 px-2 py-1">
                                    <span className="text-slate-400 truncate">{label}</span>
                                    <span className="font-semibold text-[#0f172a] shrink-0">{a[key] || "—"}</span>
                                </div>
                            ))}
                        </div>
                    </button>
                ))}
                {sorted.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">No data</div>}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader><DialogTitle>{draft?.isNew ? "Add Periodical Assessment" : `Edit FY${draft?.fiscal_year} Assessment`}</DialogTitle></DialogHeader>
                    {draft && (
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Fiscal Year</label>
                                {draft.isNew ? (
                                    <Input type="number" value={draft.fiscal_year} onChange={(e) => setDraft({ ...draft, fiscal_year: e.target.value === "" ? "" : Number(e.target.value) })} />
                                ) : (
                                    <div className="flex h-9 items-center rounded-md border bg-slate-50 px-3 text-sm text-slate-500">FY{draft.fiscal_year} — fixed once created</div>
                                )}
                            </div>
                            {AXES.map(({ key, label }) => (
                                <div key={key}>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
                                    <Input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} placeholder="e.g. Green" />
                                </div>
                            ))}
                        </div>
                    )}
                    <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                        {!draft?.isNew && (
                            <Button variant="ghost" className="gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={remove}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                        )}
                        <div className="ml-auto flex gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
