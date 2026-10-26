import Link from "next/link";
import { getOrgFlat, getCompanySummary, listBanners, listOffices, getOrgAsOf } from "@/app/actions/org";
import { listPositions, listFunctions } from "@/app/actions/positions";
import { Badge } from "@/components/ui/badge";
import { OrgChartD3 } from "@/components/org-chart-d3";
import { OrgFilterBar } from "@/components/org-filter-bar";
import { OrgAsOfBadge } from "@/components/org-as-of-badge";
import { OrgChartOcrButton } from "@/components/orgchart-ocr-button";
import { OrgDimensionSwitch } from "@/components/org-dimension-switch";

export const dynamic = "force-dynamic";

export default async function OrgBannerPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
    const { company } = await searchParams;
    const bannerId = company ? Number(company) : undefined;

    const [{ nodes }, companies, allBanners, asOf, offices, positions, functions] = await Promise.all([
        getOrgFlat("banner", { bannerId }),
        getCompanySummary(),
        listBanners(),
        getOrgAsOf("banner"),
        listOffices(),
        listPositions(),
        listFunctions(),
    ]);
    const visibleCompanies = bannerId ? companies.filter((c) => c.banner_id === bannerId) : companies;
    const totalEmployees = visibleCompanies.reduce((s, c) => s + c.employee_count, 0);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Org Structure – By Company</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Real reporting line across all companies · drag a node to reassign</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <OrgAsOfBadge asOf={asOf} />
                    <OrgChartOcrButton offices={offices} positions={positions} functions={functions} banners={allBanners} />
                </div>
            </div>

            <div className="mb-3.5 shrink-0">
                <OrgDimensionSwitch active="banner" />
            </div>

            <OrgFilterBar companies={allBanners.map((b) => ({ id: b.banner_id, name: b.name }))} />

            {/* Main: chart left + summary right */}
            <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:[grid-template-columns:1fr_320px] gap-4">
                {/* Org chart */}
                <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] h-[460px] lg:h-auto lg:min-h-0">
                    <OrgChartD3 nodes={nodes} dimension="banner" title="Org Structure – By Company" />
                </div>

                {/* Right panel */}
                <div className="flex flex-col gap-3 lg:min-h-0">
                    {/* KPI */}
                    <div className="shrink-0 bg-[#0b1f3a] rounded-[14px] px-[18px] py-4 text-white">
                        <div className="text-[12px] text-slate-400 font-semibold">Total FTE</div>
                        <div className="text-[32px] font-extrabold mt-0.5 tabular-nums leading-none">
                            {totalEmployees}{" "}
                            <span className="text-[14px] text-gold-light font-semibold">· {visibleCompanies.length} companies</span>
                        </div>
                    </div>

                    {/* Company Summary */}
                    <div className="flex-1 lg:min-h-0 bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0">Company Summary</div>
                        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-slate-100">
                            {visibleCompanies.map((c) => (
                                <div key={c.banner_id} className="px-4 py-2.5">
                                    <Link
                                        href={`/org/banner?company=${c.banner_id}`}
                                        className="flex items-center justify-between rounded-md -mx-1.5 px-1.5 py-1 hover:bg-slate-50 transition-colors"
                                    >
                                        <span className="text-[13px] font-bold text-[#0f172a]">{c.name}</span>
                                        <span className="text-[15px] font-extrabold text-[#0b1f3a] tabular-nums">{c.employee_count}</span>
                                    </Link>
                                    <div className="mt-1.5 flex flex-col gap-1">
                                        {c.offices.map((o) => (
                                            <Link
                                                key={o.office_id}
                                                href={`/org/banner?company=${c.banner_id}`}
                                                className="flex items-center justify-between rounded-md px-2 py-1 text-[11.5px] hover:bg-slate-50 transition-colors"
                                            >
                                                <span className="flex items-center gap-1.5 text-slate-600">
                                                    {o.country}
                                                    {o.is_hq && <Badge className="text-[9px] px-1.5 py-0 bg-gold/10 text-gold border-0">HQ</Badge>}
                                                    {o.is_regional_office && <Badge className="text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-800 border-0">Regional</Badge>}
                                                </span>
                                                <span className="font-semibold text-slate-500 tabular-nums">{o.employee_count}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
