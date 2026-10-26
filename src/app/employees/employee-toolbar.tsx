"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { EmployeeListItem } from "@/app/actions/employees";
import { analyzeEmployeesCsv, type AnalyzedCsvRow } from "@/app/actions/employee-crud";
import { analyzeProfileImport, type AnalyzedProfileEmployee, type OrphanExperienceRow } from "@/app/actions/profile-import";
import { AddEmployeeWizard } from "@/components/add-employee-wizard";
import { ImportReviewDialog } from "./import-review";
import { ProfileImportReviewDialog } from "./profile-import-review";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Upload, Download, FileText, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface Opt { id: number; name: string; banner_id: number | null }
interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
interface FunctionOpt { function_id: number; name: string }
const TEMPLATE_COLS = ["name", "position", "company", "country", "date_of_birth", "hire_date", "position_effective_date", "status", "readiness_potential"];

export function EmployeeToolbar({ employees, offices, positions, functions }: { employees: EmployeeListItem[]; offices: OfficeOpt[]; positions: Opt[]; functions: FunctionOpt[] }) {
    const router = useRouter();
    const [addOpen, setAddOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [reviewRows, setReviewRows] = useState<AnalyzedCsvRow[] | null>(null);

    const [profileImportOpen, setProfileImportOpen] = useState(false);
    const [analyzingProfile, setAnalyzingProfile] = useState(false);
    const profileFileRef = useRef<HTMLInputElement>(null);
    const [profileReview, setProfileReview] = useState<{ employees: AnalyzedProfileEmployee[]; orphanExperience: OrphanExperienceRow[] } | null>(null);

    function exportCsv() {
        const rows = employees.map((e) => ({
            employee_id: e.employee_id, name: e.name, position: e.position_title || "", company: e.banner_name || "",
            function: e.function_name || "", country: e.country || "", status: e.status,
            total_compensation: e.total_compensation ?? "", latest_grade: e.latest_grade || "", team_size: e.team_size,
            hire_date: e.hire_date || "",
        }));
        const csv = Papa.unparse(rows);
        downloadText(csv, `employees-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
    }

    function downloadTemplate() {
        const example = { name: "Jane Doe", position: positions[0]?.name || "Product Manager", company: offices[0]?.banner_name || "Nexus Retail Group", country: offices[0]?.country || "England", date_of_birth: "1990-05-01", hire_date: "2022-01-01", position_effective_date: "2022-01-01", status: "Active", readiness_potential: "Medium" };
        const csv = Papa.unparse({ fields: TEMPLATE_COLS, data: [example] });
        downloadText(csv, "employee-import-template.csv", "text/csv");
    }

    function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async (res) => {
                setAnalyzing(true);
                const analyzed = await analyzeEmployeesCsv(res.data as any[]);
                setAnalyzing(false);
                if (analyzed.length === 0) { toast.error("No rows found in that file"); return; }
                setImportOpen(false);
                setReviewRows(analyzed);
            },
        });
        e.target.value = "";
    }

    function onProfileFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        (async () => {
            setAnalyzingProfile(true);
            const formData = new FormData();
            formData.append("file", file);
            const res = await analyzeProfileImport(formData);
            setAnalyzingProfile(false);
            if (!res.ok) { toast.error(res.error || "Could not read that file"); return; }
            if (res.employees.length === 0) { toast.error("No rows found on the Employees tab"); return; }
            setProfileImportOpen(false);
            setProfileReview({ employees: res.employees, orphanExperience: res.orphanExperience });
        })();
        e.target.value = "";
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Employee</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import CSV</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setProfileImportOpen(true)}><FileSpreadsheet className="h-4 w-4" /> Import Profile (Excel)</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-slate-500" onClick={downloadTemplate}><FileText className="h-4 w-4" /> Template</Button>

            <AddEmployeeWizard open={addOpen} onOpenChange={setAddOpen} offices={offices} positions={positions} functions={functions} employees={employees} />

            {/* Import dialog — picks + analyzes a file, then hands off to the review screen below */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Import Employees (CSV)</DialogTitle></DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">Upload a CSV matching the template. Likely-duplicate names and any Company/Country/Position that doesn't match the master data are flagged for review before anything is imported — nothing is rejected silently.</p>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadTemplate}><FileText className="h-4 w-4" /> Download template</Button>
                        <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="block w-full text-sm" disabled={analyzing} />
                        {analyzing && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</div>}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {reviewRows && (
                <ImportReviewDialog
                    open={reviewRows.length > 0} onOpenChange={(v) => { if (!v) setReviewRows(null); }}
                    rows={reviewRows} functions={functions} onCommitted={() => setReviewRows(null)}
                />
            )}

            {/* Import dialog for the richer "Individual Profile" Excel template — a
                separate upload flow from the CSV one above: server-side exceljs
                parse of an .xlsx, with compensation + a linked Work Experience tab. */}
            <Dialog open={profileImportOpen} onOpenChange={setProfileImportOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Import Profile (Excel)</DialogTitle></DialogHeader>
                    <div className="space-y-3 text-sm">
                        <p className="text-muted-foreground">Upload the "Individual Profile Import Template" .xlsx file sent to HR banners — the one with Employees and Work Experience tabs. Likely-duplicate names and any Company/Position that doesn't match the master data are flagged for review before anything is imported.</p>
                        <input ref={profileFileRef} type="file" accept=".xlsx" onChange={onProfileFile} className="block w-full text-sm" disabled={analyzingProfile} />
                        {analyzingProfile && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading file…</div>}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setProfileImportOpen(false)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {profileReview && (
                <ProfileImportReviewDialog
                    open={profileReview.employees.length > 0} onOpenChange={(v) => { if (!v) setProfileReview(null); }}
                    employees={profileReview.employees} orphanExperience={profileReview.orphanExperience} functions={functions}
                    onCommitted={() => setProfileReview(null)}
                />
            )}
        </div>
    );
}

function downloadText(text: string, filename: string, mime: string) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
