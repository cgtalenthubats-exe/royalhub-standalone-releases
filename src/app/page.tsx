import { listEmployees } from "@/app/actions/employees";
import { getCompanySummary, getFunctionSummary } from "@/app/actions/org";
import { WorldMap, type MapPoint } from "@/components/world-map";
import { Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
    const [employees, companies, functions] = await Promise.all([
        listEmployees(),
        getCompanySummary(),
        getFunctionSummary(),
    ]);

    const allOffices = companies.flatMap((c) => c.offices.map((o) => ({ ...o, banner_name: c.name })));

    const active = employees.filter((e) => e.status === "Active").length;
    const resigned = employees.filter((e) => e.status === "Resigned").length;
    const countries = new Set(allOffices.map((o) => o.country)).size;
    const hqCount = allOffices.filter((o) => o.is_hq).length;
    const regionalCount = allOffices.filter((o) => o.is_regional_office).length;

    const compVals = employees.map((e) => e.total_compensation || 0).filter((v) => v > 0);
    const avgComp = compVals.length ? compVals.reduce((a, b) => a + b, 0) / compVals.length : 0;
    const avgCompLabel = avgComp > 0 ? "€" + (avgComp / 1000).toFixed(1) + "k" : "—";

    const funcNames = functions.map((f) => f.name).join(" · ");

    const byCountry = new Map<string, MapPoint>();
    for (const o of allOffices) {
        if (!o.country) continue;
        const prev = byCountry.get(o.country);
        byCountry.set(o.country, {
            country: o.country,
            count: (prev?.count || 0) + o.employee_count,
            banner: o.banner_name,
        });
    }
    const mapPoints = Array.from(byCountry.values());

    const maxFuncCount = Math.max(...functions.map((f) => f.employee_count ?? 0), 1);

    const readiness = { High: 0, Medium: 0, Low: 0 };
    for (const e of employees) {
        const r = e.readiness_potential as keyof typeof readiness | null;
        if (r && r in readiness) readiness[r]++;
    }

    const now = new Date();
    const lastSynced = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        + ", " + now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Executive Overview</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Global talent intelligence across all companies – FY2025</p>
                </div>
                <div className="text-[12px] text-slate-400">Last synced · {lastSynced}</div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-[18px] shrink-0">
                <KpiCard
                    icon={<IconUsers />}
                    iconBg="bg-[#eff6ff]"
                    label="Active Employees"
                    value={active}
                    sub={`${resigned} resigned this year`}
                />
                <KpiCard
                    icon={<IconDollar />}
                    iconBg="bg-[#f0fdf4]"
                    label="Avg Total Comp"
                    value={avgCompLabel}
                    sub="Across all job grades"
                />
                <KpiCard
                    icon={<IconBuilding />}
                    iconBg="bg-[#fffbeb]"
                    label="Companies"
                    value={companies.length}
                    sub={`${countries} countries · ${hqCount} HQ · ${regionalCount} regional`}
                />
                <KpiCard
                    icon={<IconGrid />}
                    iconBg="bg-[#faf5ff]"
                    label="Functions"
                    value={functions.length}
                    sub={funcNames}
                />
            </div>

            {/* Lower section */}
            <div className="flex-1 lg:min-h-0 grid grid-cols-1 lg:[grid-template-columns:1.55fr_1fr] gap-4">
                {/* Global Presence */}
                <div className="bg-white border border-slate-200 rounded-[14px] flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)] min-h-[320px] lg:min-h-0">
                    <div className="bg-[#0b1f3a] text-white px-[18px] py-[11px] text-[13.5px] font-semibold flex items-center gap-2 shrink-0">
                        <Globe className="h-3.5 w-3.5 text-gold-light" />
                        Global Presence
                    </div>
                    <div className="flex-1 min-h-0 p-4">
                        <WorldMap points={mapPoints} />
                    </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-4 lg:min-h-0">
                    {/* FTE by Function */}
                    <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-[14px] flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-[#0b1f3a] text-white px-[18px] py-[11px] text-[13.5px] font-semibold shrink-0">
                            FTE by Function
                        </div>
                        <div className="flex-1 min-h-0 px-[18px] py-[14px] flex flex-col justify-around">
                            {functions.map((f) => {
                                const pct = Math.round(((f.employee_count ?? 0) / maxFuncCount) * 100);
                                return (
                                    <div key={f.function_id} className="flex items-center gap-3">
                                        <div className="w-20 text-right text-[12px] font-semibold text-slate-500 truncate">{f.name}</div>
                                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-[#2563eb] rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="w-5 text-[13px] font-bold text-[#0b1f3a] tabular-nums">{f.employee_count ?? 0}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Readiness Pipeline */}
                    <div className="shrink-0 bg-white border border-slate-200 rounded-[14px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-[#0b1f3a] text-white px-[18px] py-[11px] text-[13.5px] font-semibold">
                            Readiness Pipeline
                        </div>
                        <div className="grid grid-cols-3 px-[18px] py-4 gap-3">
                            <div className="text-center">
                                <div className="text-[30px] font-extrabold text-[#16a34a] tabular-nums leading-none">{readiness.High}</div>
                                <div className="text-[11.5px] text-slate-500 font-semibold mt-1">High</div>
                            </div>
                            <div className="text-center border-x border-slate-200">
                                <div className="text-[30px] font-extrabold text-[#d97706] tabular-nums leading-none">{readiness.Medium}</div>
                                <div className="text-[11.5px] text-slate-500 font-semibold mt-1">Medium</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[30px] font-extrabold text-slate-500 tabular-nums leading-none">{readiness.Low}</div>
                                <div className="text-[11.5px] text-slate-500 font-semibold mt-1">Low</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KpiCard({ icon, iconBg, label, value, sub }: {
    icon: React.ReactNode; iconBg: string; label: string; value: string | number; sub: string;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-[14px] px-5 py-[18px] shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center gap-2.5 text-slate-500 text-[12.5px] font-semibold mb-2.5">
                <span className={`w-[30px] h-[30px] rounded-[9px] ${iconBg} flex items-center justify-center shrink-0`}>{icon}</span>
                {label}
            </div>
            <div className="text-[34px] font-extrabold text-[#0b1f3a] leading-none tabular-nums">{value}</div>
            <div className="text-[12px] text-slate-400 mt-1.5 truncate">{sub}</div>
        </div>
    );
}

function IconUsers() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
}
function IconDollar() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
}
function IconBuilding() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /></svg>;
}
function IconGrid() {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
