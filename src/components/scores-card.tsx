"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { saveEmployeeScores } from "@/app/actions/positions";
import { Pencil, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

type Scores = { leadership: number | null; experiences: number | null; skill: number | null; market: number | null };
type Req = Scores | null;

const CATS = [
    { key: "leadership", label: "Leadership" },
    { key: "experiences", label: "Experiences" },
    { key: "skill", label: "Skill" },
    { key: "market", label: "Market" },
] as const;

export function ScoresCard({ employeeId, scores, req }: { employeeId: number; scores: Scores | null; req: Req }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<Scores>(scores || { leadership: 5, experiences: 5, skill: 5, market: 5 });

    async function save() {
        setSaving(true);
        const res = await saveEmployeeScores(employeeId, {
            leadership: clamp(draft.leadership), experiences: clamp(draft.experiences),
            skill: clamp(draft.skill), market: clamp(draft.market),
        });
        setSaving(false);
        if (res.ok) { toast.success("Scores saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2 text-sm font-semibold text-white">
                <span>Competency Scores <span className="font-normal text-white/60">vs position requirement</span></span>
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => { setDraft(scores || { leadership: 5, experiences: 5, skill: 5, market: 5 }); setOpen(true); }}>
                    <Pencil className="h-3 w-3" /> Edit
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {CATS.map((c) => {
                    const val = scores ? (scores as any)[c.key] as number | null : null;
                    const need = req ? (req as any)[c.key] as number | null : null;
                    const pass = val != null && need != null ? val >= need : null;
                    return (
                        <div key={c.key} className="rounded-lg border p-3 text-center">
                            <div className="text-[11px] font-medium text-slate-500">{c.label}</div>
                            <div className="mt-1 text-2xl font-bold text-[#0b1f3a]">{val ?? "-"}<span className="text-sm font-normal text-slate-400">/10</span></div>
                            {need != null && (
                                <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} req {need}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Competency Scores (1–10)</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        {CATS.map((c) => (
                            <div key={c.key}>
                                <label className="mb-1 block text-xs font-medium text-slate-600">{c.label}</label>
                                <Input type="number" min={1} max={10} value={(draft as any)[c.key] ?? ""}
                                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value === "" ? null : Number(e.target.value) })} />
                            </div>
                        ))}
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

function clamp(v: number | null): number | null {
    if (v === null || isNaN(v)) return null;
    return Math.max(1, Math.min(10, Math.round(v)));
}
