"use client";

import { useMemo, useState } from "react";
import type { EmployeeListItem, EmployeeDetail } from "@/app/actions/employees";
import { getComparisonData } from "@/app/actions/employees";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatYears, gradeColor, compensationOnly, yearsBetween } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Trophy, Clock, CalendarPlus, Users, Download, X, Plus, Printer, FileDown, Loader2 } from "lucide-react";
import { buildComparisonHtml } from "./export-html";
import { exportComparisonPptx } from "@/lib/pptx-export";
import { EmployeeAvatar } from "@/components/employee-avatar";

const MAX = 5;

export function ComparisonClient({ employees }: { employees: EmployeeListItem[] }) {
    const [selected, setSelected] = useState<number[]>([]);
    const [details, setDetails] = useState<EmployeeDetail[]>([]);
    const [simulated, setSimulated] = useState<EmployeeDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [compOnly, setCompOnly] = useState(false);

    // what-if: base employee + new total/base → adds a simulated "(adjusted)" column
    const [simBase, setSimBase] = useState<number | "">("");
    const [simTotal, setSimTotal] = useState<string>("");
    const [simBaseSalary, setSimBaseSalary] = useState<string>("");

    function addSimulation() {
        const base = details.find((d) => d.employee_id === simBase);
        if (!base) { toast.error("Pick an employee to simulate"); return; }
        const newTotal = simTotal ? Number(simTotal) : base.total_compensation || 0;
        const newBase = simBaseSalary ? Number(simBaseSalary) : base.compensation?.base_salary || 0;
        const sim: EmployeeDetail = {
            ...base,
            employee_id: -(Date.now()),
            name: `${base.name} (adjusted)`,
            total_compensation: newTotal,
            compensation: base.compensation ? { ...base.compensation, total_compensation: newTotal, base_salary: newBase } : null,
        };
        setSimulated((prev) => [...prev, sim]);
        setSimTotal(""); setSimBaseSalary(""); setSimBase("");
        toast.success("Added adjusted scenario");
    }
    function removeSim(id: number) { setSimulated((prev) => prev.filter((s) => s.employee_id !== id)); }

    const allDetails = useMemo(() => [...details, ...simulated], [details, simulated]);

    async function toggle(id: number) {
        let next: number[];
        if (selected.includes(id)) next = selected.filter((x) => x !== id);
        else {
            if (selected.length >= MAX) return;
            next = [...selected, id];
        }
        setSelected(next);
        setLoading(true);
        const data = await getComparisonData(next);
        // keep selection order
        data.sort((a, b) => next.indexOf(a.employee_id) - next.indexOf(b.employee_id));
        setDetails(data);
        setLoading(false);
    }

    const badges = useMemo(() => computeBadges(allDetails), [allDetails]);
    const chartData = useMemo(
        () => allDetails.map((d) => ({ name: d.name.includes("(adjusted)") ? d.name.replace(" (adjusted)", "*") : d.name.split(" ")[0], value: compOnly ? compensationOnly(d.compensation) : (d.total_compensation || 0), id: d.employee_id }))
            .sort((a, b) => b.value - a.value),
        [allDetails, compOnly]
    );

    function exportHtml() {
        const html = buildComparisonHtml(allDetails, compOnly);
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `employee-comparison-${new Date().toISOString().slice(0, 10)}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function printPdf() {
        const html = buildComparisonHtml(allDetails, compOnly);
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 350);
    }

    const [pptxLoading, setPptxLoading] = useState(false);
    async function exportPptx() {
        setPptxLoading(true);
        try { await exportComparisonPptx(allDetails, compOnly); toast.success("Exported PPTX 🎉"); }
        catch (e: any) { toast.error("Export failed: " + (e?.message || "")); }
        finally { setPptxLoading(false); }
    }

    return (
        <div className="flex flex-col min-h-full lg:h-full">
            {/* Page header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Employee Comparison</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">
                        Side-by-side compensation &amp; performance · {selected.length} of {MAX} slots
                    </p>
                </div>
                {details.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" className="gap-1.5 bg-[#0b1f3a] hover:bg-[#0b1f3a]/90" disabled={pptxLoading} onClick={exportPptx}>
                            {pptxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Export PPTX
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={printPdf}>
                            <Printer className="h-3.5 w-3.5" /> Print / PDF
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={exportHtml}>
                            <Download className="h-3.5 w-3.5" /> Export HTML
                        </Button>
                    </div>
                )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-2">

            {/* Picker */}
            <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">Select employees ({selected.length}/{MAX})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {employees.map((e) => {
                        const on = selected.includes(e.employee_id);
                        const disabled = !on && selected.length >= MAX;
                        return (
                            <button
                                key={e.employee_id}
                                onClick={() => toggle(e.employee_id)}
                                disabled={disabled}
                                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                                    on ? "border-[#0b1f3a] bg-[#0b1f3a] text-white" : disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50"
                                }`}
                            >
                                {on ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                                {e.name}
                            </button>
                        );
                    })}
                </div>
            </Card>

            {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>}

            {!loading && details.length === 0 && (
                <Card className="py-16 text-center text-muted-foreground">Pick employees above to start comparing</Card>
            )}

            {!loading && details.length > 0 && (
                <>
                    {/* What-if simulation control */}
                    <Card className="flex flex-wrap items-end gap-3 p-4">
                        <div className="text-sm font-medium text-slate-600">What-if salary:</div>
                        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={simBase} onChange={(e) => setSimBase(e.target.value ? Number(e.target.value) : "")}>
                            <option value="">Pick employee…</option>
                            {details.map((d) => <option key={d.employee_id} value={d.employee_id}>{d.name}</option>)}
                        </select>
                        <div><label className="mb-1 block text-[10px] text-muted-foreground">New Total Comp (€)</label>
                            <Input type="number" className="h-9 w-36" value={simTotal} onChange={(e) => setSimTotal(e.target.value)} placeholder="e.g. 120000" /></div>
                        <div><label className="mb-1 block text-[10px] text-muted-foreground">New Base (€, optional)</label>
                            <Input type="number" className="h-9 w-36" value={simBaseSalary} onChange={(e) => setSimBaseSalary(e.target.value)} /></div>
                        <Button size="sm" className="h-9 gap-1.5" onClick={addSimulation}><Plus className="h-3.5 w-3.5" /> Add scenario</Button>
                    </Card>

                    {/* Selected employees strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:[grid-template-columns:var(--cols)]" style={{ ["--cols" as string]: `repeat(${allDetails.length}, minmax(0,1fr))` }}>
                        {allDetails.map((d) => (
                            <Card key={d.employee_id} className={`relative flex flex-col items-center gap-2 p-3 text-center ${d.employee_id < 0 ? "border-amber-300 bg-amber-50/40" : ""}`}>
                                {d.employee_id < 0 && (
                                    <button onClick={() => removeSim(d.employee_id)} className="absolute right-1 top-1 text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                                )}
                                <EmployeeAvatar name={d.name} photo={d.photo} size={56} />
                                <div>
                                    <div className="text-sm font-semibold text-[#0b1f3a]">{d.name}</div>
                                    <div className="text-xs text-muted-foreground">{d.position_title}</div>
                                    <div className="text-[10px] text-slate-400">{d.banner_name} · {d.country}</div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Summary badges */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <BadgeCard icon={Trophy} label="Highest Total Comp" name={badges.highestComp?.name} value={formatCurrency(badges.highestComp?.total_compensation)} />
                        <BadgeCard icon={Clock} label="Longest Tenure" name={badges.longestTenure?.name} value={formatYears(badges.longestTenure?.hire_date)} />
                        <BadgeCard icon={CalendarPlus} label="Newest in Role" name={badges.newestRole?.name} value={formatYears(badges.newestRole?.position_effective_date)} />
                        <BadgeCard icon={Users} label="Largest Team" name={badges.largestTeam?.name} value={`${badges.largestTeam?.team_size ?? 0} reports`} />
                    </div>

                    {/* Compensation bar chart */}
                    <Card className="overflow-hidden">
                        <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                            <span>Compensation Comparison (high → low)</span>
                            <label className="flex items-center gap-2 text-xs font-normal">
                                <input type="checkbox" checked={compOnly} onChange={(e) => setCompOnly(e.target.checked)} />
                                Compensation only (excl. benefits)
                            </label>
                        </div>
                        <div className="p-4" style={{ height: 280 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}K`} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                        {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? "#0b1f3a" : "#3b6ea5"} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Item-by-item tables */}
                    <CompareTable title="Personal & Employment Information" details={allDetails} rows={[
                        ["Position", (d) => d.position_title || "-"],
                        ["Company", (d) => d.banner_name || "-"],
                        ["Country", (d) => d.country || "-"],
                        ["Date of Birth", (d) => formatDate(d.date_of_birth)],
                        ["Hire Date", (d) => formatDate(d.hire_date)],
                        ["Years of Service", (d) => formatYears(d.hire_date)],
                        ["Years in Position", (d) => formatYears(d.position_effective_date)],
                        ["Job Grade", (d) => d.job_grade || "-"],
                        ["Status", (d) => d.status],
                    ]} />

                    <CompareTable title="Compensation & Benefits" mono details={allDetails} rows={[
                        ["Total Compensation", (d) => formatCurrency(d.total_compensation)],
                        ["Base / Salary", (d) => formatCurrency(d.compensation?.base_salary)],
                        ["STI Target", (d) => formatCurrency(d.compensation?.sti_target)],
                        ["LTI Target", (d) => formatCurrency(d.compensation?.lti_target)],
                        ["STI Max", (d) => formatCurrency(d.compensation?.sti_max)],
                        ["LTI Max", (d) => formatCurrency(d.compensation?.lti_max)],
                        ["Other Bonus", (d) => formatCurrency(d.compensation?.other_bonus)],
                        ["Allowance · Car", (d) => formatCurrency(d.compensation?.allowance_company_car)],
                        ["Allowance · Mobile", (d) => formatCurrency(d.compensation?.allowance_mobility)],
                        ["Allowance · Housing", (d) => formatCurrency(d.compensation?.allowance_home_office)],
                        ["Benefit · Medical", (d) => formatCurrency(d.compensation?.allowance_private_medical)],
                        ["Other benefit (please specify)", (d) => d.compensation?.allowance_family_cover || "—"],
                    ]} />

                    {/* Performance 5y */}
                    <Card className="overflow-hidden">
                        <div className="border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">Performance Grade — Last 5 Years</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="border-b bg-slate-50">
                                    <th className="px-4 py-2 text-left font-medium text-slate-500">Employee</th>
                                    {[2021, 2022, 2023, 2024, 2025].map((fy) => <th key={fy} className="px-3 py-2 text-center font-medium text-slate-500">FY{fy}</th>)}
                                </tr></thead>
                                <tbody className="divide-y">
                                    {allDetails.map((d) => (
                                        <tr key={d.employee_id}>
                                            <td className="px-4 py-2 font-medium text-[#0b1f3a]">{d.name}</td>
                                            {[2021, 2022, 2023, 2024, 2025].map((fy) => {
                                                const g = d.performance.find((p) => p.fiscal_year === fy)?.grade;
                                                return <td key={fy} className="px-3 py-2 text-center">
                                                    {g ? <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${gradeColor(g)}`}>{g}</span> : "-"}
                                                </td>;
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </div>
        </div>
    );
}

