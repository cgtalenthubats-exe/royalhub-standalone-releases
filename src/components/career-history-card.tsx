"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmploymentHistoryEntry } from "@/app/actions/employment-history";
import { createEmploymentHistory, updateEmploymentHistory, deleteEmploymentHistory } from "@/app/actions/employment-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

function empty(): Partial<EmploymentHistoryEntry> {
    return { banner: "", position: "", location: "", start_date: "", end_date: "", is_current: false };
}

export function CareerHistoryCard({ employeeId, history }: { employeeId: number; history: EmploymentHistoryEntry[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<EmploymentHistoryEntry> | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(h: EmploymentHistoryEntry) { setEditing({ ...h }); setOpen(true); }

    async function save() {
        if (!editing) return;
        setSaving(true);
        const payload = {
            banner: editing.banner || "",
            position: editing.position || "",
            location: editing.location || null,
            start_date: editing.start_date || null,
            end_date: editing.end_date || null,
            is_current: !!editing.is_current,
        };
        const res = editing.id
            ? await updateEmploymentHistory(editing.id, employeeId, payload)
            : await createEmploymentHistory(employeeId, payload);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(h: EmploymentHistoryEntry) {
        if (!confirm(`Delete "${h.position} at ${h.banner}"?`)) return;
        const res = await deleteEmploymentHistory(h.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    const sorted = [...history].sort((a, b) => {
        if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
        return (b.start_date || "").localeCompare(a.start_date || "");
    });

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Career History</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {sorted.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[#0f172a]">{h.position}</span>
                                {!!h.is_current && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700">Current</span>}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                                {h.banner}{h.location ? ` · ${h.location}` : ""}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                                {formatDate(h.start_date)} – {h.is_current ? "Present" : formatDate(h.end_date)}
                            </div>
                            <button onClick={() => openEdit(h)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(h)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {sorted.length === 0 && (
                    <div className="px-3.5 py-4 text-[12px] text-slate-400">No career history yet — click Add to record a past or current role (internal or external)</div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.id ? "Edit Career History" : "Add Career History"}</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Company / Employer</label>
                                <Input value={editing.banner || ""} onChange={(e) => setEditing({ ...editing, banner: e.target.value })} placeholder="e.g. Nexus Retail Group, or an external company" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Position</label>
                                <Input value={editing.position || ""} onChange={(e) => setEditing({ ...editing, position: e.target.value })} placeholder="e.g. Marketing Manager" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Location (country / city)</label>
                                <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} placeholder="e.g. France, Lyon" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Start Date</label>
                                    <Input type="date" value={editing.start_date || ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">End Date</label>
                                    <Input type="date" disabled={!!editing.is_current} value={editing.end_date || ""} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input type="checkbox" checked={!!editing.is_current} onChange={(e) => setEditing({ ...editing, is_current: e.target.checked, end_date: e.target.checked ? "" : editing.end_date })} />
                                This is their current role
                            </label>
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
