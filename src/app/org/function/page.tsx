import Link from "next/link";
import { getOrgFlat, getFunctionSummary, listBanners, getOrgAsOf, getFunctionHeadInfo } from "@/app/actions/org";
import { OrgChartD3 } from "@/components/org-chart-d3";
import { OrgFilterBar } from "@/components/org-filter-bar";
import { OrgAsOfBadge } from "@/components/org-as-of-badge";
import { FunctionHeadPicker } from "@/components/function-head-picker";
import { OrgDimensionSwitch } from "@/components/org-dimension-switch";

export const dynamic = "force-dynamic";

export default async function OrgFunctionPage({ searchParams }: { searchParams: Promise<{ function?: string; company?: string }> }) {
    const { function: functionParam, company } = await searchParams;
    const selectedId = functionParam ? Number(functionParam) : null;
    const bannerId = company ? Number(company) : undefined;

    const [functions, allBanners, asOf] = await Promise.all([getFunctionSummary(), listBanners(), getOrgAsOf("function")]);
    const selected = selectedId ? functions.find((f) => f.function_id === selectedId) ?? null : null;
    const { nodes } = await getOrgFlat("function", { functionId: selectedId ?? undefined, bannerId }, selected?.name);
    // "Head of Function" only matters when viewing one function across every company —
    // filtered to a single banner, that company's own root is already the real top node.
    const headInfo = selected && !bannerId ? await getFunctionHeadInfo(selected.function_id) : null;

    const visibleBreakdown = selected ? (bannerId ? selected.breakdown.filter((b) => b.banner_id === bannerId) : selected.breakdown) : [];
    const visibleEmployeeCount = visibleBreakdown.reduce((s, b) => s + b.employees.length, 0);
    const visibleCompanyCount = new Set(visibleBreakdown.map((b) => b.banner_id)).size;
    const totalEmployees = functions.reduce((s, f) => s + f.employee_count, 0);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">
                        Org Structure – By Function{selected ? ` · ${selected.name}` : ""}
                    </h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">
                        {selected ? `${selected.name} · every company & country, side by side` : "Six functional pillars · each company runs its own hierarchy"}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <OrgAsOfBadge asOf={asOf} />
                </div>
            </div>

            <div className="mb-3.5 shrink-0">
                <OrgDimensionSwitch active="function" />
            </div>

            <OrgFilterBar
                companies={allBanners.map((b) => ({ id: b.banner_id, name: b.name }))}
                functions={functions.map((f) => ({ id: f.function_id, name: f.name }))}
            />

            {/* Main: chart left + summary right */}
            <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:[grid-template-columns:1fr_320px] gap-4">
                {/* Org chart */}
                <div className="flex flex-col lg:min-h-0">
                {headInfo && (
                    <FunctionHeadPicker
                        functionId={selected!.function_id}
                        functionName={selected!.name}
                        headEmployeeId={headInfo.headEmployeeId}
                        candidates={headInfo.candidates}
                    />
                )}
                <div className="flex-1 bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] h-[460px] lg:h-auto lg:min-h-0">
                    {selected ? (
                        <OrgChartD3 nodes={nodes} dimension="function" title={`Org Structure – By Function · ${selected.name}`} />
                    ) : (
                        // Unfiltered view spans every function × every company at once (up to 18
                        // disconnected reporting lines) — rendering that as one tree reads as
                        // noise with no clear "who reports to whom". Pick a function first instead.
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-6">
                            <div className="text-[13.5px] font-semibold text-slate-500">Select a function to see its reporting chart</div>
                            <p className="max-w-xs text-[12px] text-slate-400">Each company runs its own function hierarchy — pick one from the list on the right to avoid mixing them into one confusing chart.</p>
                        </div>
                    )}
                </div>
                </div>

                {/* Right panel */}
                <div className="flex flex-col gap-3 lg:min-h-0">
                    {/* KPI */}
                    <div className="shrink-0 bg-[#0b1f3a] rounded-[14px] px-[18px] py-4 text-white">
                        <div className="text-[12px] text-slate-400 font-semibold">{selected ? `${selected.name} FTE` : "Total FTE"}</div>
                        <div className="text-[32px] font-extrabold mt-0.5 tabular-nums leading-none">
                            {selected ? visibleEmployeeCount : totalEmployees}{" "}
                            <span className="text-[14px] text-gold-light font-semibold">
                                · {selected ? `${visibleCompanyCount} companies` : `${functions.length} functions`}
                            </span>
                        </div>
                    </div>

                    {/* Function Summary / drill-down */}
                    <div className="flex-1 lg:min-h-0 bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0 flex items-center justify-between">
                            <span>{selected ? `${selected.name} — by Company & Country` : "Select a Function"}</span>
                            {selected && (
                                <Link href={bannerId ? `/org/function?company=${bannerId}` : "/org/function"} className="text-[10.5px] font-medium text-slate-300 hover:text-white transition-colors">
                                    Show all ›
                                </Link>
                            )}
                        </div>
                        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto divide-y divide-slate-100">
                            {!selected && functions.map((f) => (
                                <Link
                                    key={f.function_id}
                                    href={`/org/function?function=${f.function_id}${bannerId ? `&company=${bannerId}` : ""}`}
                                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12.5px] font-bold text-[#0f172a]">{f.name}</div>
                                        <div className="text-[10.5px] text-slate-400 mt-0.5">{f.company_count} companies</div>
                                    </div>
                                    <div className="text-[16px] font-extrabold text-[#0b1f3a] tabular-nums shrink-0">{f.employee_count}</div>
                                </Link>
                            ))}
                            {selected && visibleBreakdown.map((b) => (
                                <Link
                                    key={`${b.banner_id}:${b.office_id}`}
                                    href={`/employees?function=${encodeURIComponent(selected.name)}&company=${encodeURIComponent(b.banner_name)}&country=${encodeURIComponent(b.country)}`}
                                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12.5px] font-bold text-[#0f172a] truncate">{b.banner_name}</div>
                                        <div className="text-[10.5px] text-slate-400 mt-0.5 truncate">
                                            {b.country} · {b.employees.map((e) => e.name).join(", ")}
                                        </div>
                                    </div>
                                    <div className="text-[16px] font-extrabold text-[#0b1f3a] tabular-nums shrink-0">{b.employees.length}</div>
                                </Link>
                            ))}
                            {selected && visibleBreakdown.length === 0 && (
                                <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No one in this function yet</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
