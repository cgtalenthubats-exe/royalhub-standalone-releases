import Link from "next/link";
import { getHeadcountFlat, listBanners, getOrgAsOf } from "@/app/actions/org";
import { listDepartments } from "@/app/actions/departments";
import { Badge } from "@/components/ui/badge";
import { OrgChartD3 } from "@/components/org-chart-d3";
import { OrgFilterBar } from "@/components/org-filter-bar";
import { OrgAsOfBadge } from "@/components/org-as-of-badge";
import { OrgDimensionSwitch } from "@/components/org-dimension-switch";

export const dynamic = "force-dynamic";

export default async function OrgHeadcountPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
    const { company } = await searchParams;
    const bannerId = company ? Number(company) : undefined;

    const [{ nodes, summary }, departments, allBanners, asOf] = await Promise.all([getHeadcountFlat(bannerId), listDepartments(), listBanners(), getOrgAsOf("headcount")]);
    const scoped = bannerId ? departments.filter((d) => d.banner_id === bannerId) : departments;
    const sorted = [...scoped].sort((a, b) => b.headcount - a.headcount);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Org Structure – Hierarchy &amp; FTE</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Reporting line with rolled-up FTE + country coverage per manager · drag a node to reassign</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <OrgAsOfBadge asOf={asOf} />
                    <Link href="/org/departments">
                        <button className="flex items-center gap-2 bg-[#0b1f3a] rounded-[9px] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#0b1f3a]/90 transition-colors">
                            Manage Departments
                        </button>
                    </Link>
                </div>
            </div>

            <div className="mb-3.5 shrink-0">
                <OrgDimensionSwitch active="headcount" />
            </div>

            <OrgFilterBar companies={allBanners.map((b) => ({ id: b.banner_id, name: b.name }))} />

            {/* Main: chart left + summary right */}
            <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:[grid-template-columns:1fr_320px] gap-4">
                {/* Org chart */}
                <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] h-[380px] sm:h-[440px] lg:h-auto lg:min-h-0">
                    <OrgChartD3 nodes={nodes} dimension="headcount" title="Org Structure – Hierarchy & FTE" />
                </div>

                {/* Right panel */}
                <div className="flex flex-col gap-3 lg:min-h-0">
                    {/* KPI */}
                    <div className="shrink-0 bg-[#0b1f3a] rounded-[14px] px-[18px] py-4 text-white">
                        <div className="text-[12px] text-slate-400 font-semibold">Total FTE</div>
                        <div className="text-[32px] font-extrabold mt-0.5 tabular-nums leading-none">
                            {summary.totalHeadcount}{" "}
                            <span className="text-[14px] text-gold-light font-semibold">· {summary.totalCountries} countries</span>
                        </div>
                        {summary.unassignedHeadcount > 0 && (
                            <div className="text-[11px] text-slate-400 mt-1">{summary.unassignedHeadcount} unassigned (vacant department owner)</div>
                        )}
                    </div>

                    {/* Department Summary */}
                    <div className="flex-1 lg:min-h-0 bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0">Department Summary</div>
                        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-slate-100">
                            {sorted.map((d) => (
                                <div key={d.department_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[12.5px] font-bold text-[#0f172a] truncate">{d.name}</span>
                                            {!d.owner_employee_id && <Badge className="text-[9.5px] px-1.5 py-0 bg-slate-100 text-slate-500 border-0">Vacant</Badge>}
                                        </div>
                                        <div className="text-[10.5px] text-slate-400 mt-0.5 truncate">
                                            {d.owner_employee_id ? (
                                                <Link href={`/employees/${d.owner_employee_id}`} className="text-[#0b1f3a] font-semibold hover:underline">
                                                    {d.owner_name || "—"}
                                                </Link>
                                            ) : "No owner assigned"} · {d.banner_name} · {d.country}
                                        </div>
                                    </div>
                                    <div className="text-[16px] font-extrabold text-[#0b1f3a] tabular-nums shrink-0">{d.headcount}</div>
                                </div>
                            ))}
                            {sorted.length === 0 && (
                                <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No departments yet — add one to get started</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
