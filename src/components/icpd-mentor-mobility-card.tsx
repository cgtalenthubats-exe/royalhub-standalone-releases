"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { listEmployeeOptions, updateMentor, updateCrossGroupMobility } from "@/app/actions/icpd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function MentorMobilityCard({ employeeId, mentor, crossGroupMobility }: {
    employeeId: number;
    mentor: { employee_id: number; name: string } | null;
    crossGroupMobility: boolean | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [options, setOptions] = useState<{ employee_id: number; name: string }[] | null>(null);
    const [mentorId, setMentorId] = useState<number | null>(mentor?.employee_id ?? null);
    const [mobility, setMobility] = useState<boolean | null>(crossGroupMobility);

    async function openEdit() {
        setOpen(true);
        setMentorId(mentor?.employee_id ?? null);
        setMobility(crossGroupMobility);
        setLoading(true);
        setOptions(await listEmployeeOptions(employeeId));
        setLoading(false);
    }

    async function save() {
        setSaving(true);
        if (mentorId !== (mentor?.employee_id ?? null)) {
            const res = await updateMentor(employeeId, mentorId);
            if (!res.ok) { setSaving(false); toast.error(res.error || "Could not update mentor"); return; }
        }
        if (mobility !== crossGroupMobility) {
            const res = await updateCrossGroupMobility(employeeId, mobility);
            if (!res.ok) { setSaving(false); toast.error(res.error || "Could not update mobility"); return; }
        }
        setSaving(false);
        setOpen(false);
        toast.success("Saved");
        router.refresh();
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Mentor &amp; Mobility</span>
                <button onClick={openEdit} className="flex items-center gap-1 text-[11px] font-medium text-slate-200 hover:text-white transition-colors">
                    <Pencil className="h-3 w-3" /> Edit
                </button>
            </div>
            <div className="divide-y divide-slate-100 text-[12.5px]">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-slate-400">Mentor</span>
                    <span className="font-semibold text-[#0f172a]">{mentor?.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="text-slate-400">Potential Career Movement Across CRC</span>
                    <span className="font-semibold text-[#0f172a]">{crossGroupMobility == null ? "Not yet assessed" : crossGroupMobility ? "Yes" : "No"}</span>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Mentor &amp; Mobility</DialogTitle></DialogHeader>
                    {loading || !options ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Mentor</label>
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={mentorId ?? ""}
                                    onChange={(e) => setMentorId(e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="">— none —</option>
                                    {options.map((o) => <option key={o.employee_id} value={o.employee_id}>{o.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Potential Career Movement Across CRC</label>
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={mobility == null ? "" : mobility ? "yes" : "no"}
                                    onChange={(e) => setMobility(e.target.value === "" ? null : e.target.value === "yes")}
                                >
                                    <option value="">Not yet assessed</option>
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                </select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving || loading} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
