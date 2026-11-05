"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStrengthDevelopment, type StrengthDevelopment } from "@/app/actions/icpd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const FIELDS: { key: keyof StrengthDevelopment; label: string }[] = [
    { key: "topStrength", label: "Top Strength" },
    { key: "developmentAreas", label: "Development Areas" },
    { key: "keyResponsibilities", label: "Key Responsibilities" },
    { key: "businessImpact", label: "Business Impact" },
];

export function StrengthDevelopmentCard({ employeeId, data }: { employeeId: number; data: StrengthDevelopment }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState<StrengthDevelopment>(data);

    function openEdit() {
        setDraft(data);
        setOpen(true);
    }

    async function save() {
        setSaving(true);
        const res = await updateStrengthDevelopment(employeeId, draft);
        setSaving(false);
        if (!res.ok) { toast.error(res.error || "Could not save"); return; }
        setOpen(false);
        toast.success("Saved");
        router.refresh();
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Top Strength and Development Areas</span>
                <button onClick={openEdit} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Pencil className="h-3 w-3" /> Edit
                </button>
            </div>
            <div className="divide-y divide-slate-100 text-[12.5px]">
                {FIELDS.map((f) => (
                    <div key={f.key} className="px-3.5 py-2.5">
                        <div className="text-slate-400">{f.label}</div>
                        <div className="mt-0.5 whitespace-pre-wrap font-medium text-[#0f172a]">{data[f.key] || "—"}</div>
                    </div>
                ))}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Top Strength and Development Areas</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        {FIELDS.map((f) => (
                            <div key={f.key}>
                                <label className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
                                <Textarea
                                    rows={3}
                                    value={draft[f.key] || ""}
                                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                                    placeholder={`Type ${f.label.toLowerCase()}…`}
                                />
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
