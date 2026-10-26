"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Department } from "@/app/actions/departments";
import { createDepartment, updateDepartment, deleteDepartment } from "@/app/actions/departments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Opt { id: number; name: string }
interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }

function empty(): Partial<Department> {
    return { name: "", owner_employee_id: null, office_id: undefined, function_id: null, headcount: 0 };
}

export function DepartmentsClient({ departments, employees, offices, functions }: {
    departments: Department[]; employees: Opt[]; offices: OfficeOpt[]; functions: Opt[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<Department> | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(d: Department) { setEditing({ ...d }); setOpen(true); }

    async function save() {
        if (!editing?.name?.trim()) { toast.error("Name required"); return; }
        if (!editing.office_id) { toast.error("Company/office required"); return; }
        setSaving(true);
        const payload = {
            name: editing.name.trim(),
            owner_employee_id: editing.owner_employee_id ?? null,
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
        <>
            {/* Page header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Departments</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">
                        {departments.length} departments · {totalHeadcount} total FTE
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/org/headcount">
                        <Button variant="outline">‹ Back to Org Chart</Button>
                    </Link>
                    <Button className="gap-1.5 bg-[#0b1f3a] hover:bg-[#0b1f3a]/90" onClick={openAdd}>
                        <Plus className="h-4 w-4" /> Add Department
                    </Button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                <div className="min-w-[760px]">
                    <div
                        className="grid sticky top-0 z-10 items-center px-[18px] h-[42px] bg-[#0b1f3a] text-white text-[11.5px] font-semibold uppercase tracking-[.04em]"
                        style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr .9fr .9fr .8fr .8fr" }}
                    >
                        <div>Department</div>
                        <div>Owner</div>
                        <div>Company</div>
                        <div>Country</div>
                        <div>Function</div>
                        <div>FTE</div>
                        <div>Actions</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {departments.map((d) => (
                            <div key={d.department_id} className="grid items-center px-[18px] h-[46px] text-[12.5px]" style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr .9fr .9fr .8fr .8fr" }}>
                                <div className="font-bold text-[#0f172a] truncate pr-2">{d.name}</div>
                                <div className="text-slate-600 truncate pr-2">{d.owner_name || <span className="text-slate-400">Vacant</span>}</div>
                                <div className="text-slate-500 truncate pr-2">{d.banner_name || "—"}</div>
                                <div className="text-slate-500">{d.country || "—"}</div>
                                <div className="text-slate-500 truncate pr-2">{d.function_name || "—"}</div>
                                <div className="font-bold text-[#0b1f3a] tabular-nums">{d.headcount}</div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => openEdit(d)} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#0b1f3a] px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                                        <Pencil className="h-3 w-3" />
                                    </button>
                                    <button onClick={() => remove(d)} className="flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {departments.length === 0 && (
                            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No departments yet</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add / Edit dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.department_id ? "Edit Department" : "Add Department"}</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                                <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. HRIS" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Owner (optional — leave vacant if no one assigned yet)</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={editing.owner_employee_id ?? ""}
                                    onChange={(e) => setEditing({ ...editing, owner_employee_id: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">— vacant —</option>
                                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Company / Office</label>
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
        </>
    );
}
