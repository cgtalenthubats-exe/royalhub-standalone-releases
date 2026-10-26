"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { OrgFlatNode } from "@/app/actions/org";
import {
    type PerfCycle, type BannerGoal, type EmployeeTarget, type PerfOverview, type DepartedHolder,
    listTargetsForPosition, createEmployeeTarget, updateEmployeeTarget, deleteEmployeeTarget,
    createBannerGoal, updateBannerGoal, deleteBannerGoal, createCycle,
} from "@/app/actions/performance";
import { exportPerformanceBannerPptx, exportPerformanceEmployeePptx } from "@/lib/pptx-export";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { progressPct, rollup, weightSum, perfStatus, formatMeasure, goalProgress, goalProgressIsDerived, PERF_STATUS, type PerfStatus } from "@/lib/performance";
import { OrgChartD3 } from "@/components/org-chart-d3";
import { OrgFilterBar } from "@/components/org-filter-bar";
import { PerfBulletRow } from "@/components/perf-bullet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, ChevronDown, X, MousePointerClick, LayoutGrid, FileDown } from "lucide-react";
import { toast } from "sonner";

type Tab = "overview" | "goals";

interface Props {
    nodes: OrgFlatNode[];
    overview: PerfOverview;
    goals: BannerGoal[];
    departed: DepartedHolder[];
    cycles: PerfCycle[];
    cycleId: number;
    banners: { id: number; name: string }[];
    bannerId?: number;
    tab: Tab;
}

// A measurable draft shared by the goal editor and the target editor — the two
// carry the same measurement fields, so one form shape covers both.
interface Draft {
    title: string;
    description: string;
    metric_unit: string;
    target_value: string;
    actual_value: string;
    progress_pct: string;
    weight: string;
    banner_goal_id: string;
}
const emptyDraft = (): Draft => ({ title: "", description: "", metric_unit: "", target_value: "", actual_value: "", progress_pct: "", weight: "", banner_goal_id: "" });

