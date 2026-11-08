"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionOption } from "@/app/actions/positions";
import { createFunction, updateFunction, deleteFunction } from "@/app/actions/positions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Loader2, Check, X, Workflow } from "lucide-react";
import { toast } from "sonner";

// Functions master data (e.g. "Product", "Legal", "Human Resources") — used
// by Positions and Departments. Previously there was no way to add one
// anywhere in the app; the inline "+ New" next to every Function picker
// (@/components/function-select) creates through the same action as this
// page, so there's exactly one source of truth either way.
export function FunctionsAdmin({ functions }: { functions: FunctionOption[] }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<number | "new" | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState("");

    function startEdit(f: FunctionOption) { setEditingId(f.function_id); setEditDraft(f.name); }

    async function submitAdd() {
        if (!newName.trim()) { toast.error("Function name is required"); return; }
        setBusyId("new");
        const res = await createFunction(newName);
        setBusyId(null);
        if (!res.ok) { toast.error(res.error || "Could not add function"); return; }
        toast.success("Function added");
        setShowAdd(false);
        setNewName("");
        router.refresh();
    }

    async function submitEdit(functionId: number) {
        if (!editDraft.trim()) { toast.error("Function name is required"); return; }
        setBusyId(functionId);
        const res = await updateFunction(functionId, editDraft);
        setBusyId(null);
        if (!res.ok) { toast.error(res.error || "Could not save"); return; }
        toast.success("Saved");
        setEditingId(null);
        router.refresh();
    }

    async function remove(f: FunctionOption) {
        if (!confirm(`Delete "${f.name}"? Only works if nothing uses it.`)) return;
        setBusyId(f.function_id);
        const res = await deleteFunction(f.function_id);
        setBusyId(null);
        if (!res.ok) { toast.error(res.error || "Could not delete"); return; }
        toast.success("Function deleted");
        router.refresh();
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span className="flex items-center gap-2"><Workflow className="h-3.5 w-3.5" /> Functions</span>
                <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            {showAdd && (
                <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2.5">
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Legal" className="h-8" autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }} />
                    <Button size="sm" className="h-8 gap-1" style={{ backgroundColor: "#0b1f3a" }} disabled={busyId === "new"} onClick={submitAdd}>
                        {busyId === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => { setShowAdd(false); setNewName(""); }}>Cancel</Button>
                </div>
            )}
            <div className="divide-y divide-slate-100">
                {functions.map((f) => (
                    <div key={f.function_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                        {editingId === f.function_id ? (
                            <>
                                <Input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} className="h-8 flex-1"
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitEdit(f.function_id); } }} autoFocus />
                                <button onClick={() => submitEdit(f.function_id)} disabled={busyId === f.function_id} className="text-emerald-600 hover:text-emerald-700 p-1">
                                    {busyId === f.function_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-3.5 w-3.5" /></button>
                            </>
                        ) : (
                            <>
                                <span className="font-medium text-[#0f172a]">{f.name}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => startEdit(f)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => remove(f)} disabled={busyId === f.function_id} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                        {busyId === f.function_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
                {functions.length === 0 && (
                    <div className="px-4 py-6 text-center text-[12.5px] text-slate-400">No functions yet — click Add to create one.</div>
                )}
            </div>
        </Card>
    );
}
