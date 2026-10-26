"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeePositionSummary } from "@/app/actions/employees";
import { addEmployeePosition, updateEmployeePosition, removeEmployeePosition, setPrimaryPosition } from "@/app/actions/employee-positions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

interface FnOpt { function_id: number; name: string }
interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
export interface PositionCandidate { employee_position_id: number; label: string }

interface Draft {
    position_title: string;
    function_id: number | "";
    office_id: number | "";
    manager_employee_position_id: number | "";
}
function empty(): Draft {
    return { position_title: "", function_id: "", office_id: "", manager_employee_position_id: "" };
}

// A person can hold more than one position at once (see migration 026 /
// docs/SYSTEM_AUDIT.md "seat model") — each one is its own fully independent
// org-chart node with its own company/office and reporting line. This card
// lists every position and lets HR add another, mirroring
// DepartmentsManagedCard's list-of-rows-with-add-dialog shape.
export function PositionsCard({ employeeId, positions, offices, functions, candidates }: {
    employeeId: number; positions: EmployeePositionSummary[]; offices: OfficeOpt[]; functions: FnOpt[]; candidates: PositionCandidate[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null); // null = adding a new one
    const [draft, setDraft] = useState<Draft>(empty());
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditingId(null); setDraft(empty()); setOpen(true); }
    function openEdit(p: EmployeePositionSummary) {
        setEditingId(p.employee_position_id);
        setDraft({ position_title: p.position_title, function_id: p.function_id ?? "", office_id: p.office_id, manager_employee_position_id: "" });
        setOpen(true);
    }

    async function save() {
        if (!draft.position_title.trim()) { toast.error("Position title is required"); return; }
        const office = draft.office_id ? offices.find((o) => o.office_id === Number(draft.office_id)) : null;
        if (!office) { toast.error("Company / office is required"); return; }
        setSaving(true);
        const res = editingId
            ? await updateEmployeePosition(editingId, {
                position_title: draft.position_title.trim(),
                function_id: draft.function_id ? Number(draft.function_id) : null,
                banner_id: office.banner_id, office_id: office.office_id,
            })
            : await addEmployeePosition(employeeId, {
                position_title: draft.position_title.trim(),
                function_id: draft.function_id ? Number(draft.function_id) : null,
                banner_id: office.banner_id, office_id: office.office_id,
                manager_employee_position_id: draft.manager_employee_position_id ? Number(draft.manager_employee_position_id) : null,
            });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(p: EmployeePositionSummary) {
        if (!confirm(`Remove position "${p.position_title}"?`)) return;
        const res = await removeEmployeePosition(p.employee_position_id);
        if (res.ok) { toast.success("Removed"); router.refresh(); }
        else toast.error(res.error || "Could not remove");
    }

    async function makePrimary(p: EmployeePositionSummary) {
        const res = await setPrimaryPosition(employeeId, p.employee_position_id);
        if (res.ok) { toast.success(`${p.position_title} set as primary`); router.refresh(); }
        else toast.error(res.error || "Could not set primary");
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Positions{positions.length > 1 ? ` · ${positions.length}` : ""}</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="divide-y divide-slate-100">
                {positions.map((p) => (
                    <div key={p.employee_position_id} className="flex items-center gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold text-[#0f172a]">{p.position_title}</span>
                                {p.is_primary ? (
                                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#a16207]">
                                        <Star className="h-2.5 w-2.5 fill-[#a16207] text-[#a16207]" /> Primary
                                    </span>
                                ) : (
                                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-500">Concurrent</span>
                                )}
                            </div>
                            <div className="truncate text-[10.5px] text-slate-400">
                                {[p.banner_name, p.function_name, p.office_country].filter(Boolean).join(" · ")}
                                {p.manager_name ? ` · reports to ${p.manager_name}` : ""}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            {!p.is_primary && (
                                <button onClick={() => makePrimary(p)} title="Set as primary" className="rounded p-1 text-slate-400 transition-colors hover:bg-amber-50 hover:text-[#a16207]">
                                    <Star className="h-3 w-3" />
                                </button>
                            )}
                            <button onClick={() => openEdit(p)} className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#0b1f3a]">
                                <Pencil className="h-3 w-3" />
                            </button>
                            {!p.is_primary && (
                                <button onClick={() => remove(p)} className="rounded p-1 text-red-300 transition-colors hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {positions.length === 0 && (
                    <div className="px-3.5 py-4 text-[12px] text-slate-400">No positions on record</div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editingId ? "Edit Position" : "Add Position"}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                            <Input value={draft.position_title} onChange={(e) => setDraft({ ...draft, position_title: e.target.value })} placeholder="e.g. Acting CFO" />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Company / Office</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={draft.office_id} onChange={(e) => setDraft({ ...draft, office_id: e.target.value ? Number(e.target.value) : "" })}>
                                    <option value="">— select —</option>
                                    {offices.map((o) => <option key={o.office_id} value={o.office_id}>{o.banner_name} — {o.country}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Function (optional)</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={draft.function_id} onChange={(e) => setDraft({ ...draft, function_id: e.target.value ? Number(e.target.value) : "" })}>
                                    <option value="">— none —</option>
                                    {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                                </select>
                            </div>
                        </div>
                        {editingId ? (
                            <p className="text-[11px] text-slate-400">Reporting line stays as set — drag this position on the org chart to change who it reports to.</p>
                        ) : (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Reports to (optional)</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={draft.manager_employee_position_id} onChange={(e) => setDraft({ ...draft, manager_employee_position_id: e.target.value ? Number(e.target.value) : "" })}>
                                    <option value="">— top of the tree —</option>
                                    {candidates.map((c) => <option key={c.employee_position_id} value={c.employee_position_id}>{c.label}</option>)}
                                </select>
                                <p className="mt-1 text-[11px] text-slate-400">Sets this position's reporting line right away — same as dragging on the org chart, just for a position that doesn't exist yet.</p>
                            </div>
                        )}
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
