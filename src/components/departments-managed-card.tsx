"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Department } from "@/app/actions/departments";
import { createDepartment, updateDepartment, deleteDepartment } from "@/app/actions/departments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Opt { id: number; name: string }
interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }

function empty(employeeId: number): Partial<Department> {
    return { name: "", owner_employee_id: employeeId, office_id: undefined, function_id: null, headcount: 0 };
}

export function DepartmentsManagedCard({ employeeId, departments, offices, functions }: {
    employeeId: number; departments: Department[]; offices: OfficeOpt[]; functions: Opt[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<Department> | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditing(empty(employeeId)); setOpen(true); }
    function openEdit(d: Department) { setEditing({ ...d }); setOpen(true); }

    async function save() {
        if (!editing?.name?.trim()) { toast.error("Name required"); return; }
        if (!editing.office_id) { toast.error("Country office required"); return; }
        setSaving(true);
        const payload = {
            name: editing.name.trim(),
            owner_employee_id: employeeId,
            office_id: editing.office_id,
            function_id: editing.function_id ?? null,
            headcount: Math.max(0, Number(editing.headcount) || 0),
        };
        const res = editing.department_id
            ? await updateDepartment(editing.department_id, payload as any)
            : await createDepartment(payload as any);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(d: Department) {
        if (!confirm(`Delete department "${d.name}"?`)) return;
        const res = await deleteDepartment(d.department_id);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const totalHeadcount = departments.reduce((s, d) => s + d.headcount, 0);

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Departments Managed{departments.length > 0 ? ` · ${totalHeadcount} FTE` : ""}</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {departments.map((d) => (
                    <div key={d.department_id} className="flex items-center gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-[#0f172a] truncate">{d.name}</div>
                            <div className="text-[10.5px] text-slate-400 truncate">{d.country}</div>
                        </div>
                        <div className="font-bold text-[#0b1f3a] tabular-nums shrink-0">{d.headcount}</div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEdit(d)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(d)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {departments.length === 0 && (
                    <div className="px-3.5 py-4 text-[12px] text-slate-400">No departments owned — click Add to create one</div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.department_id ? "Edit Department" : "Add Department"}</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. HRIS" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Country Office</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                        value={editing.office_id ?? ""}
                                        onChange={(e) => setEditing({ ...editing, office_id: e.target.value ? Number(e.target.value) : undefined })}>
                                        <option value="">— select —</option>
                                        {offices.map((o) => <option key={o.office_id} value={o.office_id}>{o.banner_name} — {o.country}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Function (optional)</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                        value={editing.function_id ?? ""}
                                        onChange={(e) => setEditing({ ...editing, function_id: e.target.value ? Number(e.target.value) : null })}>
                                        <option value="">— none —</option>
                                        {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">FTE</label>
                                <Input type="number" min={0} value={editing.headcount ?? 0}
                                    onChange={(e) => setEditing({ ...editing, headcount: e.target.value === "" ? 0 : Number(e.target.value) })} />
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
