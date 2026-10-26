"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeDetail } from "@/app/actions/employees";
import { getEmployeeIcpd } from "@/app/actions/icpd";
import { deleteEmployee } from "@/app/actions/employee-crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { buildProfileHtml } from "./export-profile-html";
import { Printer, FileOutput, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ProfileActions({ employee, canSeePersonal }: { employee: EmployeeDetail; canSeePersonal: boolean }) {
    const router = useRouter();
    const [exporting, setExporting] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [confirmName, setConfirmName] = useState("");
    const [deleting, setDeleting] = useState(false);

    function printPdf() {
        const html = buildProfileHtml(employee, canSeePersonal);
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 350);
    }

    async function exportIcpd() {
        setExporting(true);
        try {
            const icpd = await getEmployeeIcpd(employee.employee_id);
            const { exportIcpdProfilePptx } = await import("@/lib/pptx-export");
            await exportIcpdProfilePptx({ employee, icpd });
        } catch (err: any) {
            toast.error(err.message || "Export failed");
        } finally {
            setExporting(false);
        }
    }

    async function confirmDelete() {
        setDeleting(true);
        const res = await deleteEmployee(employee.employee_id);
        setDeleting(false);
        if (res.ok) {
            toast.success(`${employee.name} deleted`);
            router.push("/employees");
            router.refresh();
        } else {
            toast.error(res.error || "Delete failed");
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={printPdf}>
                <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportIcpd} disabled={exporting}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileOutput className="h-3.5 w-3.5" />} Export ICPD
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => { setConfirmName(""); setDeleteOpen(true); }}>
                <Trash2 className="h-3.5 w-3.5" />
            </Button>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Delete {employee.name}?</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <p className="text-[13px] text-slate-600">
                            This permanently removes their profile, compensation, performance history, ICPD data, and any documents.
                            This can't be undone.
                        </p>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">
                                Type <span className="font-semibold text-slate-800">{employee.name}</span> to confirm
                            </label>
                            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoFocus />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
                        <Button
                            variant="destructive"
                            className="gap-1.5"
                            disabled={deleting || confirmName !== employee.name}
                            onClick={confirmDelete}
                        >
                            {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
