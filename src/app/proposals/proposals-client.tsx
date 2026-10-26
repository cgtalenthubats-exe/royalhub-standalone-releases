"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProposalListItem } from "@/app/actions/proposals";
import { createProposal, deleteProposal } from "@/app/actions/proposals";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface EmpOpt { id: number; name: string; position_title: string | null }

const STATUS_STYLE: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    submitted: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
};

export function ProposalsClient({ proposals, employees }: { proposals: ProposalListItem[]; employees: EmpOpt[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pickedId, setPickedId] = useState<number | "">("");
    const [creating, setCreating] = useState(false);

    async function create() {
        if (!pickedId) { toast.error("Pick a person first"); return; }
        setCreating(true);
        const res = await createProposal(Number(pickedId));
        setCreating(false);
        if (res.ok && res.id) { setOpen(false); setPickedId(""); router.push(`/proposals/${res.id}`); }
        else toast.error(res.error || "Could not create proposal");
    }

    async function remove(p: ProposalListItem) {
        if (!confirm(`Delete the proposal for "${p.employee_name}"?`)) return;
        const res = await deleteProposal(p.proposal_id);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Proposals</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">{proposals.length} appointment / compensation review proposals</p>
                </div>
                <Button className="gap-1.5 bg-[#0b1f3a] hover:bg-[#0b1f3a]/90" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> New Proposal
                </Button>
            </div>

            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                <div className="min-w-[760px]">
                    <div className="grid sticky top-0 z-10 items-center px-[18px] h-[42px] bg-[#0b1f3a] text-white text-[11.5px] font-semibold uppercase tracking-[.04em]"
                        style={{ gridTemplateColumns: "1.6fr 1.4fr 1fr .9fr .9fr .8fr" }}>
                        <div>Employee</div>
                        <div>Position</div>
                        <div>Status</div>
                        <div>Effective</div>
                        <div>Updated</div>
                        <div>Actions</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {proposals.map((p) => (
                            <div key={p.proposal_id} className="grid items-center px-[18px] h-[46px] text-[12.5px]" style={{ gridTemplateColumns: "1.6fr 1.4fr 1fr .9fr .9fr .8fr" }}>
                                <Link href={`/proposals/${p.proposal_id}`} className="font-bold text-[#0f172a] truncate pr-2 hover:underline">{p.employee_name}</Link>
                                <div className="text-slate-500 truncate pr-2">{p.position_title || "—"}</div>
                                <div><span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[p.status]}`}>{p.status}</span></div>
                                <div className="text-slate-500">{p.effective_date ? formatDate(p.effective_date) : "—"}</div>
                                <div className="text-slate-400">{formatDate(p.updated_at)}</div>
                                <div className="flex items-center gap-1">
                                    <Link href={`/proposals/${p.proposal_id}`} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#0b1f3a] px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                                        <FileText className="h-3 w-3" />
                                    </Link>
                                    <button onClick={() => remove(p)} className="flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {proposals.length === 0 && (
                            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No proposals yet</div>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>New Proposal</DialogTitle></DialogHeader>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Person</label>
                        <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={pickedId} onChange={(e) => setPickedId(e.target.value ? Number(e.target.value) : "")}>
                            <option value="">— select —</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.position_title ? ` — ${e.position_title}` : ""}</option>)}
                        </select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={create} disabled={creating} className="gap-1.5">{creating && <Loader2 className="h-4 w-4 animate-spin" />} Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
