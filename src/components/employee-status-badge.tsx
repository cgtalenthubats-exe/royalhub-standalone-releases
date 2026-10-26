"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeeStatus } from "@/app/actions/employee-crud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

type Status = "Active" | "Resigned";

export function EmployeeStatusBadge({ employeeId, status, resignDate, resignReason }: {
    employeeId: number; status: string; resignDate: string | null; resignReason: string | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draftStatus, setDraftStatus] = useState<Status>(status === "Resigned" ? "Resigned" : "Active");
    const [draftDate, setDraftDate] = useState(resignDate || "");
    const [draftReason, setDraftReason] = useState(resignReason || "");

    function openEdit() {
        setDraftStatus(status === "Resigned" ? "Resigned" : "Active");
        setDraftDate(resignDate || "");
        setDraftReason(resignReason || "");
        setOpen(true);
    }

    async function save() {
        if (draftStatus === "Resigned" && !draftDate) { toast.error("Effective date is required"); return; }
        setSaving(true);
        const res = await updateEmployeeStatus(employeeId, {
            status: draftStatus,
            resign_date: draftDate || null,
            resignation_reason: draftReason || null,
        });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    return (
        <>
            <button
                type="button"
                onClick={openEdit}
                className="cursor-pointer"
                title={status === "Resigned" ? [resignDate && `Effective ${formatDate(resignDate)}`, resignReason].filter(Boolean).join(" · ") || "Click to edit" : "Click to edit"}
            >
                <Badge className={`text-[11px] px-2 py-0.5 transition-opacity hover:opacity-80 ${status === "Active" ? "bg-emerald-600" : "bg-slate-400"}`}>
                    {status}
                </Badge>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader><DialogTitle>Change Employment Status</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                            <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={draftStatus}
                                onChange={(e) => setDraftStatus(e.target.value as Status)}
                            >
                                <option value="Active">Active</option>
                                <option value="Resigned">Resigned</option>
                            </select>
                        </div>
                        {draftStatus === "Resigned" && (
                            <>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Effective Date *</label>
                                    <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
                                    <Input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} placeholder="e.g. Accepted an offer elsewhere" />
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
