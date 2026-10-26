"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Achievement } from "@/app/actions/icpd";
import { createAchievement, updateAchievement, deleteAchievement } from "@/app/actions/icpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CharBudgetHint } from "@/components/char-budget-hint";
import { PPTX_TEXT_BUDGET } from "@/lib/pptx-text-budget";
import { Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

export function AchievementsCard({ employeeId, achievements }: { employeeId: number; achievements: Achievement[] }) {
    const router = useRouter();
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);

    function startAdd() { setDraft(""); setAdding(true); setEditingId(null); }
    function startEdit(a: Achievement) { setDraft(a.description); setEditingId(a.id); setAdding(false); }
    function cancel() { setAdding(false); setEditingId(null); }

    const otherTotal = achievements.filter((a) => a.id !== editingId).reduce((sum, a) => sum + a.description.length, 0);

    async function save() {
        if (!draft.trim()) { toast.error("Description is required"); return; }
        setSaving(true);
        const res = editingId
            ? await updateAchievement(editingId, employeeId, draft)
            : await createAchievement(employeeId, draft);
        setSaving(false);
        if (res.ok) { toast.success("Saved"); cancel(); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(a: Achievement) {
        if (!confirm("Delete this achievement?")) return;
        const res = await deleteAchievement(a.id, employeeId);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Achievements</span>
                <button onClick={startAdd} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add
                </button>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {achievements.map((a) =>
                    editingId === a.id ? (
                        <EditRow key={a.id} draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={cancel} otherTotal={otherTotal} />
                    ) : (
                        <div key={a.id} className="flex items-start justify-between gap-2 px-3.5 py-2.5 text-[12.5px]">
                            <div className="min-w-0 text-[#0f172a]">{a.description}</div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button onClick={() => startEdit(a)} className="text-slate-400 hover:text-[#0b1f3a] p-1 rounded hover:bg-slate-100 transition-colors">
                                    <Pencil className="h-3 w-3" />
                                </button>
                                <button onClick={() => remove(a)} className="text-red-300 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    )
                )}
                {adding && <EditRow draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={cancel} otherTotal={otherTotal} />}
                {achievements.length === 0 && !adding && <div className="px-3.5 py-4 text-[12px] text-slate-400">Nothing recorded yet — click Add.</div>}
            </div>
        </Card>
    );
}

function EditRow({ draft, setDraft, saving, onSave, onCancel, otherTotal }: {
    draft: string; setDraft: (v: string) => void; saving: boolean; onSave: () => void; onCancel: () => void; otherTotal: number;
}) {
    return (
        <div className="px-3.5 py-2.5">
            <div className="flex items-center gap-2">
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. EBIT (pre-bonus) of £43.3m" className="h-8 text-[12.5px]" autoFocus />
                <button onClick={onSave} disabled={saving} className="shrink-0 text-emerald-600 hover:bg-emerald-50 p-1.5 rounded transition-colors">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
                <button onClick={onCancel} className="shrink-0 text-slate-400 hover:bg-slate-100 p-1.5 rounded transition-colors">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <CharBudgetHint count={otherTotal + draft.length} budget={PPTX_TEXT_BUDGET.achievementDescription} />
        </div>
    );
}
