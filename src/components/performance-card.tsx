"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PerformanceGrade } from "@/app/actions/employees";
import { upsertPerformanceGrade, deletePerformanceGrade } from "@/app/actions/performance";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { gradeColor } from "@/lib/format";

// Not a DB-enforced enum (performance_grades.grade has no CHECK constraint) —
// gradeColor() itself only keys off the first character(s) ("A…" / "B+" /
// "B…" / else), so this list is just the common set, not a hard boundary.
const GRADE_OPTIONS = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D"];

type Draft = { fiscal_year: number | ""; grade: string; label: string; isNew: boolean };

export function PerformanceCard({ employeeId, performance, canEdit = true }: {
    employeeId: number; performance: PerformanceGrade[]; canEdit?: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() {
        const nextYear = performance.length ? Math.max(...performance.map((p) => p.fiscal_year)) + 1 : new Date().getFullYear();
        setDraft({ fiscal_year: nextYear, grade: "", label: "", isNew: true });
        setOpen(true);
    }
    function openEdit(p: PerformanceGrade) {
        setDraft({ fiscal_year: p.fiscal_year, grade: p.grade || "", label: p.label || "", isNew: false });
        setOpen(true);
    }

    async function save() {
        if (!draft || draft.fiscal_year === "") { toast.error("Enter a fiscal year"); return; }
        setSaving(true);
        const res = await upsertPerformanceGrade(employeeId, {
            fiscal_year: Number(draft.fiscal_year),
            grade: draft.grade || null,
            label: draft.label || null,
        });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove() {
        if (!draft || draft.fiscal_year === "") return;
        if (!confirm(`Delete the FY${draft.fiscal_year} grade?`)) return;
        const res = await deletePerformanceGrade(employeeId, Number(draft.fiscal_year));
        if (res.ok) { toast.success("Deleted"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const sorted = [...performance].sort((a, b) => b.fiscal_year - a.fiscal_year);

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Performance — Last 5 Years</span>
                {canEdit && (
                    <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Add year
                    </button>
                )}
            </div>
            <div className="flex gap-2 p-3.5">
                {sorted.length === 0 && <div className="text-[12px] text-slate-400">No data</div>}
                {sorted.map((p) => (
                    <button
                        key={p.fiscal_year}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => openEdit(p)}
                        title={p.label || undefined}
                        className={`group relative flex flex-1 flex-col items-center gap-0.5 rounded-[8px] border border-slate-200 p-2 transition-colors ${canEdit ? "cursor-pointer hover:border-[#0b1f3a]/40 hover:bg-slate-50" : ""}`}
                    >
                        <div className="text-[9.5px] font-semibold text-slate-400">FY{p.fiscal_year}</div>
                        <div className={`text-[16px] font-extrabold rounded px-1 ${gradeColor(p.grade)}`}>{p.grade || "—"}</div>
                        {canEdit && <Pencil className="absolute right-1 top-1 h-2.5 w-2.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />}
                    </button>
                ))}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[380px]">
                    <DialogHeader><DialogTitle>{draft?.isNew ? "Add Performance Year" : `Edit FY${draft?.fiscal_year} Grade`}</DialogTitle></DialogHeader>
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
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Grade</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.grade} onChange={(e) => setDraft({ ...draft, grade: e.target.value })}>
                                    <option value="">— none —</option>
                                    {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Label (optional)</label>
                                <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Exceeds expectations" />
                            </div>
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
