"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalyzedCsvRow, CommitCsvRow } from "@/app/actions/employee-crud";
import { commitEmployeesCsv } from "@/app/actions/employee-crud";
import { createCompanyOffice } from "@/app/actions/org";
import { createPosition } from "@/app/actions/positions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { COUNTRIES } from "@/lib/countries";
import { ChevronDown, ChevronRight, Check, X, Plus, Loader2, AlertTriangle, Users2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FunctionOpt { function_id: number; name: string }

// Per-row working state, layered on top of the read-only analysis from
// analyzeEmployeesCsv — decision is what actually gets committed, officeId/
// positionId start at whatever phase 1 resolved and get overwritten if the
// user quick-adds a missing office/position right here in review.
interface RowState {
    decision: "import" | "skip";
    officeId: number | null;
    positionId: number | null;
    bannerId: number | null;
}

function initialDecision(row: AnalyzedCsvRow): RowState["decision"] {
    if (row.invalidReason) return "skip";
    if (row.duplicate) return "skip"; // safer default — user has to actively confirm a likely-duplicate
    if (row.needsOffice || row.needsPosition) return "skip"; // can't import until resolved anyway
    return "import";
}

export function ImportReviewDialog({ open, onOpenChange, rows, functions, onCommitted }: {
    open: boolean; onOpenChange: (open: boolean) => void; rows: AnalyzedCsvRow[]; functions: FunctionOpt[];
    onCommitted: () => void;
}) {
    const router = useRouter();
    const [committing, setCommitting] = useState(false);
    const [readyExpanded, setReadyExpanded] = useState(false);
    const [state, setState] = useState<Map<number, RowState>>(() => new Map(rows.map((r) => [r.rowNo, {
        decision: initialDecision(r), officeId: r.resolvedOfficeId, positionId: r.resolvedPositionId, bannerId: r.resolvedBannerId,
    }])));

    const invalid = rows.filter((r) => r.invalidReason);
    const duplicates = rows.filter((r) => !r.invalidReason && r.duplicate);
    const needsResolution = rows.filter((r) => !r.invalidReason && !r.duplicate && (r.needsOffice || r.needsPosition));
    const ready = rows.filter((r) => !r.invalidReason && !r.duplicate && !r.needsOffice && !r.needsPosition);

    const importCount = useMemo(() => [...state.values()].filter((s) => s.decision === "import").length, [state]);

    function setDecision(rowNo: number, decision: RowState["decision"]) {
        setState((prev) => new Map(prev).set(rowNo, { ...prev.get(rowNo)!, decision }));
    }
    function setResolved(rowNo: number, patch: Partial<Pick<RowState, "officeId" | "positionId" | "bannerId">>) {
        setState((prev) => {
            const next = new Map(prev);
            const cur = next.get(rowNo)!;
            const merged = { ...cur, ...patch };
            // A row that just got its missing piece(s) resolved flips to "import"
            // automatically — the whole point of resolving it was to include it.
            const row = rows.find((r) => r.rowNo === rowNo)!;
            const officeOk = !row.needsOffice || merged.officeId != null;
            const positionOk = !row.needsPosition || merged.positionId != null;
            if (officeOk && positionOk && merged.decision === "skip") merged.decision = "import";
            next.set(rowNo, merged);
            return next;
        });
    }

    async function commit() {
        const toCommit: CommitCsvRow[] = rows
            .filter((r) => state.get(r.rowNo)!.decision === "import")
            .map((r) => {
                const s = state.get(r.rowNo)!;
                return {
                    name: r.name, office_id: s.officeId, position_id: s.positionId, status: r.status,
                    date_of_birth: r.date_of_birth || null, hire_date: r.hire_date || null,
                    position_effective_date: r.position_effective_date || null, readiness_potential: r.readiness_potential || null,
                };
            });
        if (toCommit.length === 0) { toast.error("Nothing selected to import"); return; }
        setCommitting(true);
        const res = await commitEmployeesCsv(toCommit);
        setCommitting(false);
        if (res.ok) {
            toast.success(`${res.inserted} employee${res.inserted === 1 ? "" : "s"} imported`);
            router.refresh();
            onCommitted();
        } else {
            toast.error(res.errors[0]?.message || "Import failed");
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Review import</DialogTitle></DialogHeader>
                <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1 text-[12.5px]">
                    {duplicates.length > 0 && (
                        <Section title="Possible duplicates" count={duplicates.length} tone="amber" icon={<Users2 className="h-3.5 w-3.5" />}>
                            <p className="mb-2 text-slate-400">Name closely matches someone already in the system — confirm before importing as a new person.</p>
                            {duplicates.map((r) => (
                                <DuplicateRow key={r.rowNo} row={r} decision={state.get(r.rowNo)!.decision} onDecide={(d) => setDecision(r.rowNo, d)} />
                            ))}
                        </Section>
                    )}
                    {needsResolution.length > 0 && (
                        <Section title="Needs resolution" count={needsResolution.length} tone="red" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                            <p className="mb-2 text-slate-400">Company/Country or Position isn't in the master data yet — add it inline or skip the row.</p>
                            {needsResolution.map((r) => (
                                <ResolveRow
                                    key={r.rowNo} row={r} functions={functions}
                                    rowState={state.get(r.rowNo)!}
                                    onResolved={(patch) => setResolved(r.rowNo, patch)}
                                    onDecide={(d) => setDecision(r.rowNo, d)}
                                />
                            ))}
                        </Section>
                    )}
                    {ready.length > 0 && (
                        <div className="rounded-lg border">
                            <button onClick={() => setReadyExpanded((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium text-emerald-700">
                                {readyExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                <Check className="h-3.5 w-3.5" /> {ready.length} ready to import — no changes needed
                            </button>
                            {readyExpanded && (
                                <div className="max-h-40 overflow-y-auto border-t divide-y divide-slate-100">
                                    {ready.map((r) => (
                                        <div key={r.rowNo} className="px-3 py-1.5 text-slate-500">{r.name} — {r.posTitle || "—"} · {r.companyName || "—"}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {invalid.length > 0 && (
                        <Section title="Couldn't import" count={invalid.length} tone="slate" icon={<X className="h-3.5 w-3.5" />}>
                            <p className="mb-1 text-slate-400">Fix these in the CSV and re-upload — nothing here can be resolved in this screen.</p>
                            <div className="divide-y divide-slate-100 rounded-lg border">
                                {invalid.map((r) => (
                                    <div key={r.rowNo} className="px-3 py-1.5 text-slate-500">Row {r.rowNo}: {r.invalidReason}</div>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
                <DialogFooter className="flex items-center justify-between sm:justify-between">
                    <span className="text-[12px] text-slate-400">{importCount} of {rows.length} rows will be imported</span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>Cancel</Button>
                        <Button onClick={commit} disabled={committing || importCount === 0} className="gap-1.5">
                            {committing && <Loader2 className="h-4 w-4 animate-spin" />} Import {importCount} employee{importCount === 1 ? "" : "s"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Section({ title, count, tone, icon, children }: { title: string; count: number; tone: "amber" | "red" | "slate"; icon: React.ReactNode; children: React.ReactNode }) {
    const toneCls = tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-slate-500";
    return (
        <div>
            <div className={cn("mb-1.5 flex items-center gap-1.5 font-semibold", toneCls)}>{icon} {title} ({count})</div>
            {children}
        </div>
    );
}

function DuplicateRow({ row, decision, onDecide }: { row: AnalyzedCsvRow; decision: RowState["decision"]; onDecide: (d: RowState["decision"]) => void }) {
    const d = row.duplicate!;
    return (
        <div className="mb-1.5 rounded-lg border p-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="font-medium text-[#0f172a]">{row.name} <span className="text-slate-400">(row {row.rowNo})</span></div>
                    <div className="text-[11px] text-slate-400">Matches: {d.name} · {d.positionTitle || "—"} · {d.bannerName || "—"} ({Math.round(d.score * 100)}% match)</div>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant={decision === "skip" ? "default" : "outline"} className="h-7 text-xs" onClick={() => onDecide("skip")}>Skip</Button>
                    <Button size="sm" variant={decision === "import" ? "default" : "outline"} className="h-7 text-xs" onClick={() => onDecide("import")}>Import anyway</Button>
                </div>
            </div>
        </div>
    );
}

function ResolveRow({ row, functions, rowState, onResolved, onDecide }: {
    row: AnalyzedCsvRow; functions: FunctionOpt[]; rowState: RowState;
    onResolved: (patch: Partial<Pick<RowState, "officeId" | "positionId" | "bannerId">>) => void;
    onDecide: (d: RowState["decision"]) => void;
}) {
    const [addingOffice, setAddingOffice] = useState(false);
    const [officeDraft, setOfficeDraft] = useState({ banner_name: row.companyName, country: row.countryName, city: "" });
    const [savingOffice, setSavingOffice] = useState(false);

    const [addingPosition, setAddingPosition] = useState(false);
    const [positionDraft, setPositionDraft] = useState({ title: row.posTitle, function_id: "" });
    const [savingPosition, setSavingPosition] = useState(false);

    const officeResolved = !row.needsOffice || rowState.officeId != null;
    const positionResolved = !row.needsPosition || rowState.positionId != null;
    const resolved = officeResolved && positionResolved;

    async function submitOffice() {
        if (!officeDraft.banner_name.trim() || !officeDraft.country.trim()) { toast.error("Company and country are required"); return; }
        setSavingOffice(true);
        const res = await createCompanyOffice({ banner_name: officeDraft.banner_name, country: officeDraft.country, city: officeDraft.city || null });
        setSavingOffice(false);
        if (!res.ok || !res.office) { toast.error(res.error || "Could not add office"); return; }
        onResolved({ officeId: res.office.office_id, bannerId: res.office.banner_id });
        setAddingOffice(false);
        toast.success(`${res.office.banner_name} — ${res.office.country} added`);
    }
    async function submitPosition() {
        if (!positionDraft.title.trim()) { toast.error("Position title is required"); return; }
        if (!rowState.bannerId) { toast.error("Add the company/office first — positions belong to a company"); return; }
        setSavingPosition(true);
        const res = await createPosition({
            title: positionDraft.title.trim(), banner_id: rowState.bannerId, function_id: positionDraft.function_id ? Number(positionDraft.function_id) : null,
            req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5,
        });
        setSavingPosition(false);
        if (!res.ok || !res.id) { toast.error(res.error || "Could not add position"); return; }
        onResolved({ positionId: res.id });
        setAddingPosition(false);
        toast.success(`"${positionDraft.title.trim()}" added`);
    }

    return (
        <div className="mb-1.5 rounded-lg border p-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-medium text-[#0f172a]">{row.name} <span className="text-slate-400 font-normal">(row {row.rowNo})</span></div>
                <div className="flex shrink-0 items-center gap-1">
                    {resolved
                        ? <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> Ready</span>
                        : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDecide("skip")}>Skip</Button>}
                </div>
            </div>

            {row.needsOffice && !officeResolved && (
                <div className="mt-2 rounded-md border border-dashed p-2">
                    <div className="mb-1 text-[11px] text-slate-400">"{row.companyName}" has no office in "{row.countryName}"</div>
                    {addingOffice ? (
                        <div className="flex flex-wrap items-end gap-1.5">
                            <Combobox options={[]} value={officeDraft.banner_name || null} onChange={(v) => setOfficeDraft({ ...officeDraft, banner_name: v || "" })} placeholder="Company" className="h-8 w-36 text-xs" />
                            <Combobox options={COUNTRIES} value={officeDraft.country || null} onChange={(v) => setOfficeDraft({ ...officeDraft, country: v || "" })} placeholder="Country" className="h-8 w-36 text-xs" />
                            <Input className="h-8 w-28 text-xs" value={officeDraft.city} onChange={(e) => setOfficeDraft({ ...officeDraft, city: e.target.value })} placeholder="City (optional)" />
                            <Button size="sm" className="h-8 gap-1 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={savingOffice} onClick={submitOffice}>
                                {savingOffice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                            </Button>
                        </div>
                    ) : (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setAddingOffice(true)}><Plus className="h-3 w-3" /> Add office</Button>
                    )}
                </div>
            )}

            {row.needsPosition && !positionResolved && (
                <div className="mt-2 rounded-md border border-dashed p-2">
                    <div className="mb-1 text-[11px] text-slate-400">
                        Position "{row.posTitle}" not found in master
                        {!rowState.bannerId && " — add the company/office above first"}
                    </div>
                    {addingPosition ? (
                        <div className="flex flex-wrap items-end gap-1.5">
                            <Input className="h-8 w-40 text-xs" value={positionDraft.title} onChange={(e) => setPositionDraft({ ...positionDraft, title: e.target.value })} placeholder="Position title" />
                            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={positionDraft.function_id} onChange={(e) => setPositionDraft({ ...positionDraft, function_id: e.target.value })}>
                                <option value="">— function (optional) —</option>
                                {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                            </select>
                            <Button size="sm" className="h-8 gap-1 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={savingPosition} onClick={submitPosition}>
                                {savingPosition ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                            </Button>
                        </div>
                    ) : (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!rowState.bannerId} onClick={() => setAddingPosition(true)}><Plus className="h-3 w-3" /> Add position</Button>
                    )}
                </div>
            )}
        </div>
    );
}
