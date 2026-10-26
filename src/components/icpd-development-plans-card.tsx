"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DevelopmentPlan, DevelopmentPlanCategory } from "@/app/actions/icpd";
import { createDevelopmentPlan, updateDevelopmentPlan, deleteDevelopmentPlan } from "@/app/actions/icpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharBudgetHint } from "@/components/char-budget-hint";
import { PPTX_TEXT_BUDGET } from "@/lib/pptx-text-budget";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function empty(): Partial<DevelopmentPlan> {
    return { plan: "", next_steps: "", by_when: "", status: "" };
}

export function DevelopmentPlansCard({ employeeId, plans, category, title = "Action Plan" }: {
    employeeId: number; plans: DevelopmentPlan[]; category: DevelopmentPlanCategory; title?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<DevelopmentPlan> | null>(null);
    const [saving, setSaving] = useState(false);
    const rows = plans.filter((p) => p.category === category);
    const budget = category === "action_plan" ? PPTX_TEXT_BUDGET.actionPlanField : PPTX_TEXT_BUDGET.nextRolePrepField;

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(p: DevelopmentPlan) { setEditing({ ...p }); setOpen(true); }

    async function save() {
        if (!editing) return;
        setSaving(true);
        const payload = {
            plan: editing.plan || "",
            next_steps: editing.next_steps || null,
            by_when: editing.by_when || null,
            status: editing.status || null,
        };
        const res = editing.id
            ? await updateDevelopmentPlan(editing.id, employeeId, payload)
            : await createDevelopmentPlan(employeeId, { ...payload, category });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(p: DevelopmentPlan) {
        if (!confirm(`Delete "${p.plan}"?`)) return;
        const res = await deleteDevelopmentPlan(p.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>{title}</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {rows.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0">
                            <div className="font-semibold text-[#0f172a]">{p.plan}</div>
                            {p.next_steps && <div className="text-[11.5px] text-slate-500 mt-0.5">{p.next_steps}</div>}
                            <div className="mt-1 flex items-center gap-2 text-[10.5px] text-slate-400">
                                {p.by_when && <span>By {p.by_when}</span>}
                                {p.status && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{p.status}</span>}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(p)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {rows.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">Nothing recorded yet — click Add.</div>}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} {title}</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Plan</label>
                                <Input value={editing.plan || ""} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} placeholder="e.g. Develop to CEO ready" />
                                <CharBudgetHint count={(editing.plan || "").length} budget={budget} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Next steps</label>
                                <textarea
                                    className="h-24 w-full resize-none rounded-md border bg-background p-2.5 text-sm"
                                    value={editing.next_steps || ""}
                                    onChange={(e) => setEditing({ ...editing, next_steps: e.target.value })}
                                    placeholder="e.g. Take responsibility for Retail"
                                />
                                <CharBudgetHint count={(editing.next_steps || "").length} budget={budget} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">By when</label>
                                    <Input value={editing.by_when || ""} onChange={(e) => setEditing({ ...editing, by_when: e.target.value })} placeholder="e.g. April 2027" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                                    <Input value={editing.status || ""} onChange={(e) => setEditing({ ...editing, status: e.target.value })} placeholder="e.g. In progress" />
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
