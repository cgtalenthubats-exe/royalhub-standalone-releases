"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBackground, updateBackground, deleteBackground } from "@/app/actions/employee-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CharBudgetHint } from "@/components/char-budget-hint";
import { PPTX_TEXT_BUDGET } from "@/lib/pptx-text-budget";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface BackgroundEntry {
    id: number;
    type: string;
    title: string;
    organization: string | null;
    detail: string | null;
}

const TYPE_OPTIONS = [
    { value: "education", label: "Education" },
    { value: "experience", label: "Experience" },
    { value: "certification", label: "Certification" },
    { value: "strength", label: "Strength" },
    { value: "development_area", label: "Development Area" },
];

// Handles both the known types above and any free-text value someone typed
// directly into the DB (the column has no CHECK constraint) — falls back to
// turning underscores into spaces and capitalizing each word.
function typeLabel(type: string): string {
    const known = TYPE_OPTIONS.find((t) => t.value === type);
    if (known) return known.label;
    return type.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function empty(): Partial<BackgroundEntry> {
    return { type: "experience", title: "", organization: "", detail: "" };
}

export function BackgroundCard({ employeeId, entries }: { employeeId: number; entries: BackgroundEntry[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<BackgroundEntry> | null>(null);
    const [saving, setSaving] = useState(false);

    function openAdd() { setEditing(empty()); setOpen(true); }
    function openEdit(b: BackgroundEntry) { setEditing({ ...b }); setOpen(true); }

    async function save() {
        if (!editing) return;
        setSaving(true);
        const payload = {
            type: editing.type || "experience",
            title: editing.title || "",
            organization: editing.organization || null,
            detail: editing.detail || null,
        };
        const res = editing.id
            ? await updateBackground(editing.id, employeeId, payload)
            : await createBackground(employeeId, payload);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(b: BackgroundEntry) {
        if (!confirm(`Delete "${b.title}"?`)) return;
        const res = await deleteBackground(b.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Background</span>
                <button onClick={openAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {entries.map((b) => (
                    <div key={b.id} className="flex items-start justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">{typeLabel(b.type)}</Badge>
                                <span className="font-semibold text-[#0f172a]">{b.title}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{[b.organization, b.detail].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => openEdit(b)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => remove(b)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                ))}
                {entries.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">Nothing recorded yet — click Add.</div>}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Background Entry</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={editing.type || "experience"}
                                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                                >
                                    {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                                <Input
                                    value={editing.title || ""}
                                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                    placeholder={editing.type === "education" ? "e.g. MBA" : editing.type === "strength" ? "e.g. Business Strategy" : "e.g. Regional Director"}
                                />
                                {(editing.type === "strength" || editing.type === "development_area") && (
                                    <CharBudgetHint
                                        count={entries.filter((b) => b.type === editing.type && b.id !== editing.id).reduce((sum, b) => sum + (b.title?.length || 0), 0) + (editing.title?.length || 0)}
                                        budget={editing.type === "strength" ? PPTX_TEXT_BUDGET.backgroundStrength : PPTX_TEXT_BUDGET.backgroundDevelopmentArea}
                                    />
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Organization</label>
                                    <Input
                                        value={editing.organization || ""}
                                        onChange={(e) => setEditing({ ...editing, organization: e.target.value })}
                                        placeholder={editing.type === "education" ? "e.g. Cambridge" : "optional"}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Detail</label>
                                    <Input
                                        value={editing.detail || ""}
                                        onChange={(e) => setEditing({ ...editing, detail: e.target.value })}
                                        placeholder={editing.type === "education" ? "e.g. Major / field of study" : "optional"}
                                    />
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
