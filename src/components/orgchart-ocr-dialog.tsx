"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AnalyzedOcrNode, CommitOcrNode, ExtractedOrgEdge, ExtractedOrgNode } from "@/app/actions/orgchart-ocr";
import { extractOrgChart, analyzeOrgChartNodes, commitOrgChart } from "@/app/actions/orgchart-ocr";
import { createCompanyOffice } from "@/app/actions/org";
import { createPosition } from "@/app/actions/positions";
import { nameSimilarity } from "@/lib/fuzzy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, FileUp, Loader2, Check, X, AlertTriangle, UserPlus, HelpCircle, Plus, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
interface FunctionOpt { function_id: number; name: string }
interface PositionOpt { position_id: number; title: string; banner_id: number | null }
interface BannerOpt { banner_id: number; name: string }

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

type Stage = "context" | "upload" | "extracting" | "review" | "error";

interface NewNodeResolution { officeId: number | null; positionId: number | null }

export function OrgChartOcrDialog({ open, onOpenChange, offices, positions, functions, banners }: {
    open: boolean; onOpenChange: (open: boolean) => void; offices: OfficeOpt[]; positions: PositionOpt[]; functions: FunctionOpt[]; banners: BannerOpt[];
}) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [stage, setStage] = useState<Stage>("context");
    const [fileName, setFileName] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [analyzed, setAnalyzed] = useState<AnalyzedOcrNode[]>([]);
    const [decisions, setDecisions] = useState<Map<string, "create" | "skip">>(new Map());
    const [resolutions, setResolutions] = useState<Map<string, NewNodeResolution>>(new Map());
    const [committing, setCommitting] = useState(false);
    const [matchedExpanded, setMatchedExpanded] = useState(false);
    // A chart is always exactly one company (banner) — pick it (and
    // optionally the function) up front so every "new" person on the chart
    // auto-resolves to the right company instead of relying on Gemini's
    // per-node banner_text guess. Cross-company/cross-country linking is a
    // separate, manually-maintained concern (Head of Function), not
    // something this upload needs to solve.
    const [selectedBannerId, setSelectedBannerId] = useState("");
    const [selectedFunctionId, setSelectedFunctionId] = useState("");
    // Local, mutable copies — a quick-add inside this dialog (office or
    // position) needs to show up in every row's dropdown immediately, not
    // just the row that created it, without waiting on a page reload.
    // Seeded (once context is confirmed) to just the selected banner's own
    // offices/positions, since that's the only company this chart can add to.
    const [localOffices, setLocalOffices] = useState<OfficeOpt[]>([]);
    const [localPositions, setLocalPositions] = useState<PositionOpt[]>([]);
    // Bulk-resolve: a chart with a few dozen unrecognized people is common
    // (a whole new company's chart), and they're very often all the same
    // office — resolving one row, quick-adding if needed, then applying it
    // to every checked row beats clicking through each one.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkOfficeId, setBulkOfficeId] = useState("");
    const [bulkPositionId, setBulkPositionId] = useState("");

    const selectedBanner = banners.find((b) => String(b.banner_id) === selectedBannerId) ?? null;

    function reset() {
        setStage("context"); setFileName(null); setAnalyzed([]); setPendingFile(null); setErrorMessage(null);
        setDecisions(new Map()); setResolutions(new Map());
        setSelectedBannerId(""); setSelectedFunctionId("");
        setLocalOffices([]); setLocalPositions([]);
        setSelectedIds(new Set()); setBulkOfficeId(""); setBulkPositionId("");
    }

    function confirmContext() {
        if (!selectedBannerId) { toast.error("Pick which company this chart is for"); return; }
        const bannerId = Number(selectedBannerId);
        setLocalOffices(offices.filter((o) => o.banner_id === bannerId));
        setLocalPositions(positions.filter((p) => p.banner_id === bannerId));
        setStage("upload");
    }

    async function handleFile(file: File) {
        if (file.size > MAX_FILE_SIZE) { toast.error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`); return; }
        setFileName(file.name);
        setPendingFile(file);
        setStage("extracting");
        const base64 = await fileToBase64(file);
        const extracted = await extractOrgChart(base64, file.type || "application/pdf");
        if (!extracted.ok) {
            // Gemini extraction isn't 100% reliable request-to-request — keep the
            // already-read file so retrying doesn't make the user re-pick it.
            setErrorMessage(extracted.error);
            setStage("error");
            return;
        }
        const rows = await analyzeOrgChartNodes(extracted.nodes, extracted.edges, Number(selectedBannerId));
        setAnalyzed(rows);
        const initDecisions = new Map<string, "create" | "skip">();
        const initResolutions = new Map<string, NewNodeResolution>();
        rows.forEach((r) => {
            if (r.bucket === "new") {
                // The company's already fixed by context, so a single-office
                // company can be auto-resolved outright; multi-office (multi-
                // country) companies still need the country picked per row,
                // but from a short list scoped to just this one company now.
                const officeId = localOffices.length === 1 ? localOffices[0].office_id : null;
                const positionId = r.resolvedPositionId ?? null;
                initDecisions.set(r.localId, officeId != null && positionId != null ? "create" : "skip");
                initResolutions.set(r.localId, { officeId, positionId });
            }
        });
        setDecisions(initDecisions);
        setResolutions(initResolutions);
        setSelectedIds(new Set(rows.filter((r) => r.bucket === "new").map((r) => r.localId)));
        setStage("review");
    }

    function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) handleFile(file);
    }

    const matched = analyzed.filter((r) => r.bucket === "matched");
    const needsReview = analyzed.filter((r) => r.bucket === "needs_review");
    const newNodes = analyzed.filter((r) => r.bucket === "new");
    const unreadable = analyzed.filter((r) => r.bucket === "unreadable");

    const createCount = useMemo(() => [...decisions.values()].filter((d) => d === "create").length, [decisions]);

    function setResolved(localId: string, patch: Partial<NewNodeResolution>) {
        setResolutions((prev) => {
            const next = new Map(prev);
            const merged = { ...next.get(localId)!, ...patch };
            next.set(localId, merged);
            if (merged.officeId != null && merged.positionId != null) {
                setDecisions((d) => new Map(d).set(localId, "create"));
            }
            return next;
        });
    }

    function applyBulkOffice() {
        if (!bulkOfficeId) return;
        const officeId = Number(bulkOfficeId);
        setResolutions((prev) => {
            const next = new Map(prev);
            selectedIds.forEach((id) => { const cur = next.get(id); if (cur) next.set(id, { ...cur, officeId }); });
            return next;
        });
        setDecisions((prev) => {
            const next = new Map(prev);
            selectedIds.forEach((id) => { if (resolutions.get(id)?.positionId != null) next.set(id, "create"); });
            return next;
        });
        toast.success(`Office applied to ${selectedIds.size} selected`);
    }
    function applyBulkPosition() {
        if (!bulkPositionId) return;
        const positionId = Number(bulkPositionId);
        setResolutions((prev) => {
            const next = new Map(prev);
            selectedIds.forEach((id) => { const cur = next.get(id); if (cur) next.set(id, { ...cur, positionId }); });
            return next;
        });
        setDecisions((prev) => {
            const next = new Map(prev);
            selectedIds.forEach((id) => { if (resolutions.get(id)?.officeId != null) next.set(id, "create"); });
            return next;
        });
        toast.success(`Position applied to ${selectedIds.size} selected`);
    }
    function toggleSelected(localId: string, checked: boolean) {
        setSelectedIds((prev) => { const next = new Set(prev); if (checked) next.add(localId); else next.delete(localId); return next; });
    }

    async function commit() {
        const toCommit: CommitOcrNode[] = [];
        for (const r of analyzed) {
            if (r.bucket === "matched" || r.bucket === "needs_review") {
                toCommit.push({ localId: r.localId, action: "link_only", employeeId: r.matchedEmployeeId, name: r.name, office_id: null, position_id: null, status: "Active", parentLocalId: r.parentLocalId });
            } else if (r.bucket === "new" && decisions.get(r.localId) === "create") {
                const res = resolutions.get(r.localId)!;
                toCommit.push({ localId: r.localId, action: "create", employeeId: null, name: r.name, office_id: res.officeId, position_id: res.positionId, status: "Active", parentLocalId: r.parentLocalId });
            }
        }
        if (createCount === 0) { toast.error("Nothing selected to import"); return; }
        setCommitting(true);
        const res = await commitOrgChart(toCommit);
        setCommitting(false);
        if (res.ok) {
            toast.success(`${res.created} employee${res.created === 1 ? "" : "s"} added from chart`);
            router.refresh();
            onOpenChange(false);
            reset();
        } else {
            toast.error(res.error || "Import failed");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Upload org chart (OCR)</DialogTitle></DialogHeader>

                {stage === "context" && (
                    <div className="space-y-4">
                        <p className="text-[12.5px] text-muted-foreground">A chart is always one company — pick it first so every new person on the chart resolves to the right company automatically.</p>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Company *</label>
                            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedBannerId} onChange={(e) => setSelectedBannerId(e.target.value)}>
                                <option value="">— select —</option>
                                {banners.map((b) => <option key={b.banner_id} value={b.banner_id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Function (optional)</label>
                            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={selectedFunctionId} onChange={(e) => setSelectedFunctionId(e.target.value)}>
                                <option value="">— none —</option>
                                {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-400">Used as the default when a new position needs creating from this chart.</p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button onClick={confirmContext} disabled={!selectedBannerId}>Continue</Button>
                        </DialogFooter>
                    </div>
                )}

                {stage === "upload" && (
                    <div className="space-y-3">
                        <p className="text-[12.5px] text-muted-foreground">Upload a PDF or image org chart for <strong>{selectedBanner?.name}</strong>. Gemini reads it into people + reporting lines, matches names against existing employees, and nothing is added until you review and confirm below.</p>
                        <label
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-6 text-[12.5px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                            <FileUp className="h-5 w-5 shrink-0" /> Drag &amp; drop, or click to choose a PDF or image (max {MAX_FILE_SIZE / 1024 / 1024}MB)
                            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onFileInput} />
                        </label>
                        <button type="button" onClick={() => setStage("context")} className="text-[11px] font-medium text-slate-400 hover:text-[#0b1f3a]">‹ Change company</button>
                    </div>
                )}

                {stage === "extracting" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <div className="text-[12.5px]">Reading {fileName}…</div>
                    </div>
                )}

                {stage === "error" && (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                        <AlertTriangle className="h-6 w-6 text-amber-500" />
                        <div className="max-w-sm text-[12.5px] text-slate-500">{errorMessage}</div>
                        <p className="max-w-sm text-[11px] text-slate-400">Gemini doesn't always succeed on the first try with a large file — retrying the same file often works.</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setStage("upload"); setPendingFile(null); setErrorMessage(null); }}>Choose a different file</Button>
                            <Button size="sm" onClick={() => pendingFile && handleFile(pendingFile)}>Try again</Button>
                        </div>
                    </div>
                )}

                {stage === "review" && (
                    <>
                        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-[12.5px]">
                            {newNodes.length > 0 && (
                                <Section title="New people" count={newNodes.length} tone="emerald" icon={<UserPlus className="h-3.5 w-3.5" />}>
                                    <p className="mb-2 text-slate-400">Not found in the system — resolve Company/Office and Position to import. Often a whole new chart is the same company: resolve one row (quick-add if needed), then apply it to the rest below.</p>

                                    {newNodes.length > 1 && (
                                        <div className="mb-2 space-y-1.5 rounded-lg border border-dashed bg-slate-50 p-2.5">
                                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.size === newNodes.length}
                                                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(newNodes.map((r) => r.localId)) : new Set())}
                                                />
                                                {selectedIds.size} of {newNodes.length} selected
                                            </label>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <select className="h-7 min-w-[160px] rounded-md border bg-background px-2 text-xs" value={bulkOfficeId} onChange={(e) => setBulkOfficeId(e.target.value)}>
                                                    <option value="">Apply Country office —</option>
                                                    {localOffices.map((o) => <option key={o.office_id} value={o.office_id}>{o.country}</option>)}
                                                </select>
                                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkOfficeId || selectedIds.size === 0} onClick={applyBulkOffice}>Apply to {selectedIds.size}</Button>
                                                <select className="h-7 min-w-[160px] rounded-md border bg-background px-2 text-xs" value={bulkPositionId} onChange={(e) => setBulkPositionId(e.target.value)}>
                                                    <option value="">Apply Position —</option>
                                                    {localPositions.map((p) => <option key={p.position_id} value={p.position_id}>{p.title}</option>)}
                                                </select>
                                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkPositionId || selectedIds.size === 0} onClick={applyBulkPosition}>Apply to {selectedIds.size}</Button>
                                            </div>
                                        </div>
                                    )}

                                    {newNodes.map((r) => (
                                        <div key={r.localId} className="flex items-start gap-2">
                                            {newNodes.length > 1 && (
                                                <input
                                                    type="checkbox" className="mt-4 shrink-0"
                                                    checked={selectedIds.has(r.localId)}
                                                    onChange={(e) => toggleSelected(r.localId, e.target.checked)}
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <NewNodeRow
                                                    row={r} offices={localOffices} positions={localPositions} functions={functions}
                                                    bannerId={Number(selectedBannerId)} bannerName={selectedBanner?.name || ""} defaultFunctionId={selectedFunctionId}
                                                    resolution={resolutions.get(r.localId)!} decision={decisions.get(r.localId)!}
                                                    onResolved={(patch) => setResolved(r.localId, patch)}
                                                    onDecide={(d) => setDecisions((prev) => new Map(prev).set(r.localId, d))}
                                                    onOfficeCreated={(o) => setLocalOffices((prev) => [...prev, o])}
                                                    onPositionCreated={(p) => setLocalPositions((prev) => [...prev, p])}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </Section>
                            )}
                            {needsReview.length > 0 && (
                                <Section title="Needs review" count={needsReview.length} tone="amber" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                                    <p className="mb-2 text-slate-400">Name matches someone already in the system, but the chart shows a different company or title — go update their profile if the chart is right.</p>
                                    {needsReview.map((r) => (
                                        <div key={r.localId} className="mb-1.5 rounded-lg border p-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-[#0f172a]">{r.name}</div>
                                                    <div className="text-[11px] text-slate-400">
                                                        Chart: {r.position_title || "—"} · {r.banner_text || "—"} &nbsp;|&nbsp; System: {r.matchedPosition || "—"} · {r.matchedBanner || "—"}
                                                    </div>
                                                </div>
                                                <Link href={`/employees/${r.matchedEmployeeId}`} target="_blank" className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#0b1f3a] hover:underline">
                                                    Open profile <ExternalLink className="h-3 w-3" />
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </Section>
                            )}
                            {unreadable.length > 0 && (
                                <Section title="Couldn't read" count={unreadable.length} tone="slate" icon={<HelpCircle className="h-3.5 w-3.5" />}>
                                    <p className="mb-1 text-slate-400">Low confidence or illegible — not imported.</p>
                                    <div className="divide-y divide-slate-100 rounded-lg border">
                                        {unreadable.map((r) => (
                                            <div key={r.localId} className="px-3 py-1.5 text-slate-500">{r.name || "(blank)"} — {r.position_title || "—"}</div>
                                        ))}
                                    </div>
                                </Section>
                            )}
                            {matched.length > 0 && (
                                <div className="rounded-lg border">
                                    <button onClick={() => setMatchedExpanded((v) => !v)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium text-emerald-700">
                                        {matchedExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <Check className="h-3.5 w-3.5" /> {matched.length} already match — no changes
                                    </button>
                                    {matchedExpanded && (
                                        <div className="max-h-40 overflow-y-auto border-t divide-y divide-slate-100">
                                            {matched.map((r) => <div key={r.localId} className="px-3 py-1.5 text-slate-500">{r.name} — {r.matchedPosition || "—"} · {r.matchedBanner || "—"}</div>)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <DialogFooter className="flex items-center justify-between sm:justify-between">
                            <span className="text-[12px] text-slate-400">{createCount} new employee{createCount === 1 ? "" : "s"} will be added</span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>Cancel</Button>
                                <Button onClick={commit} disabled={committing || createCount === 0} className="gap-1.5">
                                    {committing && <Loader2 className="h-4 w-4 animate-spin" />} Add {createCount} employee{createCount === 1 ? "" : "s"}
                                </Button>
                            </div>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function Section({ title, count, tone, icon, children }: { title: string; count: number; tone: "emerald" | "amber" | "slate"; icon: React.ReactNode; children: React.ReactNode }) {
    const toneCls = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-500";
    return (
        <div>
            <div className={cn("mb-1.5 flex items-center gap-1.5 font-semibold", toneCls)}>{icon} {title} ({count})</div>
            {children}
        </div>
    );
}

function NewNodeRow({ row, offices, positions, functions, bannerId, bannerName, defaultFunctionId, resolution, decision, onResolved, onDecide, onOfficeCreated, onPositionCreated }: {
    row: AnalyzedOcrNode; offices: OfficeOpt[]; positions: PositionOpt[]; functions: FunctionOpt[];
    bannerId: number; bannerName: string; defaultFunctionId: string;
    resolution: NewNodeResolution; decision: "create" | "skip";
    onResolved: (patch: Partial<NewNodeResolution>) => void; onDecide: (d: "create" | "skip") => void;
    onOfficeCreated: (office: OfficeOpt) => void; onPositionCreated: (position: PositionOpt) => void;
}) {
    const [addingPosition, setAddingPosition] = useState(false);
    const [positionDraft, setPositionDraft] = useState({ title: row.position_title || "", function_id: defaultFunctionId });
    const [savingPosition, setSavingPosition] = useState(false);
    const [addingOffice, setAddingOffice] = useState(false);
    const [officeDraft, setOfficeDraft] = useState({ country: "", city: "" });
    const [savingOffice, setSavingOffice] = useState(false);

    const resolved = resolution.officeId != null && resolution.positionId != null;
    // The chart's already fixed to one company via context — this is just an
    // informational cross-check against what Gemini read off the page, not
    // something that blocks or drives resolution.
    const bannerMismatch = !!(row.banner_text && bannerName && nameSimilarity(row.banner_text, bannerName) < 0.5);

    async function submitOffice() {
        if (!officeDraft.country.trim()) { toast.error("Country is required"); return; }
        setSavingOffice(true);
        const res = await createCompanyOffice({ banner_name: bannerName, country: officeDraft.country, city: officeDraft.city || null });
        setSavingOffice(false);
        if (!res.ok || !res.office) { toast.error(res.error || "Could not add office"); return; }
        onResolved({ officeId: res.office.office_id });
        onOfficeCreated(res.office);
        setAddingOffice(false);
        toast.success(`${res.office.banner_name} — ${res.office.country} added`);
    }
    async function submitPosition() {
        if (!positionDraft.title.trim()) { toast.error("Position title is required"); return; }
        setSavingPosition(true);
        const title = positionDraft.title.trim();
        const res = await createPosition({ title, banner_id: bannerId, function_id: positionDraft.function_id ? Number(positionDraft.function_id) : null, req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5 });
        setSavingPosition(false);
        if (!res.ok || !res.id) { toast.error(res.error || "Could not add position"); return; }
        onResolved({ positionId: res.id });
        onPositionCreated({ position_id: res.id, title, banner_id: bannerId });
        setAddingPosition(false);
        toast.success(`"${title}" added`);
    }

    return (
        <div className="mb-1.5 rounded-lg border p-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-medium text-[#0f172a]">
                    {row.name} <span className="font-normal text-slate-400">— {row.position_title || "—"}</span>
                    {bannerMismatch && <div className="mt-0.5 text-[11px] font-normal text-amber-600">Chart shows "{row.banner_text}" — doesn't look like {bannerName}, double-check this person belongs here</div>}
                    {row.note && <div className="mt-0.5 text-[11px] font-normal text-amber-600">{row.note}</div>}
                </div>
                {resolved ? (
                    <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant={decision === "create" ? "default" : "outline"} className="h-7 text-xs" onClick={() => onDecide("create")}>Include</Button>
                        <Button size="sm" variant={decision === "skip" ? "default" : "outline"} className="h-7 text-xs" onClick={() => onDecide("skip")}>Skip</Button>
                    </div>
                ) : (
                    <span className="shrink-0 text-[11px] text-slate-400">Resolve to include</span>
                )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={resolution.officeId ?? ""}
                    onChange={(e) => onResolved({ officeId: e.target.value ? Number(e.target.value) : null })}
                >
                    <option value="">— Country office —</option>
                    {offices.map((o) => <option key={o.office_id} value={o.office_id}>{o.country}</option>)}
                </select>
                {!addingOffice ? (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-slate-500" onClick={() => setAddingOffice(true)}><Plus className="h-3 w-3" /> New country office</Button>
                ) : (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-1.5">
                        <Input className="h-7 w-28 text-xs" value={officeDraft.country} onChange={(e) => setOfficeDraft({ ...officeDraft, country: e.target.value })} placeholder="Country" />
                        <Input className="h-7 w-24 text-xs" value={officeDraft.city} onChange={(e) => setOfficeDraft({ ...officeDraft, city: e.target.value })} placeholder="City (opt.)" />
                        <Button size="sm" className="h-7 gap-1 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={savingOffice} onClick={submitOffice}>
                            {savingOffice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                        </Button>
                    </div>
                )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <select
                    className="h-8 min-w-[160px] rounded-md border bg-background px-2 text-xs"
                    value={resolution.positionId ?? ""}
                    onChange={(e) => onResolved({ positionId: e.target.value ? Number(e.target.value) : null })}
                >
                    <option value="">— Position —</option>
                    {positions.map((p) => <option key={p.position_id} value={p.position_id}>{p.title}</option>)}
                </select>
                {!addingPosition ? (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-slate-500" onClick={() => setAddingPosition(true)}><Plus className="h-3 w-3" /> New position</Button>
                ) : (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed p-1.5">
                        <Input className="h-7 w-32 text-xs" value={positionDraft.title} onChange={(e) => setPositionDraft({ ...positionDraft, title: e.target.value })} placeholder="Position title" />
                        <select className="h-7 rounded-md border bg-background px-1.5 text-xs" value={positionDraft.function_id} onChange={(e) => setPositionDraft({ ...positionDraft, function_id: e.target.value })}>
                            <option value="">— function —</option>
                            {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                        </select>
                        <Button size="sm" className="h-7 gap-1 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={savingPosition} onClick={submitPosition}>
                            {savingPosition ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
