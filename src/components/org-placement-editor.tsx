"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrgPlacement, setEmployeeManager, type OrgPlacement, type OrgDimension } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const LABELS: Record<OrgDimension, { title: string; hint: string }> = {
    banner: { title: "Company (Banner)", hint: "The real management chain — this is the manager shown on the profile." },
    function: { title: "Function", hint: "Usually someone in the same company and function, but a Head of Function may cover another company (or even another function) — pick anyone here to set that up." },
    headcount: { title: "Headcount (FTE)", hint: "Drives the FTE rollup on /org/headcount." },
};

// Explicit alternative to dragging on the org chart: pick this employee's
// parent in each dimension from a list. Dragging only works for people who are
// already on the chart, in the one view you have open — this works from the
// profile, for anyone, including someone whose edge is missing or wrong.
export function OrgPlacementEditor({ employeeId, employeeName }: { employeeId: number; employeeName: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [placements, setPlacements] = useState<OrgPlacement[] | null>(null);
    const [draft, setDraft] = useState<Record<string, number | null>>({});

    async function openEdit() {
        setOpen(true);
        setLoading(true);
        const data = await getOrgPlacement(employeeId);
        setPlacements(data);
        setDraft(Object.fromEntries(data.map((p) => [p.dimension, p.parentId])));
        setLoading(false);
    }

    async function save() {
        if (!placements) return;
        setSaving(true);
        // Only push dimensions the user actually changed, so an untouched
        // dimension can't be clobbered by a stale value.
        const changed = placements.filter((p) => draft[p.dimension] !== p.parentId);
        for (const p of changed) {
            const res = await setEmployeeManager(employeeId, p.dimension, draft[p.dimension] ?? null);
            if (!res.ok) {
                setSaving(false);
                toast.error(res.error || `Could not update ${LABELS[p.dimension].title}`);
                return;
            }
        }
        setSaving(false);
        setOpen(false);
        toast.success(changed.length ? `Updated ${changed.length} reporting line${changed.length === 1 ? "" : "s"}` : "No changes");
        router.refresh();
    }

    return (
        <>
            <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
                <Pencil className="h-3 w-3" /> Edit
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Reporting lines — {employeeName}</DialogTitle></DialogHeader>

                    {loading || !placements ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3.5">
                            {placements.map((p) => (
                                <div key={p.dimension}>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Reports to — {LABELS[p.dimension].title}</label>
                                    <select
                                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                        value={draft[p.dimension] ?? ""}
                                        disabled={saving}
                                        onChange={(e) => setDraft({ ...draft, [p.dimension]: e.target.value ? Number(e.target.value) : null })}
                                    >
                                        <option value="">— nobody (top of this tree) —</option>
                                        {p.candidates.map((c) => (
                                            <option key={c.employee_id} value={c.employee_id}>
                                                {c.name}{c.position_title ? ` · ${c.position_title}` : ""}{c.banner_name ? ` · ${c.banner_name}` : ""}{p.dimension === "function" && c.function_name ? ` (${c.function_name})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[11px] text-slate-400">{LABELS[p.dimension].hint}</p>
                                </div>
                            ))}
                            <p className="text-[11px] text-slate-400">
                                Anyone who already reports to {employeeName} is left out of these lists — picking one would create a loop.
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving || loading}>
                            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