// One table row, whichever level it came from — a company objective or a
// person's target. Normalising them here is what lets the panel below the
// chart use a single table for both.
interface PanelRow {
    id: number;
    title: string;
    description: string | null;
    metric_unit: string | null;
    target_value: number | null;
    actual_value: number | null;
    progress_pct: number | null;
    weight: number | null;
    banner_goal_id: number | null;  // targets only — which objective this serves
    pct: number | null;
    derived: boolean;               // objectives only — figure came from aligned targets
    alignedCount: number | null;    // objectives only
}
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function PerformanceClient({ nodes, overview, goals, departed, cycles, cycleId, banners, bannerId, tab }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const setParam = useCallback((key: string, value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value); else params.delete(key);
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }, [router, pathname, searchParams]);

    // ── Bottom drawer state ───────────────────────────────────────────────
    const [seat, setSeat] = useState<OrgFlatNode | null>(null);
    const [targets, setTargets] = useState<EmployeeTarget[]>([]);
    const [loadingTargets, setLoadingTargets] = useState(false);

    const loadTargets = useCallback(async (positionId: string) => {
        setLoadingTargets(true);
        try { setTargets(await listTargetsForPosition(cycleId, Number(positionId))); }
        finally { setLoadingTargets(false); }
    }, [cycleId]);

    // Clicking a node fills the panel below the chart. A company node lands
    // here too — that's how its objectives are opened — and its rows come from
    // `goals`, so there's nothing to fetch for it.
    const onNodeClick = useCallback((node: OrgFlatNode) => {
        if (node.employee_id < 0 && node.node_kind !== "banner") return; // synthetic anchor
        setSeat(node);
        if (node.node_kind === "banner") { setTargets([]); return; }
        loadTargets(node.id);
    }, [loadTargets]);

    const [exporting, setExporting] = useState(false);
    const seatRollup = rollup(targets);
    const seatWeights = weightSum(targets);

    // Logo + name for the header strip above the chart. Taken off the nodes
    // rather than a separate lookup — every node in a company-filtered tree
    // already carries its banner's name and logo.
    const activeBanner = bannerId
        ? (() => {
            const n = nodes.find((x) => x.banner_id === bannerId && x.employee_id > 0);
            return { name: n?.banner_name ?? banners.find((b) => b.id === bannerId)?.name ?? null, logo: n?.banner_logo_url ?? null };
        })()
        : null;

    return (
        // Not viewport-locked the way /org/banner is: the Overview tab stacks a
        // chart and two detail panels, so the page is meant to scroll.
        <div className="flex min-h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Performance Management</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Company goals and the targets behind them · click a card to record achievement</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex items-center">
                        <select
                            value={String(cycleId)}
                            onChange={(e) => setParam("cycle", e.target.value)}
                            className="appearance-none h-9 bg-white border border-slate-200 rounded-[9px] pl-3 pr-8 text-[13px] font-semibold text-slate-700 cursor-pointer outline-none"
                        >
                            {cycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>{c.name}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <NewCycleButton cycles={cycles} currentCycleId={cycleId} />
                    <Button
                        variant="outline"
                        className="h-9 gap-1.5 text-[13px]"
                        disabled={exporting}
                        onClick={async () => {
                            setExporting(true);
                            try {
                                await exportPerformanceBannerPptx({
                                    cycleName: cycles.find((c) => c.cycle_id === cycleId)?.name ?? "",
                                    bannerName: activeBanner?.name ?? "All Companies",
                                    goals: goals.map((g) => ({
                                        goal_id: g.goal_id, title: g.title, banner_name: g.banner_name,
                                        metric_unit: g.metric_unit, target_value: g.target_value, actual_value: g.actual_value,
                                        weight: g.weight, aligned_count: g.aligned_count,
                                        pct: goalProgress(g), derived: goalProgressIsDerived(g),
                                    })),
                                    // Real seats only — the company node and the
                                    // invisible anchor aren't people to report on.
                                    people: nodes
                                        .filter((n) => n.employee_id > 0)
                                        .map((n) => {
                                            const s = overview.byPosition[n.id];
                                            return {
                                                id: n.id, name: n.name, position_title: n.position_title, banner_name: n.banner_name,
                                                targetCount: s?.targetCount ?? 0,
                                                pct: s?.pct ?? null,
                                                statusLabel: PERF_STATUS[s?.status ?? "none"].label,
                                            };
                                        })
                                        .sort((a, b) => a.name.localeCompare(b.name)),
                                    seatsWithTargets: overview.seatsWithTargets,
                                    totalSeats: overview.totalSeats,
                                });
                                toast.success("Exported PPTX 🎉");
                            } catch (e: any) {
                                toast.error(e?.message || "Export failed");
                            } finally { setExporting(false); }
                        }}
                    >
                        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Export PPTX
                    </Button>
                </div>
            </div>

            {/* In-page tabs — state lives in the URL so refresh and links keep it */}
            <div className="flex items-center gap-1 mb-3 shrink-0 border-b border-slate-200">
                {([["overview", "Overview"], ["goals", "Company Goals"]] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setParam("tab", key === "overview" ? "" : key)}
                        className={`px-3.5 py-2 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors ${
                            tab === key ? "border-[#0b1f3a] text-[#0b1f3a]" : "border-transparent text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <OrgFilterBar companies={banners} />

            {tab === "overview" ? (
                <OverviewTab
                    nodes={nodes}
                    overview={overview}
                    goals={goals}
                    departed={departed}
                    banner={activeBanner}
                    seat={seat}
                    targets={targets}
                    loadingTargets={loadingTargets}
                    cycleId={cycleId}
                    cycleName={cycles.find((c) => c.cycle_id === cycleId)?.name ?? ""}
                    seatRollup={seatRollup}
                    seatWeights={seatWeights}
                    onNodeClick={onNodeClick}
                    onGoalClick={() => setParam("tab", "goals")}
                    onTargetsChanged={() => { if (seat) loadTargets(seat.id); router.refresh(); }}
                    onClearSeat={() => setSeat(null)}
                />
            ) : (
                <GoalsTab goals={goals} cycleId={cycleId} bannerId={bannerId} banners={banners} />
            )}
        </div>
    );
}

// ── New cycle ─────────────────────────────────────────────────────────────
// Starting a year from scratch means re-typing every objective and everyone's
// targets, so copying last year forward is the default here — the plan carries
// over, the achievement figures don't.

function NewCycleButton({ cycles, currentCycleId }: { cycles: PerfCycle[]; currentCycleId: number }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const nextYear = Math.max(...cycles.map((c) => c.fiscal_year), new Date().getFullYear()) + 1;
    const [year, setYear] = useState(String(nextYear));
    const [copyFrom, setCopyFrom] = useState(String(currentCycleId));

    async function save() {
        const fy = Number(year);
        if (!fy || fy < 2000 || fy > 2100) { toast.error("Enter a fiscal year like 2027"); return; }
        if (cycles.some((c) => c.fiscal_year === fy)) { toast.error(`FY${fy} already exists`); return; }
        setSaving(true);
        const res = await createCycle(
            { name: `FY${fy}`, fiscal_year: fy, start_date: `${fy}-01-01`, end_date: `${fy}-12-31` },
            copyFrom ? Number(copyFrom) : null,
        );
        setSaving(false);
        if (!res.ok) { toast.error(res.error || "Couldn't create the cycle"); return; }
        if (res.error) toast.warning(res.error);            // created, but the copy didn't finish
        else if (copyFrom) toast.success(`FY${fy} created · copied ${res.copiedGoals} objective${res.copiedGoals === 1 ? "" : "s"} and ${res.copiedTargets} target${res.copiedTargets === 1 ? "" : "s"}`);
        else toast.success(`FY${fy} created`);
        setOpen(false);
        router.push(`/performance?cycle=${res.id}`);
    }

    return (
        <>
            <Button variant="outline" className="h-9 gap-1.5 text-[13px]" onClick={() => { setYear(String(nextYear)); setCopyFrom(String(currentCycleId)); setOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> New cycle
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Start a new review cycle</DialogTitle></DialogHeader>
                    <div className="space-y-3.5">
                        <div>
                            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Fiscal year</label>
                            <Input type="number" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2027" className="h-9" autoFocus />
                        </div>
                        <div>
                            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Start from</label>
                            <select
                                value={copyFrom}
                                onChange={(e) => setCopyFrom(e.target.value)}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] outline-none"
                            >
                                <option value="">Empty — set everything up fresh</option>
                                {cycles.map((c) => <option key={c.cycle_id} value={c.cycle_id}>Copy {c.name}&apos;s objectives &amp; targets</option>)}
                            </select>
                            <p className="mt-1.5 text-[11.5px] text-slate-500 leading-relaxed">
                                Copying brings across every objective and target — including who they belong to and which
                                objective each one serves — but leaves achievement blank, ready for the new year.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">
                            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ── Overview tab ──────────────────────────────────────────────────────────
// Layout follows the client's sketch: a banner-titled chart on top, and the
// detail/input panel sitting INLINE underneath it rather than as a modal
// drawer — so the chart and the row you're editing stay on screen together,
// and the panel is visible (as an empty state) before anything is selected.

function OverviewTab({
    nodes, overview, goals, departed, banner, seat, targets, loadingTargets, cycleId, cycleName,
    seatRollup, seatWeights, onNodeClick, onGoalClick, onTargetsChanged, onClearSeat,
}: {
    nodes: OrgFlatNode[];
    overview: PerfOverview;
    goals: BannerGoal[];
    departed: DepartedHolder[];
    banner: { name: string | null; logo: string | null } | null;
    seat: OrgFlatNode | null;
    targets: EmployeeTarget[];
    loadingTargets: boolean;
    cycleId: number;
    cycleName: string;
    seatRollup: number | null;
    seatWeights: number;
    onNodeClick: (n: OrgFlatNode) => void;
    onGoalClick: () => void;
    onTargetsChanged: () => void;
    onClearSeat: () => void;
}) {
    const pctSet = overview.totalSeats ? Math.round((overview.seatsWithTargets / overview.totalSeats) * 100) : 0;

    return (
        <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_320px] gap-4 pb-2">
            {/* ── Left column: chart, then the detail panels underneath ── */}
            <div className="flex flex-col gap-4 min-w-0">
                {/* Chart, titled with whichever company is in view */}
                <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                    <div className="shrink-0 flex items-center gap-2.5 border-b border-slate-200 px-4 py-2.5">
                        {banner?.logo
                            ? <img src={banner.logo} alt="" className="h-6 max-w-[110px] object-contain object-left" />
                            : <span className="text-[13px] font-extrabold text-[#0b1f3a]">{banner?.name ?? "All Companies"}</span>}
                        {banner?.logo && <span className="text-[13px] font-bold text-[#0b1f3a]">{banner.name}</span>}
                    </div>
                    <div className="h-[440px]">
                        <OrgChartD3
                            nodes={nodes}
                            dimension="banner"
                            title="Performance"
                            perf={overview.byPosition}
                            readOnly
                            onNodeClick={onNodeClick}
                        />
                    </div>
                </div>

                {/* Detail + input, and the scoring matrix placeholder beside it */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <TargetPanel
                        seat={seat}
                        banner={banner}
                        targets={targets}
                        loading={loadingTargets}
                        goals={goals}
                        cycleId={cycleId}
                        cycleName={cycleName}
                        rollupPct={seatRollup}
                        weightTotal={seatWeights}
                        onChanged={onTargetsChanged}
                        onClear={onClearSeat}
                    />

                    <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] min-h-[300px]">
                        <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0">
                            Matrix &amp; scoring
                        </div>
                        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
                            <LayoutGrid className="h-7 w-7 text-slate-300" />
                            <p className="text-[13px] font-semibold text-slate-500">Work in progress</p>
                            <p className="max-w-xs text-[12px] text-slate-400 leading-relaxed">
                                Performance vs potential scoring will live here, once the rating model is agreed.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Right column ── */}
            <div className="flex flex-col gap-3">
                {/* Completion KPI */}
                <div className="shrink-0 bg-[#0b1f3a] rounded-[14px] px-[18px] py-4 text-white">
                    <div className="text-[12px] text-slate-400 font-semibold">Targets set</div>
                    <div className="text-[32px] font-extrabold mt-0.5 tabular-nums leading-none">
                        {overview.seatsWithTargets}
                        <span className="text-[18px] text-slate-400"> / {overview.totalSeats}</span>{" "}
                        <span className="text-[14px] text-gold-light font-semibold">· {pctSet}%</span>
                    </div>
                    <div className="mt-2.5 h-1.5 rounded-full bg-white/15 overflow-hidden">
                        <div className="h-full rounded-full bg-gold-light" style={{ width: `${pctSet}%` }} />
                    </div>
                </div>

                {/* Status legend — the colour never stands alone */}
                <div className="shrink-0 bg-white border border-slate-200 rounded-[14px] px-3.5 py-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                    {(Object.keys(PERF_STATUS) as PerfStatus[]).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-600">
                            <span className="h-2 w-2 rounded-full" style={{ background: PERF_STATUS[k].hex }} />
                            {PERF_STATUS[k].label}
                        </span>
                    ))}
                </div>

                {/* People who did work for this company this cycle but have
                    since transferred out. They have no node left in this tree,
                    so this card is the only place their contribution can
                    surface at all — without it they'd vanish from the year.
                    (Resigned people keep their seat and are flagged on the node
                    instead, so they're deliberately not listed here.) */}
                {departed.length > 0 && (
                    <div className="bg-white border border-amber-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-[12.5px] font-semibold text-amber-900 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" /> No longer in this company
                        </div>
                        <div className="divide-y divide-slate-100">
                            {departed.map((p) => (
                                <Link
                                    key={p.employee_position_id}
                                    href={`/employees/${p.employee_id}`}
                                    className="block px-4 py-2.5 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-[12.5px] font-bold text-[#0f172a] truncate">{p.name}</span>
                                        <span className="shrink-0 text-[11.5px] font-extrabold tabular-nums text-slate-500">
                                            {p.pct == null ? "—" : `${Math.round(p.pct)}%`}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">{p.position_title}</div>
                                    <div className="mt-0.5 text-[10.5px] text-amber-700">
                                        {p.movedToBannerName ? `Moved to ${p.movedToBannerName}` : "Seat removed"}
                                        {" · "}{p.targetCount} target{p.targetCount === 1 ? "" : "s"} recorded here
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Company goals — read-only summary; editing lives on the Goals tab */}
                <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                    <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0 flex items-center justify-between">
                        Company Goals
                        <button onClick={onGoalClick} className="text-[11px] font-semibold text-gold-light hover:underline">Manage ›</button>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                        {goals.length === 0 ? (
                            <div className="px-4 py-6 text-center">
                                <p className="text-[12.5px] text-slate-500">No goals for this cycle yet.</p>
                                <button onClick={onGoalClick} className="mt-2 text-[12px] font-semibold text-[#0b1f3a] hover:underline">Add the first one ›</button>
                            </div>
                        ) : goals.map((g) => (
                            <button key={g.goal_id} onClick={onGoalClick} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[12.5px] font-bold text-[#0f172a] truncate">{g.title}</span>
                                    {g.banner_name && <span className="shrink-0 text-[10px] text-slate-400">{g.banner_name}</span>}
                                </div>
                                <PerfBulletRow className="mt-1.5" pct={goalProgress(g)} targetCount={1} measure={formatMeasure(g)} />
                                <div className="mt-1 text-[10.5px] text-slate-400">
                                    {g.aligned_count} target{g.aligned_count === 1 ? "" : "s"} aligned
                                    {goalProgressIsDerived(g) && " · rolled up from them"}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Company Goals tab ─────────────────────────────────────────────────────

function GoalsTab({ goals, cycleId, bannerId, banners }: {
    goals: BannerGoal[]; cycleId: number; bannerId?: number; banners: { id: number; name: string }[];
}) {
    const router = useRouter();
    const [editing, setEditing] = useState<number | "new" | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft());
    const [saving, setSaving] = useState(false);

    const totalWeight = weightSum(goals);

    function startNew() {
        if (!bannerId) { toast.error("Pick a company first — goals belong to one company."); return; }
        setDraft(emptyDraft());
        setEditing("new");
    }
    function startEdit(g: BannerGoal) {
        setDraft({
            title: g.title, description: g.description ?? "", metric_unit: g.metric_unit ?? "",
            target_value: g.target_value?.toString() ?? "", actual_value: g.actual_value?.toString() ?? "",
            progress_pct: g.progress_pct?.toString() ?? "", weight: g.weight?.toString() ?? "", banner_goal_id: "",
        });
        setEditing(g.goal_id);
    }

    async function save() {
        setSaving(true);
        const input = {
            title: draft.title, description: draft.description, metric_unit: draft.metric_unit,
            target_value: num(draft.target_value), actual_value: num(draft.actual_value),
            progress_pct: num(draft.progress_pct), weight: num(draft.weight),
        };
        const res = editing === "new"
            ? await createBannerGoal(cycleId, bannerId!, input)
            : await updateBannerGoal(editing as number, input);
        setSaving(false);
        if (!res.ok) { toast.error(res.error || "Couldn't save"); return; }
        toast.success(editing === "new" ? "Goal added" : "Goal updated");
        setEditing(null);
        router.refresh();
    }

    async function remove(g: BannerGoal) {
        const res = await deleteBannerGoal(g.goal_id);
        if (!res.ok) { toast.error(res.error || "Couldn't delete"); return; }
        toast.success("Goal deleted");
        router.refresh();
    }

    return (
        <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0 flex items-center justify-between">
                <span>
                    Company Goals
                    {!bannerId && <span className="ml-2 font-normal text-slate-300">· all companies</span>}
                </span>
                <div className="flex items-center gap-2">
                    {goals.length > 0 && totalWeight > 0 && Math.round(totalWeight) !== 100 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10.5px] font-bold text-amber-200">
                            <AlertTriangle className="h-3 w-3" /> Weights total {Math.round(totalWeight)}%
                        </span>
                    )}
                    <Button size="sm" className="h-7 gap-1 text-[12px]" onClick={startNew}><Plus className="h-3.5 w-3.5" /> Add goal</Button>
                </div>
            </div>

            <div className="divide-y divide-slate-100">
                {editing === "new" && (
                    <MeasurableForm draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
                )}

                {goals.length === 0 && editing !== "new" && (
                    <div className="px-4 py-10 text-center">
                        <p className="text-[13px] font-semibold text-slate-600">No goals for this cycle yet</p>
                        <p className="mt-1 text-[12.5px] text-slate-500">
                            {bannerId ? "Add what this company is aiming for this year." : "Pick a company above, then add its goals."}
                        </p>
                    </div>
                )}

                {goals.map((g) => editing === g.goal_id ? (
                    <MeasurableForm key={g.goal_id} draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} />
                ) : (
                    <div key={g.goal_id} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[13.5px] font-bold text-[#0f172a] truncate">{g.title}</span>
                                    {g.banner_name && <span className="shrink-0 text-[10.5px] text-slate-400">{g.banner_name}</span>}
                                    {g.weight != null && <span className="shrink-0 text-[10.5px] font-semibold text-slate-500">w. {g.weight}%</span>}
                                </div>
                                <PerfBulletRow className="mt-2 max-w-xl" pct={goalProgress(g)} targetCount={1} measure={formatMeasure(g)} />
                                <div className="mt-1.5 text-[11px] text-slate-400">
                                    {g.aligned_count} individual target{g.aligned_count === 1 ? "" : "s"} aligned to this goal
                                    {goalProgressIsDerived(g) && " — achievement above is rolled up from them"}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-700" onClick={() => remove(g)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Detail + input panel (inline, under the chart) ────────────────────────
// A plain table: what the goal is, its weight, target vs actual, and the
// achieved %. Editing happens in the row itself so the figure you're changing
// never leaves the context of the ones around it.

function TargetPanel({ seat, banner, targets, loading, goals, cycleId, cycleName, rollupPct, weightTotal, onChanged, onClear }: {
    seat: OrgFlatNode | null;
    banner: { name: string | null; logo: string | null } | null;
    targets: EmployeeTarget[];
    loading: boolean;
    goals: BannerGoal[];
    cycleId: number;
    cycleName: string;
    rollupPct: number | null;
    weightTotal: number;
    onChanged: () => void;
    onClear: () => void;
}) {
    const [editing, setEditing] = useState<number | "new" | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft());
    const [saving, setSaving] = useState(false);

    // Switching seats must not carry a half-typed row across to the next person.
    useEffect(() => { setEditing(null); setDraft(emptyDraft()); }, [seat?.id]);

    // A company node and a person share this panel — same table, same columns,
    // different rows underneath. The company's rows are its objectives; a
    // person's are the targets they set against them.
    const isBanner = seat?.node_kind === "banner";
    const bannerGoals = isBanner ? goals.filter((g) => g.banner_id === seat!.banner_id) : [];

    const rows: PanelRow[] = isBanner
        ? bannerGoals.map((g) => ({
            id: g.goal_id, title: g.title, description: g.description,
            metric_unit: g.metric_unit, target_value: g.target_value, actual_value: g.actual_value,
            progress_pct: g.progress_pct, weight: g.weight, banner_goal_id: null,
            pct: goalProgress(g), derived: goalProgressIsDerived(g), alignedCount: g.aligned_count,
        }))
        : targets.map((t) => ({
            id: t.target_id, title: t.title, description: t.description,
            metric_unit: t.metric_unit, target_value: t.target_value, actual_value: t.actual_value,
            progress_pct: t.progress_pct, weight: t.weight, banner_goal_id: t.banner_goal_id,
            pct: progressPct(t), derived: false, alignedCount: null,
        }));

    // A person's targets read better grouped under the company objective they
    // serve — the objective is the heading, its targets sit beneath it — rather
    // than as a flat list repeating the objective name on every row. Anything
    // not tied to an objective collects in a final group.
    const groups: { key: string; goal: BannerGoal | null; rows: PanelRow[] }[] = isBanner
        ? [{ key: "all", goal: null, rows }]
        : (() => {
            const byGoal = new Map<string, PanelRow[]>();
            rows.forEach((r) => {
                const k = r.banner_goal_id == null ? "none" : String(r.banner_goal_id);
                const a = byGoal.get(k) || [];
                a.push(r);
                byGoal.set(k, a);
            });
            const out: { key: string; goal: BannerGoal | null; rows: PanelRow[] }[] = [];
            const placed = new Set<string>();
            goals.forEach((g) => {                       // company's own order
                const a = byGoal.get(String(g.goal_id));
                if (a) { out.push({ key: String(g.goal_id), goal: g, rows: a }); placed.add(String(g.goal_id)); }
            });
            // A target can point at an objective that isn't on this page — most
            // obviously once someone changes company, since their targets move
            // with them but stay aligned to their old company's objective.
            // Those rows still have to appear: they count toward the Overall
            // below, so dropping them would leave a total that doesn't add up.
            byGoal.forEach((a, key) => {
                if (key !== "none" && !placed.has(key)) out.push({ key, goal: null, rows: a });
            });
            const loose = byGoal.get("none");
            if (loose) out.push({ key: "none", goal: null, rows: loose });
            return out;
        })();
    // Headings only earn their space once something is actually grouped — but
    // an unresolvable alignment counts, since that heading is the only thing
    // explaining why those rows look orphaned.
    const showGroupHeadings = !isBanner && groups.some((g) => g.goal || g.key !== "none");

    const overallPct = isBanner
        ? rollup(rows.map((r) => ({ target_value: null, actual_value: null, progress_pct: r.pct, weight: r.weight })))
        : rollupPct;
    const overallWeight = isBanner ? weightSum(rows) : weightTotal;
    const meta = PERF_STATUS[perfStatus(overallPct, rows.length)];

    async function save() {
        if (!seat) return;
        setSaving(true);
        const input = {
            title: draft.title, description: draft.description, metric_unit: draft.metric_unit,
            target_value: num(draft.target_value), actual_value: num(draft.actual_value),
            progress_pct: num(draft.progress_pct), weight: num(draft.weight),
        };
        const res = isBanner
            ? (editing === "new"
                ? await createBannerGoal(cycleId, seat.banner_id!, input)
                : await updateBannerGoal(editing as number, input))
            : (editing === "new"
                ? await createEmployeeTarget(cycleId, Number(seat.id), { ...input, banner_goal_id: draft.banner_goal_id ? Number(draft.banner_goal_id) : null })
                : await updateEmployeeTarget(editing as number, { ...input, banner_goal_id: draft.banner_goal_id ? Number(draft.banner_goal_id) : null }));
        setSaving(false);
        if (!res.ok) { toast.error(res.error || "Couldn't save"); return; }
        toast.success(editing === "new" ? (isBanner ? "Objective added" : "Target added") : "Saved");
        setEditing(null);
        onChanged();
    }

    async function remove(r: PanelRow) {
        const res = isBanner ? await deleteBannerGoal(r.id) : await deleteEmployeeTarget(r.id);
        if (!res.ok) { toast.error(res.error || "Couldn't delete"); return; }
        toast.success("Deleted");
        onChanged();
    }

    // Nothing selected yet — the panel still occupies its space so the page
    // doesn't jump when a card is clicked.
    if (!seat) {
        return (
            <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] min-h-[300px]">
                <div className="bg-[#0b1f3a] text-white px-4 py-2.5 text-[12.5px] font-semibold shrink-0">
                    Goals &amp; achievement
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
                    <MousePointerClick className="h-7 w-7 text-slate-300" />
                    <p className="text-[13px] font-semibold text-slate-500">Pick someone on the chart</p>
                    <p className="max-w-xs text-[12px] text-slate-400 leading-relaxed">
                        Their goals for this cycle — and what they've achieved so far — show up here to view and edit.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border border-slate-200 rounded-[14px] overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(15,23,42,.04)] min-h-[300px]">
            {/* Who this is */}
            <div className="bg-[#0b1f3a] text-white px-4 py-2.5 shrink-0 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold truncate">{seat.name}</span>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${meta.hex}33`, color: "#fff" }}>
                            {overallPct == null ? meta.label : `${Math.round(overallPct)}%`}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate">
                        {isBanner
                            ? "Company objectives — its people pick these up below"
                            : `${seat.position_title ?? ""}${seat.banner_name ? ` · ${seat.banner_name}` : (banner?.name ? ` · ${banner.name}` : "")}`}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {rows.length > 0 && overallWeight > 0 && Math.round(overallWeight) !== 100 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                            <AlertTriangle className="h-3 w-3" /> Weights {Math.round(overallWeight)}%
                        </span>
                    )}
                    {!isBanner && rows.length > 0 && (
                        <button
                            onClick={() => exportPerformanceEmployeePptx({
                                cycleName,
                                name: seat.name,
                                positionTitle: seat.position_title,
                                bannerName: seat.banner_name ?? banner?.name ?? null,
                                photo: seat.photo,
                                overallPct, weightTotal: overallWeight,
                                targets: rows.map((r) => ({
                                    title: r.title, description: r.description,
                                    goalTitle: r.banner_goal_id != null ? (goals.find((g) => g.goal_id === r.banner_goal_id)?.title ?? null) : null,
                                    metric_unit: r.metric_unit, target_value: r.target_value,
                                    actual_value: r.actual_value, weight: r.weight, pct: r.pct,
                                })),
                            }).then(() => toast.success("Exported PPTX 🎉")).catch((e) => toast.error(e?.message || "Export failed"))}
                            className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                            aria-label="Export this person's targets to PPTX"
                            title="Export to PPTX"
                        >
                            <FileDown className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <Button size="sm" className="h-6.5 gap-1 text-[11.5px] px-2" onClick={() => { setDraft(emptyDraft()); setEditing("new"); }}>
                        <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                    <button onClick={onClear} className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Clear selection">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : (
                    <table className="w-full min-w-[600px] text-[12px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500">
                                <th className="px-3 py-2 text-left font-bold">{isBanner ? "Company objective" : "Goal / target"}</th>
                                <th className="px-2 py-2 text-right font-bold w-[68px]">Weight</th>
                                <th className="px-2 py-2 text-right font-bold w-[80px]">Target</th>
                                <th className="px-2 py-2 text-right font-bold w-[80px]">Actual</th>
                                <th className="px-2 py-2 text-right font-bold w-[112px]">Achieved</th>
                                <th className="px-2 py-2 w-[64px]" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.length === 0 && editing !== "new" && (
                                <tr>
                                    <td colSpan={6} className="px-3 py-10 text-center">
                                        <p className="text-[12.5px] font-semibold text-slate-600">
                                            {isBanner ? "No objectives set yet" : "No goals recorded yet"}
                                        </p>
                                        <p className="mt-0.5 text-[11.5px] text-slate-400">
                                            {isBanner
                                                ? "Set what this company is aiming for — its people can then pick these up."
                                                : "Add what this role is expected to deliver this cycle."}
                                        </p>
                                    </td>
                                </tr>
                            )}

                            {groups.map((grp) => (
                                <Fragment key={grp.key}>
                                    {showGroupHeadings && (
                                        <tr className="bg-slate-100/70">
                                            <td className="px-3 py-1.5">
                                                <div className="text-[11.5px] font-extrabold text-[#0b1f3a]">
                                                    {grp.goal
                                                        ? grp.goal.title
                                                        : grp.key === "none"
                                                            ? "Not tied to a company objective"
                                                            : "Objective from another company"}
                                                </div>
                                                {!grp.goal && grp.key !== "none" && (
                                                    <div className="text-[10.5px] font-normal text-slate-500">
                                                        Set before this person changed company — re-point or clear it
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-slate-500">
                                                {grp.goal?.weight != null ? `${grp.goal.weight}%` : ""}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-slate-500">
                                                {grp.goal?.target_value != null ? `${grp.goal.target_value}${grp.goal.metric_unit ? ` ${grp.goal.metric_unit}` : ""}` : ""}
                                            </td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-slate-500">
                                                {grp.goal?.actual_value != null ? grp.goal.actual_value : ""}
                                            </td>
                                            <td className="px-2 py-1.5">
                                                {grp.goal && <PerfBulletRow pct={goalProgress(grp.goal)} targetCount={1} />}
                                            </td>
                                            <td />
                                        </tr>
                                    )}

                                    {grp.rows.map((r) => editing === r.id ? (
                                        <TargetFormRow key={r.id} draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} goals={isBanner ? undefined : goals} />
                                    ) : (
                                        <tr key={r.id} className="hover:bg-slate-50/60">
                                            <td className={`py-2.5 pr-3 ${showGroupHeadings ? "pl-7" : "pl-3"}`}>
                                                <div className="font-semibold text-[#0f172a]">
                                                    {showGroupHeadings && <span className="mr-1 text-slate-300">↳</span>}
                                                    {r.title}
                                                </div>
                                                {r.description && <div className="mt-0.5 text-[11px] text-slate-500 whitespace-pre-line">{r.description}</div>}
                                                {r.alignedCount != null && (
                                                    <div className="mt-0.5 text-[10.5px] text-slate-400">
                                                        {r.alignedCount} target{r.alignedCount === 1 ? "" : "s"} picked this up
                                                        {r.derived && " · achievement rolled up from them"}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{r.weight != null ? `${r.weight}%` : "—"}</td>
                                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                                                {r.target_value != null ? `${r.target_value}${r.metric_unit ? ` ${r.metric_unit}` : ""}` : "—"}
                                            </td>
                                            <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{r.actual_value != null ? r.actual_value : "—"}</td>
                                            <td className="px-2 py-2.5">
                                                <PerfBulletRow pct={r.pct} targetCount={1} />
                                            </td>
                                            <td className="px-2 py-2.5">
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                                        setDraft({
                                                            title: r.title, description: r.description ?? "", metric_unit: r.metric_unit ?? "",
                                                            target_value: r.target_value?.toString() ?? "", actual_value: r.actual_value?.toString() ?? "",
                                                            progress_pct: r.progress_pct?.toString() ?? "", weight: r.weight?.toString() ?? "",
                                                            banner_goal_id: r.banner_goal_id?.toString() ?? "",
                                                        });
                                                        setEditing(r.id);
                                                    }}><Pencil className="h-3 w-3" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-700" onClick={() => remove(r)}><Trash2 className="h-3 w-3" /></Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </Fragment>
                            ))}

                            {editing === "new" && (
                                <TargetFormRow draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setEditing(null)} goals={isBanner ? undefined : goals} />
                            )}
                        </tbody>
                        {rows.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-bold">
                                    <td className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Overall</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-slate-600">{Math.round(overallWeight)}%</td>
                                    <td colSpan={2} />
                                    <td className="px-2 py-2">
                                        <PerfBulletRow pct={overallPct} targetCount={rows.length} />
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                )}
            </div>
        </div>
    );
}

// One editable row — spans the table so the inputs line up under their headers.
function TargetFormRow({ draft, setDraft, saving, onSave, onCancel, goals }: {
    draft: Draft;
    setDraft: (d: Draft) => void;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
    // Absent when editing a company objective — an objective can't align to
    // itself, so there's nothing to pick.
    goals?: BannerGoal[];
}) {
    const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
    const previewPct = progressPct({
        target_value: num(draft.target_value),
        actual_value: num(draft.actual_value),
        progress_pct: num(draft.progress_pct),
    });

    return (
        <tr className="bg-slate-50/80">
            <td className="px-3 py-2.5 align-top">
                <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Grow like-for-like sales" className="h-7 text-[12px]" autoFocus />
                <textarea
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] outline-none placeholder:text-slate-400"
                />
                {goals && (
                    <select
                        value={draft.banner_goal_id}
                        onChange={(e) => set("banner_goal_id", e.target.value)}
                        className="mt-1.5 h-7 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[11.5px] outline-none"
                    >
                        {/* Deliberately optional: not every function moves a
                            company objective directly, so a target is allowed
                            to stand on its own. */}
                        <option value="">Supports company objective — none</option>
                        {goals.map((g) => <option key={g.goal_id} value={g.goal_id}>{g.title}</option>)}
                    </select>
                )}
            </td>
            <td className="px-2 py-2.5 align-top">
                <Input type="number" inputMode="decimal" value={draft.weight} onChange={(e) => set("weight", e.target.value)} placeholder="40" className="h-7 text-[12px] text-right" />
            </td>
            <td className="px-2 py-2.5 align-top">
                <Input type="number" inputMode="decimal" value={draft.target_value} onChange={(e) => set("target_value", e.target.value)} placeholder="100" className="h-7 text-[12px] text-right" />
                <Input value={draft.metric_unit} onChange={(e) => set("metric_unit", e.target.value)} placeholder="unit" className="mt-1.5 h-7 text-[12px] text-right" />
            </td>
            <td className="px-2 py-2.5 align-top">
                <Input type="number" inputMode="decimal" value={draft.actual_value} onChange={(e) => set("actual_value", e.target.value)} placeholder="82" className="h-7 text-[12px] text-right" />
            </td>
            <td className="px-2 py-2.5 align-top">
                <Input type="number" inputMode="decimal" value={draft.progress_pct} onChange={(e) => set("progress_pct", e.target.value)} placeholder="auto" className="h-7 text-[12px] text-right" />
                <p className="mt-1 text-[10px] leading-tight text-slate-400">
                    {draft.progress_pct.trim() !== ""
                        ? "Overrides target vs actual"
                        : previewPct != null ? `= ${Math.round(previewPct)}%` : "From target vs actual"}
                </p>
            </td>
            <td className="px-2 py-2.5 align-top">
                <div className="flex flex-col gap-1">
                    <Button size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={onSave} disabled={saving || !draft.title.trim()}>
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onCancel} disabled={saving}>Cancel</Button>
                </div>
            </td>
        </tr>
    );
}

