"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CareerStep } from "@/app/actions/icpd";
import { createCareerStep, updateCareerStep, deleteCareerStep } from "@/app/actions/icpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharBudgetHint } from "@/components/char-budget-hint";
import { PPTX_TEXT_BUDGET } from "@/lib/pptx-text-budget";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FunctionOpt { function_id: number; name: string }
interface OfficeOpt { banner_id: number; banner_name: string }

function empty(): Partial<CareerStep> {
    return { destination_role: "", level: "", function_id: null, by_year: null, by_age: null, type: "", banner_id: null };
}

export function CareerStepsCard({ employeeId, steps, functions, offices }: {
    employeeId: number; steps: CareerStep[]; functions: FunctionOpt[]; offices: OfficeOpt[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<CareerStep> | null>(null);
    const [saving, setSaving] = useState(false);

    const banners = useMemo(() => {
        const seen = new Map<number, string>();
        for (const o of offices) if (!seen.has(o.banner_id)) seen.set(o.banner_id, o.banner_name);
        return [...seen.entries()].map(([banner_id, name]) => ({ banner_id, name }));
    }, [offices]);
    const functionName = (id: number | null) => functions.find((f) => f.function_id === id)?.name;
    const bannerName = (id: number | null) => banners.find((b) => b.banner_id === id)?.name;

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(s: CareerStep) { setEditing({ ...s }); setOpen(true); }

    async function save() {
        if (!editing) return;
        setSaving(true);
        const payload = {
            destination_role: editing.destination_role || "",
            level: editing.level || null,
            function_id: editing.function_id || null,
            by_year: editing.by_year || null,
            by_age: editing.by_age || null,
            type: editing.type || null,
            banner_id: editing.banner_id || null,
        };
        const res = editing.id
            ? await updateCareerStep(editing.id, employeeId, payload)
            : await createCareerStep(employeeId, payload);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(s: CareerStep) {
        if (!confirm(`Delete "${s.destination_role}"?`)) return;
        const res = await deleteCareerStep(s.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const sorted = [...steps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0));

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Career Planning</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add step
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {sorted.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="rounded bg-[#0b1f3a]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0b1f3a]">Step {s.step_order}</span>
                                <span className="font-semibold text-[#0f172a]">{s.destination_role}</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-400">
                                {[s.level, functionName(s.function_id), bannerName(s.banner_id)].filter(Boolean).join(" · ")}
                                {(s.by_year || s.by_age) && <> · By {[s.by_year, s.by_age ? `age ${s.by_age}` : null].filter(Boolean).join(" / ")}</>}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(s)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">Nothing recorded yet — click Add step.</div>}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Career Step</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Destination role</label>
                                <Input value={editing.destination_role || ""} onChange={(e) => setEditing({ ...editing, destination_role: e.target.value })} placeholder="e.g. Expansion to COO role to include Retail" />
                                <CharBudgetHint count={(editing.destination_role || "").length} budget={PPTX_TEXT_BUDGET.destinationRole} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Level</label>
                                    <Input value={editing.level || ""} onChange={(e) => setEditing({ ...editing, level: e.target.value })} placeholder="e.g. Exec" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                                    <Input value={editing.type || ""} onChange={(e) => setEditing({ ...editing, type: e.target.value })} placeholder="optional" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Function</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={editing.function_id ?? ""} onChange={(e) => setEditing({ ...editing, function_id: e.target.value ? Number(e.target.value) : null })}>
                                        <option value="">—</option>
                                        {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Company</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={editing.banner_id ?? ""} onChange={(e) => setEditing({ ...editing, banner_id: e.target.value ? Number(e.target.value) : null })}>
                                        <option value="">—</option>
                                        {banners.map((b) => <option key={b.banner_id} value={b.banner_id}>{b.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">By year</label>
                                    <Input type="number" value={editing.by_year ?? ""} onChange={(e) => setEditing({ ...editing, by_year: e.target.value ? Number(e.target.value) : null })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">By age</label>
                                    <Input type="number" value={editing.by_age ?? ""} onChange={(e) => setEditing({ ...editing, by_age: e.target.value ? Number(e.target.value) : null })} />
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
