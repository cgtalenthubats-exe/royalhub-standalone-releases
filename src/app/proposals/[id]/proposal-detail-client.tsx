"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProposalDetail, SalaryReviewColumn, ProposalBoardEntry } from "@/app/actions/proposals";
import { updateProposal, updateProposalCompensation, setProposalBoard } from "@/app/actions/proposals";
import type { EmployeeListItem, EmployeeDetail } from "@/app/actions/employees";
import { getComparisonData } from "@/app/actions/employees";
import { ComparisonV2Client, type ComparisonV2Handle } from "@/app/comparison_v2/comparison-v2-client";
import type { ProposalAssessment } from "@/app/actions/ai-assessment";
import { AiAssessmentTab } from "@/components/ai-assessment-tab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useUnsavedChangesGuard } from "@/components/unsaved-changes";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { formatCurrency, formatDate, formatYears } from "@/lib/format";
import { exportProposalPptx } from "@/lib/pptx-export";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2, FileDown, Save, FileText } from "lucide-react";
import { toast } from "sonner";

const NAVY = "#0b1f3a";
const STATUS_OPTIONS = ["draft", "submitted", "approved"] as const;

export function ProposalDetailClient({ detail, allEmployees, board, assessment, canEditComp, initialTab = "proposal" }: { detail: ProposalDetail; allEmployees: EmployeeListItem[]; board: ProposalBoardEntry[]; assessment: ProposalAssessment | null; canEditComp: boolean; initialTab?: "proposal" | "comparison" | "assessment" }) {
    const router = useRouter();
    const { employee, positions, employees, historyColumns } = detail;
    const proposalId = detail.proposal.proposal_id;
    const [tab, setTab] = useState<"proposal" | "comparison" | "assessment">(initialTab);
    // Real (non-what-if) peer ids from the saved board — used for AI Assessment
    // peer count and as the PPTX export fallback if the live board isn't ready yet.
    const comparisonIds = useMemo(() => board.filter((b) => b.type === "peer").map((b) => b.employee_id), [board]);

    // Comparison tab has unsaved changes (add/remove/reorder/what-if) that
    // haven't been persisted via its own explicit Save button — used to guard
    // navigating away: tab switch and the breadcrumb back-link (handled
    // directly below), the top nav bar (registered into UnsavedChangesProvider
    // so AppNav — a component with no idea what "this proposal's board" even
    // is — can still prompt before navigating away from it), and closing or
    // refreshing the tab (the browser's native beforeunload prompt).
    const comparisonRef = useRef<ComparisonV2Handle>(null);
    const [boardDirty, setBoardDirty] = useState(false);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const pendingLeaveRef = useRef<(() => void) | null>(null);
    const { setGuard } = useUnsavedChangesGuard();

    function guardLeave(action: () => void) {
        if (tab === "comparison" && boardDirty) {
            pendingLeaveRef.current = action;
            setLeaveDialogOpen(true);
        } else {
            action();
        }
    }
    function requestTab(next: "proposal" | "comparison" | "assessment") {
        guardLeave(() => setTab(next));
    }
    function handleBackClick(e: React.MouseEvent) {
        e.preventDefault();
        guardLeave(() => router.push("/proposals"));
    }
    async function confirmLeaveSave() {
        const ok = await comparisonRef.current?.save();
        if (ok) { setLeaveDialogOpen(false); pendingLeaveRef.current?.(); pendingLeaveRef.current = null; }
    }
    function confirmLeaveDiscard() {
        setLeaveDialogOpen(false);
        pendingLeaveRef.current?.();
        pendingLeaveRef.current = null;
    }
    function cancelLeave() {
        setLeaveDialogOpen(false);
        pendingLeaveRef.current = null;
    }

    useEffect(() => {
        if (tab === "comparison" && boardDirty) {
            setGuard((_href, proceed) => { pendingLeaveRef.current = proceed; setLeaveDialogOpen(true); });
        } else {
            setGuard(null);
        }
        return () => setGuard(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, boardDirty]);

    // Browser-level navigation (close tab, refresh, type a new URL) — the
    // in-app cases above cover everything else.
    useEffect(() => {
        function handler(e: BeforeUnloadEvent) {
            if (tab === "comparison" && boardDirty) { e.preventDefault(); e.returnValue = ""; }
        }
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [tab, boardDirty]);

    const [form, setForm] = useState({
        status: detail.proposal.status,
        approval_new_role: detail.proposal.approval_new_role,
        approval_comp_adjustment: detail.proposal.approval_comp_adjustment,
        approval_other_label: detail.proposal.approval_other_label || "",
        new_position_id: detail.proposal.new_position_id,
        new_manager_id: detail.proposal.new_manager_id,
        effective_date: detail.proposal.effective_date || "",
        justification: detail.proposal.justification || "",
        role_description: detail.proposal.role_description || "",
        target_fiscal_year: detail.proposal.target_fiscal_year || new Date().getFullYear() + 1,
    });
    // The position this proposal is actually for — the new one if changing
    // roles, else the employee's current one — so "view original JD" always
    // points at what's relevant, not necessarily what's selected in the dropdown.
    const jdPosition = useMemo(
        () => positions.find((p) => p.position_id === (form.new_position_id ?? employee.position_id)),
        [positions, form.new_position_id, employee.position_id]
    );
    const [jdOpen, setJdOpen] = useState(false);
    const [comp, setComp] = useState({
        base_salary: detail.compensation.base_salary ?? 0,
        cash_allowance: detail.compensation.cash_allowance ?? 0,
        sti_eligible_pct: detail.compensation.sti_eligible_pct ?? 0,
        sti_amount: detail.compensation.sti_amount ?? 0,
        lti_eligible_pct: detail.compensation.lti_eligible_pct ?? 0,
        lti_amount: detail.compensation.lti_amount ?? 0,
        pension_contribution: detail.compensation.pension_contribution ?? 0,
        other_items: detail.compensation.other_items || "",
        other_remarks: detail.compensation.other_remarks || "",
    });
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Latest live comparison board (subject + peers + what-if scenarios, in the
    // on-screen drag order) — used for the PPTX Peer Benchmarking slide.
    const boardRef = useRef<EmployeeDetail[]>([]);

    const proposeColumn: SalaryReviewColumn = useMemo(() => ({
        fiscal_year: form.target_fiscal_year,
        label: `${form.target_fiscal_year} Propose`,
        banner: employee.banner_name, role: employee.position_title,
        effective: form.effective_date || null,
        base_salary: comp.base_salary, cash_allowance: comp.cash_allowance,
        guaranteed_cash: comp.base_salary + comp.cash_allowance,
        sti_eligible_pct: comp.sti_eligible_pct, sti_amount: comp.sti_amount,
        lti_eligible_pct: comp.lti_eligible_pct, lti_amount: comp.lti_amount,
        total_comp: comp.base_salary + comp.sti_amount + comp.lti_amount,
        pension_contribution: comp.pension_contribution,
        other_items: comp.other_items || null, other_remarks: comp.other_remarks || null,
        proposed: true,
    }), [comp, form.target_fiscal_year, form.effective_date, employee]);

    const currentColumn = historyColumns[historyColumns.length - 1];
    // % change reads better than a raw euro delta on a comp-review table —
    // guard divide-by-zero for anyone with no current base/total on file.
    const pctChange = (proposed: number | null | undefined, current: number | null | undefined) =>
        current ? ((proposed ?? 0) - current) / current * 100 : null;
    const changeColumn = {
        base_salary: pctChange(proposeColumn.base_salary, currentColumn.base_salary),
        total_comp: pctChange(proposeColumn.total_comp, currentColumn.total_comp),
    };

    async function save() {
        setSaving(true);
        const [r1, r2] = await Promise.all([
            updateProposal(detail.proposal.proposal_id, {
                status: form.status,
                approval_new_role: form.approval_new_role,
                approval_comp_adjustment: form.approval_comp_adjustment,
                approval_other_label: form.approval_other_label || null,
                new_position_id: form.new_position_id,
                new_manager_id: form.new_manager_id,
                effective_date: form.effective_date || null,
                justification: form.justification || null,
                role_description: form.role_description || null,
                target_fiscal_year: form.target_fiscal_year,
            }),
            canEditComp ? updateProposalCompensation(detail.proposal.proposal_id, comp) : Promise.resolve<{ ok: boolean; error?: string }>({ ok: true }),
        ]);
        setSaving(false);
        if (r1.ok && r2.ok) { toast.success("Saved"); router.refresh(); }
        else toast.error(r1.error || r2.error || "Save failed");
    }

    async function exportPptx() {
        setExporting(true);
        try {
            // Peer Benchmarking data: prefer the live board (respects drag order
            // and includes what-if scenarios); fall back to the saved set if the
            // comparison tab was never opened this session.
            const peerIds = [employee.employee_id, ...comparisonIds];
            const comparisonPeople = boardRef.current.length
                ? boardRef.current
                : comparisonIds.length
                    ? (await getComparisonData(peerIds)).sort((a, b) => peerIds.indexOf(a.employee_id) - peerIds.indexOf(b.employee_id))
                    : [];
            await exportProposalPptx({
                employee,
                newPositionTitle: positions.find((p) => p.position_id === form.new_position_id)?.title || null,
                newManagerName: employees.find((e) => e.employee_id === form.new_manager_id)?.name || null,
                approvalNewRole: form.approval_new_role,
                approvalCompAdjustment: form.approval_comp_adjustment,
                approvalOtherLabel: form.approval_other_label,
                effectiveDate: form.effective_date,
                justification: form.justification,
                roleDescription: form.role_description,
                historyColumns: [...historyColumns, proposeColumn],
                comparisonPeople,
                assessment: assessment ? { headline: assessment.headline, fitBullets: assessment.fit_bullets, marketBullets: assessment.market_bullets } : null,
            });
            toast.success("Exported PPTX 🎉");
        } catch (e: any) {
            toast.error("Export failed: " + (e?.message || ""));
        } finally {
            setExporting(false);
        }
    }

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    <Link href="/proposals" onClick={handleBackClick} className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-[#0b1f3a] font-medium transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Proposals
                    </Link>
                    <span className="text-slate-300">/</span>
                    <h1 className="text-[20px] sm:text-[22px] font-extrabold tracking-tight" style={{ color: NAVY }}>{employee.name}</h1>
                    <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                        className="h-7 rounded-full border-0 px-3 text-[11px] font-semibold capitalize"
                        style={{ backgroundColor: form.status === "approved" ? "#d1fae5" : form.status === "submitted" ? "#fef3c7" : "#f1f5f9", color: form.status === "approved" ? "#047857" : form.status === "submitted" ? "#b45309" : "#475569" }}
                    >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-1.5" style={{ backgroundColor: NAVY }} disabled={exporting} onClick={exportPptx}>
                        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Export PPTX
                    </Button>
                    {tab === "proposal" && (
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={saving} onClick={save}>
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex shrink-0 items-center gap-1 border-b border-slate-200">
                {(["proposal", "comparison", "assessment"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => requestTab(t)}
                        className={cn(
                            "relative px-3.5 py-2 text-[13px] font-semibold capitalize transition-colors",
                            tab === t ? "text-[#0b1f3a]" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        {t === "comparison" ? "Comparison" : t === "assessment" ? "AI Assessment" : "Proposal"}
                        {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />}
                    </button>
                ))}
            </div>

            <div className={tab === "proposal" ? "flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-2" : "hidden"}>
                {/* Proposal details — mirrors template page 3 top table */}
                <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                    <SectionHeader title="Proposal Details" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-4 text-[12.5px]">
                        <FieldRow label="Name">{employee.name}</FieldRow>
                        <FieldRow label="YOS">{formatYears(employee.hire_date)} total · {formatYears(employee.position_effective_date)} in position</FieldRow>
                        <FieldRow label="Current Position">{employee.position_title || "—"}</FieldRow>
                        <FieldRow label="Report to">{employee.manager?.name || "—"}</FieldRow>
                        <FieldRow label="New Position">
                            <select className="h-8 w-full rounded-md border bg-background px-2 text-[12.5px]" value={form.new_position_id ?? ""} onChange={(e) => setForm({ ...form, new_position_id: e.target.value ? Number(e.target.value) : null })}>
                                <option value="">— unchanged —</option>
                                {positions.map((p) => <option key={p.position_id} value={p.position_id}>{p.title}</option>)}
                            </select>
                        </FieldRow>
                        <FieldRow label="Report to (new)">
                            <select className="h-8 w-full rounded-md border bg-background px-2 text-[12.5px]" value={form.new_manager_id ?? ""} onChange={(e) => setForm({ ...form, new_manager_id: e.target.value ? Number(e.target.value) : null })}>
                                <option value="">— unchanged —</option>
                                {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
                            </select>
                        </FieldRow>
                        <FieldRow label="Approval For">
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={form.approval_new_role} onChange={(e) => setForm({ ...form, approval_new_role: e.target.checked })} /> New role</label>
                                <label className="flex items-center gap-2"><input type="checkbox" checked={form.approval_comp_adjustment} onChange={(e) => setForm({ ...form, approval_comp_adjustment: e.target.checked })} /> Compensation adjustment</label>
                                <div className="flex items-center gap-2">
                                    <Input className="h-7 text-[12px]" placeholder="Other…" value={form.approval_other_label} onChange={(e) => setForm({ ...form, approval_other_label: e.target.value })} />
                                </div>
                            </div>
                        </FieldRow>
                        <FieldRow label="Effective Date">
                            <Input type="date" className="h-8 w-full text-[12.5px]" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
                        </FieldRow>
                    </div>
                </Card>

                {/* Past roles + justification — page 3 bottom */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <SectionHeader title="Past Roles" />
                        <table className="w-full text-[12.5px]">
                            <thead><tr className="bg-slate-50 text-[11px] uppercase text-slate-400"><th className="px-3.5 py-1.5 text-left font-medium">Period</th><th className="px-3.5 py-1.5 text-left font-medium">Position</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                                {employee.employment_history.map((h: any) => (
                                    <tr key={h.id}>
                                        <td className="px-3.5 py-2 text-slate-500 whitespace-nowrap">{formatDate(h.start_date)} – {h.end_date ? formatDate(h.end_date) : "Current"}</td>
                                        <td className="px-3.5 py-2 text-[#0f172a] font-medium">{h.position}{h.banner ? ` · ${h.banner}` : ""}</td>
                                    </tr>
                                ))}
                                {employee.employment_history.length === 0 && <tr><td colSpan={2} className="px-3.5 py-4 text-center text-slate-400">No history recorded</td></tr>}
                            </tbody>
                        </table>
                    </Card>
                    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <SectionHeader title="Proposal Justification" />
                        <div className="p-3.5">
                            <textarea
                                className="h-32 w-full resize-none rounded-md border bg-background p-2.5 text-[12.5px]"
                                placeholder={"One point per line, e.g.\nStrong FY25 performance (A grade)\nExpanded scope to cover 2 new markets"}
                                value={form.justification}
                                onChange={(e) => setForm({ ...form, justification: e.target.value })}
                            />
                        </div>
                    </Card>
                </div>

                {/* Org snippet + role description — page 4 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <SectionHeader title="Organization" />
                        <div className="flex flex-col items-center p-4">
                            {employee.manager && (
                                <>
                                    <div className="flex items-center gap-2 rounded-[7px] border bg-slate-50 px-2.5 py-1.5 text-[12px]">
                                        <EmployeeAvatar name={employee.manager.name} photo={employee.manager.photo} size={24} />
                                        <div><div className="font-semibold text-slate-700 leading-tight">{employee.manager.name}</div><div className="text-[9.5px] text-slate-400">{employee.manager.position_title}</div></div>
                                    </div>
                                    <div className="w-px h-3 bg-black" />
                                </>
                            )}
                            {employee.functionManager && (
                                <>
                                    <div className="flex items-center gap-2 rounded-[7px] border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[12px]">
                                        <EmployeeAvatar name={employee.functionManager.name} photo={employee.functionManager.photo} size={20} />
                                        <div><div className="font-semibold text-slate-700 leading-tight">{employee.functionManager.name}</div>
                                        <div className="text-[9px] text-slate-400">Head of Function{employee.functionManager.cross_banner ? " · other company" : ""}</div></div>
                                    </div>
                                    <div className={`w-px h-3 ${employee.functionManager.cross_banner ? "border-l border-dashed border-black" : "bg-black"}`} />
                                </>
                            )}
                            <div className="flex items-center gap-2 rounded-[7px] border-2 px-2.5 py-1.5 text-[12px] shadow-sm" style={{ borderColor: NAVY }}>
                                <EmployeeAvatar name={employee.name} photo={employee.photo} size={26} />
                                <div><div className="font-bold leading-tight" style={{ color: NAVY }}>{employee.name}</div><div className="text-[10px] text-slate-500">{employee.position_title}</div></div>
                            </div>
                            {employee.reports.length > 0 && (
                                <>
                                    <div className="w-px h-3 bg-black" />
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {employee.reports.map((r) => (
                                            <div key={r.employee_id} className="relative flex flex-col items-center pt-3">
                                                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 ${r.cross_banner ? "border-l border-dashed border-black" : "bg-black"}`} />
                                                <div className={`flex w-[84px] flex-col items-center gap-1 rounded-[6px] border p-1.5 text-center ${r.status !== "Active" ? "opacity-50" : ""}`}>
                                                    <EmployeeAvatar name={r.name} photo={r.photo} size={22} />
                                                    <span className="w-full truncate text-[10.5px] font-medium leading-tight text-slate-700">{r.name.split(" ")[0]}</span>
                                                    <span className="w-full truncate text-[9px] leading-tight text-slate-400">{r.position_title}</span>
                                                    {r.cross_banner && <span className="text-[8px] font-semibold text-slate-400">other company</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </Card>
                    <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <SectionHeader title="Role Description" action={
                            jdPosition && (jdPosition.jd_content || jdPosition.jd_pdf_url) ? (
                                <button onClick={() => setJdOpen(true)} className="flex items-center gap-1 text-[11.5px] font-medium text-white/90 hover:text-white hover:underline">
                                    <FileText className="h-3.5 w-3.5" /> View original job description
                                </button>
                            ) : undefined
                        } />
                        <div className="p-3.5">
                            <textarea
                                className="h-40 w-full resize-none rounded-md border bg-background p-2.5 text-[12.5px]"
                                placeholder="Key responsibilities, scope, reporting lines…"
                                value={form.role_description}
                                onChange={(e) => setForm({ ...form, role_description: e.target.value })}
                            />
                        </div>
                    </Card>
                </div>

                {/* Salary review — page 5 */}
                <Card className="overflow-hidden p-0 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                    <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ backgroundColor: NAVY }}>
                        <span className="text-sm font-semibold text-white">Salary Review Proposal</span>
                        <label className="flex items-center gap-2 text-[11px] text-white/80">
                            Propose FY
                            <Input type="number" className="h-7 w-20 text-[12px] text-slate-900 bg-white" value={form.target_fiscal_year} onChange={(e) => setForm({ ...form, target_fiscal_year: Number(e.target.value) || form.target_fiscal_year })} />
                        </label>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 min-w-[160px] border-b border-r bg-slate-50 px-3.5 py-2 text-left text-[11px] font-medium uppercase text-slate-400">Unit: EUR</th>
                                    {historyColumns.map((c) => (
                                        <th key={c.label} className="min-w-[130px] border-b bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold text-slate-500">{c.label}</th>
                                    ))}
                                    <th className="min-w-[150px] border-b bg-sky-50 px-3 py-2 text-center text-[11px] font-semibold text-sky-700">{proposeColumn.label}</th>
                                    <th className="min-w-[110px] border-b bg-slate-50 px-3 py-2 text-center text-[11px] font-semibold italic text-slate-500">Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                <SalaryTextRow label="Banner/Unit" cols={historyColumns} propose={proposeColumn} get={(c) => c.banner} />
                                <SalaryTextRow label="Role" cols={historyColumns} propose={proposeColumn} get={(c) => c.role} />
                                <SalaryTextRow label="Effective" cols={historyColumns} propose={proposeColumn} get={(c) => c.effective ? formatDate(c.effective) : "—"} propose_editable={
                                    <Input type="date" className="h-7 w-full text-[11px]" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
                                } />
                                <SalaryNumRow label="Base Salary" bold cols={historyColumns} get={(c) => c.base_salary}
                                    proposeInput={canEditComp ? <NumInput value={comp.base_salary} onChange={(v) => setComp({ ...comp, base_salary: v })} /> : undefined}
                                    proposeValue={canEditComp ? undefined : null} change={changeColumn.base_salary} />
                                <SalaryNumRow label="Cash Allowance" cols={historyColumns} get={(c) => c.cash_allowance}
                                    proposeInput={canEditComp ? <NumInput value={comp.cash_allowance} onChange={(v) => setComp({ ...comp, cash_allowance: v })} /> : undefined}
                                    proposeValue={canEditComp ? undefined : null} />
                                <SalaryNumRow label="Guaranteed Cash" bold cols={historyColumns} get={(c) => c.guaranteed_cash} proposeValue={canEditComp ? proposeColumn.guaranteed_cash : null} />
                                <SalaryBonusRow label="STIP" cols={historyColumns} canEditComp={canEditComp}
                                    actualPct={(c) => c.sti_actual_pct} actualAmt={(c) => c.sti_amount}
                                    eligPct={(c) => c.sti_eligible_pct} base={(c) => c.base_salary}
                                    proposeAmtInput={<NumInput value={comp.sti_amount} onChange={(v) => setComp({ ...comp, sti_amount: v })} />}
                                    proposeEligInput={<PctInput value={comp.sti_eligible_pct} onChange={(v) => setComp({ ...comp, sti_eligible_pct: v })} />} />
                                <SalaryBonusRow label="LTIP" cols={historyColumns} canEditComp={canEditComp}
                                    actualPct={(c) => c.lti_actual_pct} actualAmt={(c) => c.lti_amount}
                                    eligPct={(c) => c.lti_eligible_pct} base={(c) => c.base_salary}
                                    proposeAmtInput={<NumInput value={comp.lti_amount} onChange={(v) => setComp({ ...comp, lti_amount: v })} />}
                                    proposeEligInput={<PctInput value={comp.lti_eligible_pct} onChange={(v) => setComp({ ...comp, lti_eligible_pct: v })} />} />
                                <SalaryNumRow label="Total Comp" bold gold cols={historyColumns} get={(c) => c.total_comp} proposeValue={canEditComp ? proposeColumn.total_comp : null} change={changeColumn.total_comp} />
                                <SalaryNumRow label="Pension Contribution" cols={historyColumns} get={(c) => c.pension_contribution}
                                    proposeInput={canEditComp ? <NumInput value={comp.pension_contribution} onChange={(v) => setComp({ ...comp, pension_contribution: v })} /> : undefined}
                                    proposeValue={canEditComp ? undefined : null} />
                                <SalaryTextRow label="Other items" cols={historyColumns} propose={proposeColumn} get={(c) => c.other_items} propose_editable={
                                    <Input className="h-7 text-[11px]" value={comp.other_items} onChange={(e) => setComp({ ...comp, other_items: e.target.value })} />
                                } />
                                <SalaryTextRow label="Other remarks" cols={historyColumns} propose={proposeColumn} get={(c) => c.other_remarks} propose_editable={
                                    <Input className="h-7 text-[11px]" value={comp.other_remarks} onChange={(e) => setComp({ ...comp, other_remarks: e.target.value })} />
                                } />
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* Kept mounted (hidden when inactive) so peers/what-ifs added here
                survive a tab switch until "Save" is clicked — the server `board`
                prop is only fresh on reload. */}
            <div className={tab === "comparison" ? "flex-1 lg:min-h-0" : "hidden"}>
                <ComparisonV2Client
                    ref={comparisonRef}
                    employees={allEmployees}
                    initialBoard={board}
                    lockedId={employee.employee_id}
                    onBoardChange={(p) => { boardRef.current = p; }}
                    onSaveBoard={(b) => setProposalBoard(proposalId, b)}
                    initialSavedBy={detail.proposal.board_updated_by}
                    initialSavedAt={detail.proposal.board_updated_at}
                    onDirtyChange={setBoardDirty}
                    embedded
                />
            </div>

            <div className={tab === "assessment" ? "flex-1 lg:min-h-0" : "hidden"}>
                <AiAssessmentTab
                    proposalId={proposalId}
                    subjectName={employee.name}
                    targetPosition={positions.find((p) => p.position_id === form.new_position_id)?.title || employee.position_title}
                    peerCount={comparisonIds.length}
                    assessment={assessment}
                />
            </div>

            <Dialog open={leaveDialogOpen} onOpenChange={(open) => { if (!open) cancelLeave(); }}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Save changes to the comparison?</DialogTitle></DialogHeader>
                    <p className="-mt-1 text-[13px] text-muted-foreground">
                        You've added, removed, or reordered people on the Comparison tab without saving.
                    </p>
                    <DialogFooter className="gap-1.5 sm:gap-1.5">
                        <Button variant="outline" onClick={cancelLeave}>Cancel</Button>
                        <Button variant="outline" onClick={confirmLeaveDiscard}>Don't save</Button>
                        <Button style={{ backgroundColor: NAVY }} onClick={confirmLeaveSave}>Save and leave</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={jdOpen} onOpenChange={setJdOpen}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                    <DialogHeader><DialogTitle>Job Description — {jdPosition?.title}</DialogTitle></DialogHeader>
                    {jdPosition?.jd_pdf_url && (
                        <a href={jdPosition.jd_pdf_url} target="_blank" rel="noopener noreferrer"
                            className="flex w-fit items-center gap-1.5 rounded-md border bg-slate-50 px-3 py-1.5 text-[12.5px] font-medium text-blue-600 hover:underline">
                            <FileText className="h-4 w-4" /> Open attached PDF ↗
                        </a>
                    )}
                    {jdPosition?.jd_content && (
                        <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-[13px] text-slate-700">{jdPosition.jd_content}</div>
                    )}
                    {!jdPosition?.jd_content && !jdPosition?.jd_pdf_url && (
                        <p className="text-[13px] text-muted-foreground">No job description on file for this position.</p>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
            <span>{title}</span>
            {action}
        </div>
    );
}

// STIP / LTIP rows, Mariella-style: each figure shown as "(%) | €amount".
// Historical/current columns show the actual line on top and the eligible
// (target) line beneath; the proposed column stays editable.
function bonusLine(pct: number | null | undefined, amt: number | null | undefined): string {
    return `(${pct ?? "—"}%) | ${formatCurrency(amt)}`;
}
function SalaryBonusRow({ label, cols, actualPct, actualAmt, eligPct, base, proposeAmtInput, proposeEligInput, canEditComp }: {
    label: string;
    cols: SalaryReviewColumn[];
    actualPct: (c: SalaryReviewColumn) => number | null | undefined;
    actualAmt: (c: SalaryReviewColumn) => number | null | undefined;
    eligPct: (c: SalaryReviewColumn) => number | null | undefined;
    base: (c: SalaryReviewColumn) => number | null | undefined;
    proposeAmtInput: React.ReactNode;
    proposeEligInput: React.ReactNode;
    canEditComp: boolean;
}) {
    return (
        <tr>
            <td className="sticky left-0 z-10 border-b border-r bg-slate-50 px-3.5 py-2 text-slate-500">
                <div className="font-medium text-[#0f172a]">{label} <span className="font-normal text-slate-400">(Actual)</span></div>
                <div className="text-[9.5px] text-slate-400">Eligible</div>
            </td>
            {cols.map((c) => {
                const ap = actualPct(c);
                const ep = eligPct(c);
                const b = base(c);
                const eligAmt = ep != null && b != null ? Math.round((ep * b) / 100) : null;
                return (
                    <td key={c.label} className="border-b px-3 py-2 text-right tabular-nums">
                        {ap != null ? (
                            <>
                                <div className="font-medium text-slate-800">{bonusLine(ap, actualAmt(c))}</div>
                                {ep != null && <div className="text-[9.5px] text-slate-400">{bonusLine(ep, eligAmt)}</div>}
                            </>
                        ) : ep != null ? (
                            <div className="text-slate-700">{bonusLine(ep, eligAmt)}</div>
                        ) : (
                            <div className="text-slate-300">—</div>
                        )}
                    </td>
                );
            })}
            <td className="border-b bg-sky-50/50 px-3 py-1.5 text-right">
                {canEditComp ? (
                    <>
                        {proposeAmtInput}
                        <div className="mt-0.5">{proposeEligInput}</div>
                    </>
                ) : (
                    <span className="text-slate-300">—</span>
                )}
            </td>
            <td className="border-b px-3 py-2 text-right text-slate-300">—</td>
        </tr>
    );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="w-32 shrink-0 pt-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="flex-1 pt-1 text-[#0f172a]">{children}</div>
        </div>
    );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return <Input type="number" className="h-7 w-full text-right text-[11.5px]" value={value} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />;
}
function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return <Input type="number" className="h-6 w-full text-right text-[10px] text-slate-500" value={value} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} placeholder="% eligible" />;
}

function SalaryTextRow({ label, cols, propose, get, propose_editable }: {
    label: string; cols: SalaryReviewColumn[]; propose: SalaryReviewColumn; get: (c: SalaryReviewColumn) => string | null | undefined; propose_editable?: React.ReactNode;
}) {
    return (
        <tr>
            <td className="sticky left-0 z-10 border-b border-r bg-slate-50 px-3.5 py-2 text-slate-500">{label}</td>
            {cols.map((c) => <td key={c.label} className="border-b px-3 py-2 text-center text-slate-700">{get(c) || "—"}</td>)}
            <td className="border-b bg-sky-50/50 px-3 py-1.5 text-center">{propose_editable ?? (get(propose) || "—")}</td>
            <td className="border-b px-3 py-2 text-center text-slate-300">—</td>
        </tr>
    );
}

function SalaryNumRow({ label, cols, get, proposeInput, proposeValue, change, bold, gold, sub, subInput }: {
    label: string; cols: SalaryReviewColumn[]; get: (c: SalaryReviewColumn) => number | null | undefined;
    proposeInput?: React.ReactNode; proposeValue?: number | null; change?: number | null;
    bold?: boolean; gold?: boolean; sub?: (c: SalaryReviewColumn) => string | undefined; subInput?: React.ReactNode;
}) {
    return (
        <tr>
            <td className={`sticky left-0 z-10 border-b border-r bg-slate-50 px-3.5 py-2 text-slate-500 ${bold ? "font-semibold text-[#0f172a]" : ""}`}>{label}</td>
            {cols.map((c) => (
                <td key={c.label} className={`border-b px-3 py-2 text-right tabular-nums ${bold ? "font-semibold" : ""} ${gold ? "text-amber-700 font-bold" : "text-slate-700"}`}>
                    {formatCurrency(get(c))}
                    {sub && sub(c) && <div className="text-[9.5px] font-normal text-slate-400">{sub(c)}</div>}
                </td>
            ))}
            <td className="border-b bg-sky-50/50 px-3 py-1.5 text-right">
                {proposeInput ?? <span className={`tabular-nums ${bold ? "font-semibold" : ""} ${gold ? "text-amber-700 font-bold" : ""}`}>{formatCurrency(proposeValue)}</span>}
                {subInput && <div className="mt-0.5">{subInput}</div>}
            </td>
            <td className={`border-b px-3 py-2 text-right tabular-nums ${change == null ? "text-slate-300" : change > 0 ? "text-emerald-600 font-semibold" : change < 0 ? "text-red-500 font-semibold" : "text-slate-400"}`}>
                {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
            </td>
        </tr>
    );
}