// ── Shared inline editor ──────────────────────────────────────────────────
// Inline rather than a nested dialog: a modal stacked on top of the bottom
// sheet is a focus/stacking mess, and editing in place keeps the row you're
// changing visible in context.

function MeasurableForm({ draft, setDraft, saving, onSave, onCancel, goals }: {
    draft: Draft;
    setDraft: (d: Draft) => void;
    saving: boolean;
    onSave: () => void;
    onCancel: () => void;
    goals?: BannerGoal[]; // present only for employee targets (alignment picker)
}) {
    const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
    const previewPct = progressPct({
        target_value: num(draft.target_value),
        actual_value: num(draft.actual_value),
        progress_pct: num(draft.progress_pct),
    });

    return (
        <div className="bg-slate-50/80 px-5 py-3.5">
            <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
                <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Title</label>
                    <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Grow like-for-like sales" className="h-8 text-[13px]" autoFocus />
                </div>
                {goals && (
                    <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Supports company goal</label>
                        <select
                            value={draft.banner_goal_id}
                            onChange={(e) => set("banner_goal_id", e.target.value)}
                            className="h-8 w-full sm:w-56 rounded-md border border-slate-200 bg-white px-2 text-[12.5px] outline-none"
                        >
                            <option value="">— none —</option>
                            {goals.map((g) => <option key={g.goal_id} value={g.goal_id}>{g.title}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div className="mt-2.5">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                    value={draft.description}
                    onChange={(e) => set("description", e.target.value)}
                    rows={2}
                    placeholder="Any detail worth recording alongside the numbers"
                    className="w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] outline-none placeholder:text-slate-400"
                />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <Field label="Target" value={draft.target_value} onChange={(v) => set("target_value", v)} placeholder="100" />
                <Field label="Actual" value={draft.actual_value} onChange={(v) => set("actual_value", v)} placeholder="82" />
                <Field label="Unit" value={draft.metric_unit} onChange={(v) => set("metric_unit", v)} placeholder="€M" type="text" />
                <Field label="Weight %" value={draft.weight} onChange={(v) => set("weight", v)} placeholder="40" />
                <Field label="Progress %" value={draft.progress_pct} onChange={(v) => set("progress_pct", v)} placeholder="auto" />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                    {draft.progress_pct.trim() !== ""
                        ? "Progress % is set by hand — it overrides target vs actual."
                        : previewPct != null
                            ? `Progress works out to ${Math.round(previewPct)}%.`
                            : "Fill in Target and Actual, or enter Progress % directly for goals that aren't numeric."}
                </p>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onCancel} disabled={saving}>Cancel</Button>
                    <Button size="sm" className="h-7 text-[12px] gap-1" onClick={onSave} disabled={saving || !draft.title.trim()}>
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
                    </Button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = "number" }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
    return (
        <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">{label}</label>
            <Input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-[13px]" />
        </div>
    );
}
