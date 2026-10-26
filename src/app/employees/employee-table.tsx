"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeListItem } from "@/app/actions/employees";
import { formatCurrency, gradeColor } from "@/lib/format";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { Money } from "@/components/comp-visibility";
import { Search, ChevronDown, Users, UserCheck, UserX, Euro } from "lucide-react";
import { cn } from "@/lib/utils";

function gradeChip(grade: string | null) {
    const m: Record<string, string> = {
        Exec: "bg-[#0b1f3a] text-white",
        Manager: "bg-indigo-100 text-indigo-700",
        IC: "bg-slate-100 text-slate-600",
    };
    return m[grade ?? ""] ?? "bg-slate-100 text-slate-500";
}

export function EmployeeTable({ employees, initialQuery, initialCompany, initialCountry, initialFunction }: {
    employees: EmployeeListItem[]; initialQuery?: string; initialCompany?: string; initialCountry?: string; initialFunction?: string;
}) {
    const router = useRouter();
    const [q, setQ] = useState(initialQuery || "");
    const [banner, setBanner] = useState(initialCompany || "");
    const [country, setCountry] = useState(initialCountry || "");
    const [func, setFunc] = useState(initialFunction || "");
    const [status, setStatus] = useState("");

    const banners = useMemo(() => [...new Set(employees.map((e) => e.banner_name).filter(Boolean))].sort() as string[], [employees]);
    const countries = useMemo(() => [...new Set(employees.map((e) => e.country).filter(Boolean))].sort() as string[], [employees]);
    const funcs = useMemo(() => [...new Set(employees.map((e) => e.function_name).filter(Boolean))].sort() as string[], [employees]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return employees.filter((e) => {
            if (s && !([e.name, e.position_title, e.banner_name, e.function_name, e.country].some((v) => (v || "").toLowerCase().includes(s)))) return false;
            if (banner && e.banner_name !== banner) return false;
            if (country && e.country !== country) return false;
            if (func && e.function_name !== func) return false;
            if (status && e.status !== status) return false;
            return true;
        });
    }, [q, banner, country, func, status, employees]);

    const hasFilter = !!(q.trim() || banner || country || func || status);
    const kpi = useMemo(() => {
        const activeCount = filtered.filter((e) => e.status === "Active").length;
        const resignedCount = filtered.filter((e) => e.status === "Resigned").length;
        const compVals = filtered.map((e) => e.total_compensation || 0).filter((v) => v > 0);
        const avgComp = compVals.length ? compVals.reduce((a, b) => a + b, 0) / compVals.length : 0;
        return { shown: filtered.length, activeCount, resignedCount, avgComp };
    }, [filtered]);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* KPI strip — reflects the currently applied filters, not the full roster */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3.5 shrink-0">
                <StatCard icon={Users} iconBg="bg-[#eff6ff]" iconColor="#2563eb" label={hasFilter ? "Showing" : "Total"} value={kpi.shown} sub={hasFilter ? `of ${employees.length} total` : "employees"} />
                <StatCard icon={UserCheck} iconBg="bg-[#f0fdf4]" iconColor="#16a34a" label="Active" value={kpi.activeCount} sub={kpi.shown ? `${Math.round((kpi.activeCount / kpi.shown) * 100)}% of shown` : "—"} />
                <StatCard icon={UserX} iconBg="bg-[#f8fafc]" iconColor="#64748b" label="Resigned" value={kpi.resignedCount} sub={hasFilter ? "in current filter" : "this year"} />
                <StatCard icon={Euro} iconBg="bg-[#fffbeb]" iconColor="#d97706" label="Avg Total Comp" value={kpi.avgComp > 0 ? formatCurrency(kpi.avgComp) : "—"} sub={hasFilter ? "filtered average" : "across all"} />
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap gap-2.5 mb-3.5 shrink-0">
                <div className="flex flex-1 min-w-[200px] items-center gap-2 bg-white border border-slate-200 rounded-[9px] px-3 py-[9px] text-[13px] text-slate-400">
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search by name, position, country…"
                        className="flex-1 bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                    />
                </div>
                <FilterSelect value={banner} onChange={setBanner} placeholder="All Companies" options={banners} />
                <FilterSelect value={country} onChange={setCountry} placeholder="All Countries" options={countries} />
                <FilterSelect value={func} onChange={setFunc} placeholder="All Functions" options={funcs} />
                <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={["Active", "Resigned"]} />
            </div>

            {/* Table card */}
            <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-[14px] flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                <div className="flex-1 min-h-0 overflow-auto">
                    <div className="min-w-[820px]">
                        {/* Header */}
                        <div
                            className="grid sticky top-0 z-10 items-center px-[18px] h-[42px] bg-[#0b1f3a] text-white text-[11.5px] font-semibold uppercase tracking-[.04em]"
                            style={{ gridTemplateColumns: "2.3fr 1.4fr 1fr .9fr 1fr .8fr .9fr" }}
                        >
                            <div>Employee</div>
                            <div>Position</div>
                            <div>Country</div>
                            <div>Grade</div>
                            <div>Total Comp</div>
                            <div>FY25</div>
                            <div>Team / Status</div>
                        </div>

                        {/* Body */}
                        <div className="divide-y divide-slate-100">
                            {filtered.map((e) => {
                                const active = e.status === "Active";
                                return (
                                    <div
                                        key={e.employee_id}
                                        onClick={() => router.push(`/employees/${e.employee_id}`)}
                                        className={cn(
                                            "grid items-center px-[18px] h-[46px] cursor-pointer text-[12.5px] hover:bg-slate-50 transition-colors",
                                            !active && "opacity-55"
                                        )}
                                        style={{ gridTemplateColumns: "2.3fr 1.4fr 1fr .9fr 1fr .8fr .9fr" }}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <EmployeeAvatar name={e.name} photo={e.photo} size={30} />
                                            <span className="font-bold text-[#0f172a] truncate">{e.name}</span>
                                        </div>
                                        <div className="text-slate-600 truncate pr-2">{e.position_title || "—"}</div>
                                        <div className="text-slate-500">{e.country || "—"}</div>
                                        <div>
                                            {e.job_grade && (
                                                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded ${gradeChip(e.job_grade)}`}>
                                                    {e.job_grade}
                                                </span>
                                            )}
                                        </div>
                                        <div className="font-bold text-[#0f172a] tabular-nums"><Money value={e.total_compensation} /></div>
                                        <div>
                                            {e.latest_grade ? (
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${gradeColor(e.latest_grade)}`}>
                                                    {e.latest_grade}
                                                </span>
                                            ) : "—"}
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <span className="font-semibold text-slate-500 tabular-nums">{e.team_size ?? "—"}</span>
                                            <span className={`text-[11px] font-semibold ${active ? "text-[#15803d]" : "text-slate-400"}`}>
                                                {e.status}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            {filtered.length === 0 && (
                                <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No employees match your search</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }: {
    icon: any; iconBg: string; iconColor: string; label: string; value: string | number; sub: string;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-[14px] px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center gap-2 text-slate-500 text-[11.5px] font-semibold mb-1.5">
                <span className={`w-6 h-6 rounded-[7px] ${iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className="h-3.5 w-3.5" style={{ color: iconColor }} />
                </span>
                {label}
            </div>
            <div className="text-[24px] font-extrabold text-[#0b1f3a] leading-none tabular-nums">{value}</div>
            <div className="text-[10.5px] text-slate-400 mt-1 truncate">{sub}</div>
        </div>
    );
}

function FilterSelect({ value, onChange, placeholder, options }: {
    value: string; onChange: (v: string) => void; placeholder: string; options: string[];
}) {
    return (
        <div className="relative flex items-center">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="appearance-none h-full bg-white border border-slate-200 rounded-[9px] pl-3 pr-8 text-[13px] font-semibold text-slate-700 cursor-pointer outline-none"
            >
                <option value="">{placeholder}</option>
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" />
        </div>
    );
}