function BadgeCard({ icon: Icon, label, name, value }: { icon: any; label: string; name?: string; value: string }) {
    return (
        <Card className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
                <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                <div className="truncate text-sm font-semibold text-[#0b1f3a]">{name || "-"}</div>
                <div className="text-xs text-slate-500">{value}</div>
            </div>
        </Card>
    );
}

function CompareTable({ title, details, rows, mono }: {
    title: string; details: EmployeeDetail[]; mono?: boolean;
    rows: [string, (d: EmployeeDetail) => string][];
}) {
    return (
        <Card className="overflow-hidden">
            <div className="border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">{title}</div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50">
                        <th className="px-4 py-2 text-left font-medium text-slate-500">Field</th>
                        {details.map((d) => <th key={d.employee_id} className="px-4 py-2 text-left font-medium text-[#0b1f3a]">{d.name}</th>)}
                    </tr></thead>
                    <tbody className="divide-y">
                        {rows.map(([label, fn]) => (
                            <tr key={label}>
                                <td className="px-4 py-2 text-slate-500">{label}</td>
                                {details.map((d) => <td key={d.employee_id} className={`px-4 py-2 text-slate-800 ${mono ? "font-mono" : ""}`}>{fn(d)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

function computeBadges(details: EmployeeDetail[]) {
    if (!details.length) return {} as any;
    const by = <T,>(fn: (d: EmployeeDetail) => number, dir: 1 | -1) =>
        [...details].sort((a, b) => (fn(b) - fn(a)) * dir)[0];
    return {
        highestComp: by((d) => d.total_compensation || 0, 1),
        longestTenure: by((d) => yearsBetween(d.hire_date) || 0, 1),
        newestRole: by((d) => yearsBetween(d.position_effective_date) ?? 999, -1),
        largestTeam: by((d) => d.team_size, 1),
    };
}
