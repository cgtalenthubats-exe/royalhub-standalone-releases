"use client";

import { useState } from "react";
import { getEmployeeFullOrg } from "@/app/actions/org";
import { OrgChartD3 } from "@/components/org-chart-d3";
import type { OrgFlatNode } from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Network, Loader2 } from "lucide-react";
import { toast } from "sonner";

// The same "whole hierarchy, rooted at this person" view the Proposal/
// Comparison PPTX exports draw a brief snippet of, but as the full
// interactive chart (drag-and-drop, Compact/Stack V1/Stack V2 all
// available) instead of a static picture.
export function FullOrgButton({ employeeId, employeeName }: { employeeId: number; employeeName: string }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ nodes: OrgFlatNode[]; rootId: string } | null>(null);

    async function openFullOrg() {
        setOpen(true);
        setLoading(true);
        const res = await getEmployeeFullOrg(employeeId, "banner");
        setLoading(false);
        if (!res) { toast.error("Could not load this person's org chart"); setOpen(false); return; }
        setData(res);
    }

    return (
        <>
            <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openFullOrg}>
                <Network className="h-3 w-3" /> Full Org
            </Button>

            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setData(null); }}>
                <DialogContent className="flex h-[85vh] w-[95vw] max-w-6xl flex-col sm:max-w-6xl">
                    <DialogHeader><DialogTitle>Full Org — {employeeName}</DialogTitle></DialogHeader>
                    <div className="min-h-0 flex-1">
                        {loading || !data ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                            </div>
                        ) : (
                            <OrgChartD3 nodes={data.nodes} dimension="banner" title={`Full Org — ${employeeName}`} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
