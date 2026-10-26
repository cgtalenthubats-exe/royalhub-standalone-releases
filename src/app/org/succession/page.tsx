import Link from "next/link";
import { getSuccessionTree } from "@/app/actions/succession";
import { listBanners, listOffices } from "@/app/actions/org";
import { listEmployees } from "@/app/actions/employees";
import { listPositions } from "@/app/actions/positions";
import { SuccessionChartD3 } from "@/components/succession-chart-d3";
import { OrgFilterBar } from "@/components/org-filter-bar";

export const dynamic = "force-dynamic";

export default async function OrgSuccessionPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
    const { company } = await searchParams;
    const [allBanners] = await Promise.all([listBanners()]);
    const bannerId = company ? Number(company) : allBanners[0]?.banner_id;

    const [{ nodes }, employees, positions, offices] = await Promise.all([
        bannerId ? getSuccessionTree(bannerId) : Promise.resolve({ nodes: [], rootId: null }),
        listEmployees(),
        listPositions(),
        listOffices(),
    ]);

    const vacantCount = nodes.filter((n) => !n.employee_id).length;
    const totalCandidates = nodes.reduce((s, n) => s + n.candidates.length, 0);
    const readyNowCount = nodes.reduce((s, n) => s + n.candidates.filter((c) => c.readiness === "ready_now").length, 0);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Succession Plan</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Who's next for each position · click a seat to view or manage successors</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/org/banner">
                        <button className="flex items-center gap-2 bg-white border border-slate-200 rounded-[9px] px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                            ‹ Back to Org Chart
                        </button>
                    </Link>
                </div>
            </div>

            <OrgFilterBar companies={allBanners.map((b) => ({ id: b.banner_id, name: b.name }))} />

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-4 shrink-0 rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-[12px]">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#15803d]" /> Ready Now</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#a16207]" /> Ready 1–3 Years</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#b91c1c]" /> Ready 3–5 Years</span>
                <span className="flex items-center gap-1.5 text-gold">★ Internal candidate — click through to profile</span>
                <span className="ml-auto text-slate-400">Dashed border = vacant seat</span>
            </div>

            {/* Main: chart left + summary right */}
            <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:[grid-template-columns:1fr_280px] gap-4">
                <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] h-[380px] sm:h-[440px] lg:h-auto lg:min-h-0">
                    {bannerId ? (
                        <SuccessionChartD3
                            nodes={nodes}
                            bannerId={bannerId}
                            employees={employees.map((e) => ({ id: e.employee_id, name: e.name }))}
                            positions={positions.filter((p) => p.banner_id === bannerId).map((p) => ({ id: p.position_id, name: p.title }))}
                            offices={offices}
                        />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No company selected</div>
                    )}
                </div>

                <div className="flex flex-col gap-3 lg:min-h-0">
                    <div className="shrink-0 bg-[#0b1f3a] rounded-[14px] px-[18px] py-4 text-white">
                        <div className="text-[12px] text-slate-400 font-semibold">Positions in Plan</div>
                        <div className="text-[32px] font-extrabold mt-0.5 tabular-nums leading-none">
                            {nodes.length}{" "}
                            <span className="text-[14px] text-gold-light font-semibold">· {vacantCount} vacant</span>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)] p-4 space-y-3">
                        <div className="flex items-center justify-between text-[13px]">
                            <span className="text-slate-500">Total successors tracked</span>
                            <span className="font-bold text-[#0b1f3a] tabular-nums">{totalCandidates}</span>
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                            <span className="text-slate-500">Ready Now candidates</span>
                            <span className="font-bold text-emerald-600 tabular-nums">{readyNowCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                            <span className="text-slate-500">Vacant positions</span>
                            <span className="font-bold text-amber-600 tabular-nums">{vacantCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
