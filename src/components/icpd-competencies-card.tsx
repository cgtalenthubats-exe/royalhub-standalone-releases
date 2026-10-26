"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Competency } from "@/app/actions/icpd";
import { createCompetency, updateCompetency, deleteCompetency } from "@/app/actions/icpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharBudgetHint } from "@/components/char-budget-hint";
import { PPTX_TEXT_BUDGET } from "@/lib/pptx-text-budget";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function pptxLine(c: Pick<Competency, "competency_name" | "rating">): string {
    return c.rating ? `${c.competency_name} — ${c.rating}` : c.competency_name;
}

function empty(): Partial<Competency> {
    return { competency_name: "", rating: "" };
}

export function CompetenciesCard({ employeeId, competencies }: { employeeId: number; competencies: Competency[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<Competency> | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(c: Competency) { setEditing({ ...c }); setOpen(true); }

    async function save() {
        if (!editing) return;
        setSaving(true);
        const payload = { competency_name: editing.competency_name || "", rating: editing.rating || null };
        const res = editing.id
            ? await updateCompetency(editing.id, employeeId, payload)
            : await createCompetency(employeeId, payload);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(c: Competency) {
        if (!confirm(`Delete "${c.competency_name}"?`)) return;
        const res = await deleteCompetency(c.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Leadership Competencies</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {competencies.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0 font-medium text-[#0f172a]">{c.competency_name}</div>
                        <div className="flex shrink-0 items-center gap-2">
                            {c.rating && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">{c.rating}</span>}
                            <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(c)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {competencies.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">Nothing recorded yet — click Add.</div>}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Competency</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Competency</label>
                                <Input value={editing.competency_name || ""} onChange={(e) => setEditing({ ...editing, competency_name: e.target.value })} placeholder="e.g. Driving for Profitable Growth" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Rating (optional)</label>
                                <Input value={editing.rating || ""} onChange={(e) => setEditing({ ...editing, rating: e.target.value })} placeholder="e.g. Strong" />
                            </div>
                            <CharBudgetHint
                                count={competencies.filter((c) => c.id !== editing.id).reduce((sum, c) => sum + pptxLine(c).length, 0) + pptxLine({ competency_name: editing.competency_name || "", rating: editing.rating || null }).length}
                                budget={PPTX_TEXT_BUDGET.competencyName}
                            />
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
