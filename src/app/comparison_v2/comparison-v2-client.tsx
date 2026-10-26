"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeListItem, EmployeeDetail, Compensation } from "@/app/actions/employees";
import { getComparisonData } from "@/app/actions/employees";
import { setProposalComparisons, createProposalForComparison, type ProposalBoardEntry } from "@/app/actions/proposals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency, formatDate, formatYears, gradeColor, yearsBetween } from "@/lib/format";
import { Crown, Search, X, Plus, Printer, FileDown, Download, Loader2, Users, UserPlus, ChevronDown, GripVertical, FileText, Save } from "lucide-react";
import { buildComparisonHtml } from "../comparison/export-html";
import { exportComparisonPptx } from "@/lib/pptx-export";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { FilterMultiSelect } from "@/components/ui/filter-multi-select";
import { Money } from "@/components/comp-visibility";

export interface SaveToProposalData {
    proposals: { proposal_id: number; employee_name: string }[];
    positions: { position_id: number; title: string }[];
}

const MAX = 8;
const NAVY = "#0b1f3a";
// Sticky table cells (position: sticky) ghost/tear during horizontal scroll in
// Chromium unless forced onto their own compositing layer — this keeps the
// sticky "Metric" column and header row from bleeding into scrolled content.
const STICKY_FIX: React.CSSProperties = { willChange: "transform", transform: "translateZ(0)" };

// ── Metric row definitions ────────────────────────────────────────────────
// A comparable numeric row: leader = the highest value, and every cell gets a
// magnitude bar so proportion reads without arithmetic. `key` doubles as the
// field name on Compensation so the scenario editor can reuse this same list.
// `pct` rows are entered as % of base everywhere else in the app (Add Employee
// wizard, Compensation History) — the What-if panel below used to be the one
// place still typing these as raw €, which is what the client flagged.
type NumRow = { label: string; key: keyof Compensation; get: (d: EmployeeDetail) => number | null; pct?: boolean };
const COMP_ROWS: NumRow[] = [
    { label: "Base / Salary", key: "base_salary", get: (d) => d.compensation?.base_salary ?? null },
    { label: "STI Target", key: "sti_target", get: (d) => d.compensation?.sti_target ?? null, pct: true },
    { label: "STI Max", key: "sti_max", get: (d) => d.compensation?.sti_max ?? null, pct: true },
    { label: "LTI Target", key: "lti_target", get: (d) => d.compensation?.lti_target ?? null, pct: true },
    { label: "LTI Max", key: "lti_max", get: (d) => d.compensation?.lti_max ?? null, pct: true },
    { label: "Other Bonus", key: "other_bonus", get: (d) => d.compensation?.other_bonus ?? null },
    { label: "Allowance · Car", key: "allowance_company_car", get: (d) => d.compensation?.allowance_company_car ?? null },
    { label: "Allowance · Mobile", key: "allowance_mobility", get: (d) => d.compensation?.allowance_mobility ?? null },
    { label: "Allowance · Housing", key: "allowance_home_office", get: (d) => d.compensation?.allowance_home_office ?? null },
    { label: "Benefit · Medical", key: "allowance_private_medical", get: (d) => d.compensation?.allowance_private_medical ?? null },
];
// Free text, not a comparable number — kept out of COMP_ROWS (which drives
// both the magnitude-bar comparison table and the What-if % logic) and
// rendered separately in both places instead.
const OTHER_BENEFIT_LABEL = "Other benefit (please specify)";
// Total compensation = base + STI target + LTI target + other bonus (D8: excludes allowances/benefits).
const scenarioTotalOf = (f: Record<string, number>) => (f.base_salary || 0) + (f.sti_target || 0) + (f.lti_target || 0) + (f.other_bonus || 0);
const FISCAL_YEARS = [2021, 2022, 2023, 2024, 2025];

// Extract a persistable board (real peers + what-if scenarios, in order) from
// a live, on-screen-ordered detail list — used by an embedding proposal's
// explicit Save action (via `onBoardChange`'s live snapshot). `lockedId` (the
// proposal subject) is stripped since it's implicit and never stored.
export function boardEntriesFromDetails(details: EmployeeDetail[], lockedId?: number): ProposalBoardEntry[] {
    return details
        .filter((d) => d.employee_id !== lockedId)
        .map((d): ProposalBoardEntry | null =>
            d.employee_id > 0
                ? { type: "peer", employee_id: d.employee_id }
                : d.compensation && d.simulated_from != null
                    ? { type: "whatif", base_employee_id: d.simulated_from, compensation: d.compensation }
                    : null)
        .filter((e): e is ProposalBoardEntry => e !== null);
}

// Imperative handle so an embedding parent (a proposal) can trigger the
// board save from outside — e.g. a "save before leaving?" confirm dialog
// triggered by a tab switch or the breadcrumb back-link.
export interface ComparisonV2Handle {
    save: () => Promise<boolean>;
}

export const ComparisonV2Client = forwardRef<ComparisonV2Handle, {
    employees: EmployeeListItem[];
    // Pre-seed the board (e.g. a proposal's subject + pinned benchmark peers).
    // Ignored when `initialBoard` is provided.
    initialSelectedIds?: number[];
    // Full board (real peers + what-if scenarios, in saved order) to restore —
    // takes priority over `initialSelectedIds` when provided.
    initialBoard?: ProposalBoardEntry[];
    // An employee that is always column 1 and can't be removed (proposal owner).
    lockedId?: number;
    // Fires with the full display-ordered board (real people + what-if
    // scenarios) whenever it changes, so an embedding parent can export it.
    onBoardChange?: (people: EmployeeDetail[]) => void;
    // Embedded in a proposal: hide the standalone PPTX/Print/HTML exports and
    // the big page title (the proposal owns export + chrome).
    embedded?: boolean;
    // When provided (standalone /comparison_v2 page), show "Save to proposal".
    saveTarget?: SaveToProposalData;
    // When provided (proposal-embedded usage), renders an explicit "Save"
    // button before "Add people" — enabled only once the board actually has
    // unsaved changes (add/remove/reorder/what-if). There is no auto-persist:
    // a debounced auto-save had every change write the full board, and two
    // writes in flight at once could finish out of order and silently drop
    // whichever was more recent.
    onSaveBoard?: (board: ProposalBoardEntry[]) => Promise<{ ok: boolean; error?: string; savedBy?: string; savedAt?: string }>;
    initialSavedBy?: string | null;
    initialSavedAt?: string | null;
    // Fires whenever the "has unsaved changes" state flips, so an embedding
    // parent can guard tab switches / the back link with a confirm dialog.
    onDirtyChange?: (dirty: boolean) => void;
}>(function ComparisonV2Client({
    employees,
    initialSelectedIds = [],
    initialBoard,
    lockedId,
    onBoardChange,
    embedded,
    saveTarget,
    onSaveBoard,
    initialSavedBy,
    initialSavedAt,
    onDirtyChange,
}, ref) {
    const router = useRouter();
    const [selected, setSelected] = useState<number[]>(initialSelectedIds);
    // Mirror of `selected` that updates synchronously inside handlers, so rapid
    // successive adds accumulate correctly instead of racing on stale state.
    const selectedRef = useRef<number[]>(initialSelectedIds);
    const [details, setDetails] = useState<EmployeeDetail[]>([]);
    const fetchSeq = useRef(0);
    const seededRef = useRef(false);
    const [simulated, setSimulated] = useState<EmployeeDetail[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [companyFilter, setCompanyFilter] = useState<string[]>([]);
    const [functionFilter, setFunctionFilter] = useState<string[]>([]);

    // what-if scenario — every comp line item is editable, prefilled from the base person
    const [simBase, setSimBase] = useState<number | "">("");
    const [scenarioFields, setScenarioFields] = useState<Record<string, number>>({});
    const [scenarioOtherBenefit, setScenarioOtherBenefit] = useState("");

    // Explicit-save state (proposal-embedded usage only — see onSaveBoard).
    // `dirty` flips true on any add/remove/reorder/what-if change and back to
    // false once a save succeeds; it never flips true during the initial seed.
    const [dirty, setDirty] = useState(false);
    const [boardSaving, setBoardSaving] = useState(false);
    const [boardSavedBy, setBoardSavedBy] = useState(initialSavedBy ?? null);
    const [boardSavedAt, setBoardSavedAt] = useState(initialSavedAt ?? null);

    useEffect(() => {
        onDirtyChange?.(dirty);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // manual column order (drag-to-reorder) — synced with whichever ids are
    // currently on the board; new ids are appended, removed ids drop out.
    const [order, setOrder] = useState<number[]>([]);
    const [dragId, setDragId] = useState<number | null>(null);
    // Columns default to total-comp ranking (high→low); a manual drag pins the
    // order and stops auto-sorting from then on.
    const manualOrderRef = useRef(false);

    const allDetails = useMemo(() => [...details, ...simulated], [details, simulated]);

    // Seed the board once — either from a saved `initialBoard` (proposal
    // reload: real peers + what-if scenarios + drag order, all restored) or
    // plain `initialSelectedIds` (standalone page / no board saved yet).
    useEffect(() => {
        if (seededRef.current) return;
        seededRef.current = true;
        const board = initialBoard ?? initialSelectedIds.map((id): ProposalBoardEntry => ({ type: "peer", employee_id: id }));
        if (board.length === 0) return;
        (async () => {
            setLoading(true);
            const requestId = ++fetchSeq.current;

            const peerIds = board.filter((b) => b.type === "peer").map((b) => b.employee_id);
            const realIds = lockedId != null && !peerIds.includes(lockedId) ? [lockedId, ...peerIds] : peerIds;
            const whatIfs = board.filter((b): b is Extract<ProposalBoardEntry, { type: "whatif" }> => b.type === "whatif");
            const baseIds = Array.from(new Set(whatIfs.map((w) => w.base_employee_id)));

            const [realData, baseData] = await Promise.all([
                realIds.length ? getComparisonData(realIds) : Promise.resolve([] as EmployeeDetail[]),
                baseIds.length ? getComparisonData(baseIds) : Promise.resolve([] as EmployeeDetail[]),
            ]);
            if (requestId !== fetchSeq.current) return;
            realData.sort((a, b) => realIds.indexOf(a.employee_id) - realIds.indexOf(b.employee_id));

            const baseById = new Map(baseData.map((d) => [d.employee_id, d]));
            const simDetails: EmployeeDetail[] = whatIfs
                .map((w, i): EmployeeDetail | null => {
                    const base = baseById.get(w.base_employee_id);
                    if (!base) return null;
                    return {
                        ...base,
                        employee_id: -(i + 1),
                        name: `${base.name} (adjusted)`,
                        compensation: w.compensation,
                        total_compensation: w.compensation.total_compensation,
                        simulated_from: base.employee_id,
                    };
                })
                .filter((d): d is EmployeeDetail => d !== null);

            setDetails(realData);
            setSimulated(simDetails);
            const realIdsFetched = realData.map((d) => d.employee_id);
            selectedRef.current = realIdsFetched;
            setSelected(realIdsFetched);

            // Restore the exact saved order (locked subject first, then peers
            // and what-ifs interleaved as saved).
            let simIdx = 0;
            const restoredOrder: number[] = [];
            if (lockedId != null && realIdsFetched.includes(lockedId)) restoredOrder.push(lockedId);
            for (const entry of board) {
                if (entry.type === "peer") { if (realIdsFetched.includes(entry.employee_id)) restoredOrder.push(entry.employee_id); }
                else { const sim = simDetails[simIdx]; simIdx++; if (sim) restoredOrder.push(sim.employee_id); }
            }
            if (restoredOrder.length) { manualOrderRef.current = true; setOrder(restoredOrder); }

            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setOrder((prev) => {
            const ids = allDetails.map((d) => d.employee_id);
            if (!manualOrderRef.current) {
                // Default ranking: total compensation, high → low.
                const byId = new Map(allDetails.map((d) => [d.employee_id, d]));
                return [...ids].sort((a, b) => (byId.get(b)!.total_compensation || 0) - (byId.get(a)!.total_compensation || 0));
            }
            const kept = prev.filter((id) => ids.includes(id));
            const added = ids.filter((id) => !kept.includes(id));
            return [...kept, ...added];
        });
    }, [allDetails]);

    const orderedDetails = useMemo(() => {
        const byId = new Map(allDetails.map((d) => [d.employee_id, d]));
        return order.map((id) => byId.get(id)).filter((d): d is EmployeeDetail => !!d);
    }, [order, allDetails]);

    // Let an embedding parent (a proposal) export the live board — including
    // what-if scenarios and the current drag order.
    useEffect(() => {
        onBoardChange?.(orderedDetails);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderedDetails]);

    async function saveBoard(): Promise<boolean> {
        if (!onSaveBoard) return true;
        setBoardSaving(true);
        const board = boardEntriesFromDetails(orderedDetails, lockedId);
        const r = await onSaveBoard(board);
        setBoardSaving(false);
        if (r.ok) {
            setDirty(false);
            setBoardSavedBy(r.savedBy ?? null);
            setBoardSavedAt(r.savedAt ?? null);
            toast.success("Comparison saved");
            return true;
        }
        toast.error(r.error || "Save failed");
        return false;
    }

    useImperativeHandle(ref, () => ({ save: saveBoard }));

    function reorderColumns(draggedId: number, targetId: number) {
        manualOrderRef.current = true; // manual rank overrides default comp sort
        setOrder((prev) => {
            const from = prev.indexOf(draggedId);
            const to = prev.indexOf(targetId);
            if (from === -1 || to === -1 || from === to) return prev;
            const next = [...prev];
            next.splice(from, 1);
            next.splice(to, 0, draggedId);
            return next;
        });
        setDirty(true);
    }

    async function toggle(id: number) {
        if (selectedRef.current.includes(id)) {
            if (id === lockedId) return; // proposal owner stays pinned as column 1
            // removal never needs a re-fetch — filter what we already have.
            const filtered = selectedRef.current.filter((x) => x !== id);
            selectedRef.current = filtered;
            setSelected(filtered);
            setDetails((prev) => prev.filter((d) => d.employee_id !== id));
            setDirty(true);
            return;
        }
        if (selectedRef.current.length >= MAX) { toast.error(`You can compare up to ${MAX} people`); return; }
        const next = [...selectedRef.current, id];
        selectedRef.current = next;
        setSelected(next);
        setDirty(true);
        setLoading(true);
        // guard against out-of-order responses: quick successive clicks each
        // kick off their own fetch, and an earlier one resolving after a
        // later one would silently overwrite it with a stale, shorter list.
        const requestId = ++fetchSeq.current;
        const data = await getComparisonData(next);
        if (requestId !== fetchSeq.current) return;
        data.sort((a, b) => next.indexOf(a.employee_id) - next.indexOf(b.employee_id));
        setDetails(data);
        setLoading(false);
    }

    function pickScenarioBase(id: number | "") {
        setSimBase(id);
        const base = details.find((d) => d.employee_id === id);
        if (!base?.compensation) { setScenarioFields({}); setScenarioOtherBenefit(""); return; }
        const c = base.compensation;
        const fields: Record<string, number> = {};
        COMP_ROWS.forEach((r) => { fields[r.key] = (c[r.key] as number) ?? 0; });
        setScenarioFields(fields);
        setScenarioOtherBenefit(c.allowance_family_cover || "");
    }

    function setScenarioField(key: string, value: string) {
        setScenarioFields((prev) => ({ ...prev, [key]: value === "" ? 0 : Number(value) }));
    }

    const scenarioTotal = scenarioTotalOf(scenarioFields);

    function addSimulation() {
        const base = details.find((d) => d.employee_id === simBase);
        if (!base) { toast.error("Pick someone to model first"); return; }
        const sim: EmployeeDetail = {
            ...base,
            employee_id: -(Date.now()),
            name: `${base.name} (adjusted)`,
            total_compensation: scenarioTotal,
            compensation: base.compensation ? { ...base.compensation, ...scenarioFields, allowance_family_cover: scenarioOtherBenefit || null, total_compensation: scenarioTotal } as Compensation : null,
            simulated_from: base.employee_id,
        };
        setSimulated((prev) => [...prev, sim]);
        setSimBase(""); setScenarioFields({}); setScenarioOtherBenefit("");
        setDirty(true);
        toast.success("Added adjusted scenario");
    }
    function removeSim(id: number) {
        setSimulated((prev) => prev.filter((s) => s.employee_id !== id));
        setDirty(true);
    }

    function removeColumn(id: number) {
        if (id < 0) removeSim(id);
        else toggle(id);
    }

    const heroValue = (d: EmployeeDetail) => d.total_compensation || 0;
    const heroMax = useMemo(() => Math.max(1, ...allDetails.map(heroValue)), [allDetails]);

    // ── exports (reuse original serializers) ──
    function exportHtml() {
        const html = buildComparisonHtml(orderedDetails, false);
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `employee-comparison-${new Date().toISOString().slice(0, 10)}.html`;
        a.click(); URL.revokeObjectURL(url);
    }
    function printPdf() {
        const html = buildComparisonHtml(orderedDetails, false);
        const w = window.open("", "_blank");
        if (!w) return;
        w.document.write(html); w.document.close(); w.focus();
        setTimeout(() => w.print(), 350);
    }
    const [pptxLoading, setPptxLoading] = useState(false);
    async function exportPptx() {
        setPptxLoading(true);
        try { await exportComparisonPptx(orderedDetails, false); toast.success("Exported PPTX 🎉"); }
        catch (e: any) { toast.error("Export failed: " + (e?.message || "")); }
        finally { setPptxLoading(false); }
    }

    // ── Save this board to a proposal (standalone page only) ──
    const [saveOpen, setSaveOpen] = useState(false);
    const [saveMode, setSaveMode] = useState<"existing" | "new">("existing");
    const [existingProposalId, setExistingProposalId] = useState<number | "">("");
    const [newSubjectId, setNewSubjectId] = useState<number | "">("");
    const [newPositionId, setNewPositionId] = useState<number | "">("");
    const [savingProposal, setSavingProposal] = useState(false);
    // real (non-simulated) people currently on the board
    const boardIds = useMemo(() => details.map((d) => d.employee_id), [details]);

    function openSaveDialog() {
        if (!saveTarget) return;
        setSaveMode(saveTarget.proposals.length ? "existing" : "new");
        setExistingProposalId(saveTarget.proposals[0]?.proposal_id ?? "");
        setNewSubjectId(boardIds[0] ?? "");
        setNewPositionId("");
        setSaveOpen(true);
    }

    async function confirmSaveToProposal() {
        setSavingProposal(true);
        try {
            if (saveMode === "existing") {
                if (!existingProposalId) { toast.error("Pick a proposal"); return; }
                const r = await setProposalComparisons(Number(existingProposalId), boardIds);
                if (!r.ok) { toast.error(r.error || "Could not attach"); return; }
                toast.success("Comparison attached to proposal");
                setSaveOpen(false);
                router.push(`/proposals/${existingProposalId}?tab=comparison`);
            } else {
                if (!newSubjectId) { toast.error("Pick the proposal's employee"); return; }
                const r = await createProposalForComparison(
                    Number(newSubjectId),
                    newPositionId ? Number(newPositionId) : null,
                    boardIds,
                );
                if (!r.ok || !r.id) { toast.error(r.error || "Could not create proposal"); return; }
                toast.success("Proposal created");
                setSaveOpen(false);
                router.push(`/proposals/${r.id}?tab=comparison`);
            }
        } finally {
            setSavingProposal(false);
        }
    }

    const companyOptions = useMemo(() => Array.from(new Set(employees.map((e) => e.banner_name).filter(Boolean))) as string[], [employees]);
    const functionOptions = useMemo(() => Array.from(new Set(employees.map((e) => e.function_name).filter(Boolean))) as string[], [employees]);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(query.trim().toLowerCase()) &&
        (companyFilter.length === 0 || (e.banner_name && companyFilter.includes(e.banner_name))) &&
        (functionFilter.length === 0 || (e.function_name && functionFilter.includes(e.function_name)))
    );
    const hasData = allDetails.length > 0;

    return (
        <div className="flex flex-col min-h-full lg:h-full">
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-[22px] sm:text-[26px] font-extrabold tracking-tight" style={{ color: NAVY }}>Candidate Comparison</h1>
                    </div>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">
                        Head-to-head compensation &amp; performance · {selected.length} of {MAX} people
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {onSaveBoard && (
                        <>
                            {boardSavedBy && (
                                <span className="hidden text-[11px] text-slate-400 sm:inline">
                                    Saved by {boardSavedBy}{boardSavedAt ? ` · ${new Date(boardSavedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                                </span>
                            )}
                            <Button size="sm" variant="outline" className="gap-1.5" disabled={!dirty || boardSaving} onClick={saveBoard}>
                                {boardSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                            </Button>
                        </>
                    )}
                    <AddPeople
                        query={query} setQuery={setQuery}
                        companyOptions={companyOptions} companyFilter={companyFilter} setCompanyFilter={setCompanyFilter}
                        functionOptions={functionOptions} functionFilter={functionFilter} setFunctionFilter={setFunctionFilter}
                        filtered={filtered} selected={selected} toggle={toggle} atMax={selected.length >= MAX}
                    />
                    {hasData && (
                        <>
                            {saveTarget && (
                                <Button size="sm" variant="outline" className="gap-1.5 border-gold/40 text-gold hover:bg-gold/5" onClick={openSaveDialog}>
                                    <FileText className="h-3.5 w-3.5" /> Save to proposal
                                </Button>
                            )}
                            {!embedded && (
                                <>
                                    <Button size="sm" className="gap-1.5" style={{ backgroundColor: NAVY }} disabled={pptxLoading} onClick={exportPptx}>
                                        {pptxLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PPTX
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-1.5" onClick={printPdf}><Printer className="h-3.5 w-3.5" /> Print</Button>
                                    <Button size="sm" variant="outline" className="gap-1.5" onClick={exportHtml}><Download className="h-3.5 w-3.5" /> HTML</Button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-2">
                {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}

                {!loading && !hasData && (
                    <Card className="flex flex-col items-center gap-3 py-20 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold"><Users className="h-6 w-6" /></div>
                        <div className="text-base font-semibold" style={{ color: NAVY }}>No one on the card yet</div>
                        <p className="max-w-sm text-sm text-muted-foreground">Add up to {MAX} people and see who leads on pay, tenure, and performance — at a glance.</p>
                        <AddPeople
                            query={query} setQuery={setQuery}
                            companyOptions={companyOptions} companyFilter={companyFilter} setCompanyFilter={setCompanyFilter}
                            functionOptions={functionOptions} functionFilter={functionFilter} setFunctionFilter={setFunctionFilter}
                            filtered={filtered} selected={selected} toggle={toggle} atMax={selected.length >= MAX} primary
                        />
                    </Card>
                )}

                {!loading && hasData && (
                    <>
                        {/* The scoreboard matrix */}
                        <Card className="overflow-hidden p-0">
                            {/* toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5" style={{ backgroundColor: NAVY }}>
                                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Crown className="h-4 w-4 text-gold" /> Scoreboard
                                </span>
                                <span className="hidden text-[11px] text-white/50 sm:inline">Drag a card to reorder</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-0 text-sm">
                                    {/* Person headers */}
                                    <thead>
                                        <tr>
                                            <th style={STICKY_FIX} className="sticky left-0 top-0 z-30 w-[190px] min-w-[190px] border-b border-r bg-slate-50 px-4 py-3 text-left align-bottom text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                                Metric
                                            </th>
                                            {orderedDetails.map((d) => (
                                                <th
                                                    key={d.employee_id}
                                                    style={STICKY_FIX}
                                                    draggable
                                                    onDragStart={() => setDragId(d.employee_id)}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={() => { if (dragId != null) reorderColumns(dragId, d.employee_id); setDragId(null); }}
                                                    onDragEnd={() => setDragId(null)}
                                                    className={`sticky top-0 z-20 min-w-[190px] cursor-grab border-b px-3 py-3 text-center align-bottom active:cursor-grabbing ${d.employee_id < 0 ? "bg-gold/5" : "bg-white"} ${dragId === d.employee_id ? "opacity-40" : ""}`}
                                                >
                                                    <div className="relative flex flex-col items-center gap-1.5">
                                                        {d.employee_id !== lockedId && (
                                                            <button onClick={() => removeColumn(d.employee_id)} className="absolute -right-1 -top-1 text-slate-300 hover:text-red-500" title="Remove"><X className="h-3.5 w-3.5" /></button>
                                                        )}
                                                        <GripVertical className="absolute -left-1 -top-1 h-3.5 w-3.5 text-slate-200" />
                                                        <EmployeeAvatar name={d.name} photo={d.photo} size={46} />
                                                        <div className="leading-tight">
                                                            <div className="text-[13px] font-bold" style={{ color: NAVY }}>{d.name}</div>
                                                            <div className="text-[11px] text-muted-foreground">{d.position_title || "—"}</div>
                                                            <div className="text-[10px] text-slate-400">{[d.banner_name, d.country].filter(Boolean).join(" · ") || "—"}</div>
                                                        </div>
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {/* Hero: total comp */}
                                        <HeroRow label="Total compensation" details={orderedDetails} value={heroValue} max={heroMax} />

                                        {/* Employment */}
                                        <SectionRow title="Employment" span={orderedDetails.length + 1} />
                                        <TextRow label="Position" details={orderedDetails} render={(d) => d.position_title || "—"} />
                                        <TextRow label="Company" details={orderedDetails} render={(d) => d.banner_name || "—"} />
                                        <TextRow label="Country" details={orderedDetails} render={(d) => d.country || "—"} />
                                        <TextRow label="Job grade" details={orderedDetails} render={(d) => d.job_grade || "—"} />
                                        <TextRow label="Hire date" details={orderedDetails} render={(d) => formatDate(d.hire_date)} />
                                        <NumericRow label="Years of service" details={orderedDetails} get={(d) => yearsBetween(d.hire_date)} format={(d) => formatYears(d.hire_date)} />
                                        <TextRow label="Status" details={orderedDetails} render={(d) => d.status} />

                                        {/* Compensation & benefits */}
                                        <SectionRow title="Compensation & benefits" span={orderedDetails.length + 1} />
                                        {COMP_ROWS.map((r) => (
                                            <NumericRow key={r.label} label={r.label} details={orderedDetails} get={r.get} format={(d) => formatCurrency(r.get(d))} money />
                                        ))}
                                        <TextRow label={OTHER_BENEFIT_LABEL} details={orderedDetails} render={(d) => d.compensation?.allowance_family_cover || "—"} />

                                        {/* Performance */}
                                        <SectionRow title="Performance · last 5 years" span={orderedDetails.length + 1} />
                                        <tr>
                                            <td style={STICKY_FIX} className="sticky left-0 z-20 border-b border-r bg-slate-50 px-4 py-3 align-top text-slate-500">Grade trend</td>
                                            {orderedDetails.map((d) => (
                                                <td key={d.employee_id} className={`border-b px-3 py-3 align-top ${d.employee_id < 0 ? "bg-gold/5" : ""}`}>
                                                    <div className="flex items-end justify-center gap-1">
                                                        {FISCAL_YEARS.map((fy) => {
                                                            const g = d.performance.find((p) => p.fiscal_year === fy)?.grade;
                                                            return (
                                                                <div key={fy} className="flex flex-col items-center gap-1">
                                                                    <span className={`flex h-7 w-7 items-center justify-center rounded border text-[11px] font-bold ${g ? gradeColor(g) : "bg-slate-50 text-slate-300 border-slate-200"}`}>{g || "·"}</span>
                                                                    <span className="text-[9px] text-slate-400">'{String(fy).slice(2)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        {/* What-if scenario — every line item is editable, prefilled from the base person */}
                        <Card className="p-4">
                            <div className="mb-3 flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: NAVY }}>
                                    <span className="flex h-6 w-6 items-center justify-center rounded bg-gold/10 text-gold text-xs">?</span>
                                    What-if scenario
                                </div>
                                <select className="h-9 rounded-md border bg-background px-3 text-sm" value={simBase} onChange={(e) => pickScenarioBase(e.target.value ? Number(e.target.value) : "")}>
                                    <option value="">Pick person to model…</option>
                                    {details.map((d) => <option key={d.employee_id} value={d.employee_id}>{d.name}</option>)}
                                </select>
                                {simBase !== "" && (
                                    <>
                                        <span className="ml-auto text-xs text-muted-foreground" title="= Base Salary + STI Target + LTI Target + Other Bonus (allowances & benefits not included)">New total compensation ⓘ</span>
                                        <span className="text-lg font-extrabold tabular-nums" style={{ color: NAVY }}>{formatCurrency(scenarioTotal)}</span>
                                        <Button size="sm" className="h-9 gap-1.5" style={{ backgroundColor: NAVY }} onClick={addSimulation}><Plus className="h-3.5 w-3.5" /> Add scenario</Button>
                                    </>
                                )}
                            </div>
                            {simBase !== "" && (
                                <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                                    {COMP_ROWS.map((r) => {
                                        const base = scenarioFields.base_salary || 0;
                                        if (r.pct) {
                                            const amt = scenarioFields[r.key] ?? 0;
                                            const pctVal = base > 0 ? Math.round((amt / base) * 1000) / 10 : 0;
                                            return (
                                                <div key={r.key}>
                                                    <label className="mb-1 block truncate text-[10px] text-muted-foreground" title={r.label}>{r.label} (%)</label>
                                                    <Input
                                                        type="number"
                                                        className="h-9"
                                                        value={pctVal}
                                                        onChange={(e) => {
                                                            const pct = e.target.value === "" ? 0 : Number(e.target.value);
                                                            setScenarioField(r.key, String(Math.round((base * pct) / 100)));
                                                        }}
                                                    />
                                                    {base > 0 && <div className="mt-0.5 text-[9.5px] text-slate-400"> = €{amt.toLocaleString()}</div>}
                                                </div>
                                            );
                                        }
                                        return (
                                            <div key={r.key}>
                                                <label className="mb-1 block truncate text-[10px] text-muted-foreground" title={r.label}>{r.label} (€)</label>
                                                <Input
                                                    type="number"
                                                    className="h-9"
                                                    value={scenarioFields[r.key] ?? 0}
                                                    onChange={(e) => setScenarioField(r.key, e.target.value)}
                                                />
                                            </div>
                                        );
                                    })}
                                    <div>
                                        <label className="mb-1 block truncate text-[10px] text-muted-foreground" title={OTHER_BENEFIT_LABEL}>{OTHER_BENEFIT_LABEL}</label>
                                        <Input
                                            className="h-9"
                                            value={scenarioOtherBenefit}
                                            onChange={(e) => setScenarioOtherBenefit(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                            {simBase === "" && <p className="text-xs text-muted-foreground">Pick someone above to model a salary/comp change — every line item shows their current numbers and the total updates live as you edit.</p>}
                        </Card>
                    </>
                )}
            </div>

            {/* Save-to-proposal dialog (standalone page only) */}
            {saveTarget && (
                <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Save comparison to a proposal</DialogTitle></DialogHeader>
                        <p className="-mt-1 text-[12.5px] text-muted-foreground">
                            {boardIds.length} {boardIds.length === 1 ? "person" : "people"} on the board will be linked as the proposal's comparison set (any what-if scenarios are skipped).
                        </p>

                        {/* mode toggle */}
                        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-[13px] font-semibold">
                            <button
                                onClick={() => setSaveMode("existing")}
                                className={`flex-1 rounded-md py-1.5 transition-colors ${saveMode === "existing" ? "bg-white text-[#0b1f3a] shadow-sm" : "text-slate-500"}`}
                            >Existing proposal</button>
                            <button
                                onClick={() => setSaveMode("new")}
                                className={`flex-1 rounded-md py-1.5 transition-colors ${saveMode === "new" ? "bg-white text-[#0b1f3a] shadow-sm" : "text-slate-500"}`}
                            >New proposal</button>
                        </div>

                        {saveMode === "existing" ? (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Proposal</label>
                                {saveTarget.proposals.length === 0 ? (
                                    <p className="text-[12.5px] text-muted-foreground">No proposals yet — switch to “New proposal”.</p>
                                ) : (
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={existingProposalId} onChange={(e) => setExistingProposalId(e.target.value ? Number(e.target.value) : "")}>
                                        {saveTarget.proposals.map((p) => <option key={p.proposal_id} value={p.proposal_id}>{p.employee_name}</option>)}
                                    </select>
                                )}
                                <p className="mt-1.5 text-[11px] text-amber-600">Replaces the proposal's current comparison set.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Employee (proposal subject)</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value ? Number(e.target.value) : "")}>
                                        <option value="">— select —</option>
                                        {employees.map((e) => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">New position (optional)</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={newPositionId} onChange={(e) => setNewPositionId(e.target.value ? Number(e.target.value) : "")}>
                                        <option value="">— fill in later —</option>
                                        {saveTarget.positions.map((p) => <option key={p.position_id} value={p.position_id}>{p.title}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
                            <Button onClick={confirmSaveToProposal} disabled={savingProposal} className="gap-1.5" style={{ backgroundColor: NAVY }}>
                                {savingProposal && <Loader2 className="h-4 w-4 animate-spin" />}
                                {saveMode === "existing" ? "Attach" : "Create proposal"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
});

// ── Add-people searchable popover (replaces the 48-chip cloud) ─────────────
// Each usage owns its own `open` state — two Popovers sharing one boolean was
// the bug that made "Add people" appear dead (both instances fought over the
// same controlled state and neither ever rendered open).
function AddPeople({
    query, setQuery, companyOptions, companyFilter, setCompanyFilter, functionOptions, functionFilter, setFunctionFilter,
    filtered, selected, toggle, atMax, primary,
}: {
    query: string; setQuery: (v: string) => void;
    companyOptions: string[]; companyFilter: string[]; setCompanyFilter: (v: string[]) => void;
    functionOptions: string[]; functionFilter: string[]; setFunctionFilter: (v: string[]) => void;
    filtered: EmployeeListItem[]; selected: number[]; toggle: (id: number) => void; atMax: boolean; primary?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const activeFilters = companyFilter.length + functionFilter.length;

    function toggleCompany(v: string) {
        setCompanyFilter(companyFilter.includes(v) ? companyFilter.filter((x) => x !== v) : [...companyFilter, v]);
    }
    function toggleFunction(v: string) {
        setFunctionFilter(functionFilter.includes(v) ? functionFilter.filter((x) => x !== v) : [...functionFilter, v]);
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button size="sm" variant={primary ? "default" : "outline"} className="gap-1.5" style={primary ? { backgroundColor: NAVY } : undefined}>
                    <UserPlus className="h-3.5 w-3.5" /> Add people <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
                    <FilterMultiSelect label="Company" options={companyOptions} selected={companyFilter} onChange={toggleCompany} />
                    <FilterMultiSelect label="Function" options={functionOptions} selected={functionFilter} onChange={toggleFunction} />
                    {activeFilters > 0 && (
                        <button onClick={() => { setCompanyFilter([]); setFunctionFilter([]); }} className="ml-auto text-[11px] text-slate-400 hover:text-red-500">
                            Clear
                        </button>
                    )}
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                    {filtered.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</div>}
                    {filtered.map((e) => {
                        const on = selected.includes(e.employee_id);
                        const disabled = !on && atMax;
                        return (
                            <button
                                key={e.employee_id}
                                onClick={() => toggle(e.employee_id)}
                                disabled={disabled}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${on ? "bg-slate-50" : disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-50"}`}
                            >
                                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? "border-transparent bg-gold text-white" : "border-slate-300"}`}>
                                    {on && <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2 6l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                </span>
                                <EmployeeAvatar name={e.name} photo={e.photo} size={22} />
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="text-[10px] text-slate-400">{e.position_title}</span>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ── Rows ───────────────────────────────────────────────────────────────────
function stickyLabel(extra = "") {
    return `sticky left-0 z-20 border-b border-r bg-slate-50 px-4 py-2 text-slate-500 ${extra}`;
}

function HeroRow({ label, details, value, max }: { label: string; details: EmployeeDetail[]; value: (d: EmployeeDetail) => number; max: number }) {
    const best = Math.max(...details.map(value));
    return (
        <tr>
            <td style={STICKY_FIX} className={stickyLabel("align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-400")}>{label}</td>
            {details.map((d) => {
                const v = value(d);
                const isLeader = v > 0 && v === best;
                return (
                    <td key={d.employee_id} className={`relative border-b px-3 py-3 text-center align-middle ${d.employee_id < 0 ? "bg-gold/5" : ""}`}>
                        <div className="flex items-center justify-center gap-1">
                            {isLeader && <Crown className="h-3.5 w-3.5 text-gold" />}
                            <Money value={v} className={`text-[19px] font-extrabold tabular-nums ${isLeader ? "text-gold" : "text-[#0b1f3a]"}`} />
                        </div>
                        <div className="mx-auto mt-1.5 h-1.5 w-4/5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (v / max) * 100)}%`, backgroundColor: isLeader ? "#A16207" : "#3b6ea5" }} />
                        </div>
                    </td>
                );
            })}
        </tr>
    );
}

function NumericRow({ label, details, get, format, money }: { label: string; details: EmployeeDetail[]; get: (d: EmployeeDetail) => number | null; format: (d: EmployeeDetail) => string; money?: boolean }) {
    const vals = details.map((d) => get(d) ?? 0);
    const max = Math.max(1, ...vals);
    const best = Math.max(...vals);
    const distinct = new Set(vals).size > 1;
    return (
        <tr>
            <td style={STICKY_FIX} className={stickyLabel()}>{label}</td>
            {details.map((d) => {
                const v = get(d) ?? 0;
                const isLeader = distinct && v > 0 && v === best;
                return (
                    <td key={d.employee_id} className={`relative border-b px-3 py-2 align-middle ${d.employee_id < 0 ? "bg-gold/5" : ""}`}>
                        {/* magnitude bar behind the figure */}
                        <div className="absolute inset-y-1 left-2 right-2 -z-0 overflow-hidden rounded bg-slate-50">
                            <div className="h-full" style={{ width: `${(v / max) * 100}%`, backgroundColor: isLeader ? "rgba(161,98,7,0.14)" : "rgba(59,110,165,0.10)" }} />
                        </div>
                        <div className="relative z-10 flex items-center justify-end gap-1">
                            {isLeader && <Crown className="h-3 w-3 text-gold" />}
                            {money
                                ? <Money value={get(d)} className={`tabular-nums ${isLeader ? "font-bold text-gold" : "text-slate-800"}`} />
                                : <span className={`tabular-nums ${isLeader ? "font-bold text-gold" : "text-slate-800"}`}>{format(d)}</span>}
                        </div>
                    </td>
                );
            })}
        </tr>
    );
}

function TextRow({ label, details, render }: { label: string; details: EmployeeDetail[]; render: (d: EmployeeDetail) => string }) {
    return (
        <tr>
            <td style={STICKY_FIX} className={stickyLabel()}>{label}</td>
            {details.map((d) => (
                <td key={d.employee_id} className={`border-b px-3 py-2 text-center align-middle text-slate-700 ${d.employee_id < 0 ? "bg-gold/5" : ""}`}>{render(d)}</td>
            ))}
        </tr>
    );
}

function SectionRow({ title, span }: { title: string; span: number }) {
    return (
        <tr>
            <td style={STICKY_FIX} colSpan={span} className="sticky left-0 z-20 border-b border-t bg-slate-100/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</td>
        </tr>
    );
}

