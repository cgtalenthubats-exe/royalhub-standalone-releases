"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Position } from "@/app/actions/positions";
import { createPosition, updatePosition, deletePosition } from "@/app/actions/positions";
import { uploadPositionJdPdf } from "@/app/actions/position-jd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";

interface FunctionOpt { function_id: number; name: string }
interface BannerOpt { banner_id: number; name: string }

const CATS = [
    { key: "req_leadership", label: "Leadership" },
    { key: "req_experiences", label: "Experiences" },
    { key: "req_skill", label: "Skill" },
    { key: "req_market", label: "Market" },
] as const;

function reqBarColor(v: number) {
    if (v >= 9) return "#0b1f3a";
    if (v >= 7) return "#2563eb";
    if (v >= 5) return "#0891b2";
    return "#64748b";
}

function empty(bannerId: number | null): Partial<Position> {
    return { title: "", banner_id: bannerId, function_id: null, req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5, jd_content: "", jd_pdf_url: null };
}

export function PositionsClient({ positions, functions, banners }: { positions: Position[]; functions: FunctionOpt[]; banners: BannerOpt[] }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Partial<Position> | null>(null);
    const [saving, setSaving] = useState(false);
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [uploadingJd, setUploadingJd] = useState(false);
    const [filterBanner, setFilterBanner] = useState<number | "all">("all");

    const visible = filterBanner === "all" ? positions : positions.filter((p) => p.banner_id === filterBanner);

    function openAdd() { setEditing(empty(filterBanner === "all" ? banners[0]?.banner_id ?? null : filterBanner)); setJdFile(null); setOpen(true); }
    function openEdit(p: Position) { setEditing({ ...p }); setJdFile(null); setOpen(true); }

    async function save() {
        if (!editing?.title?.trim()) { toast.error("Title required"); return; }
        if (!editing?.banner_id) { toast.error("Company required"); return; }
        setSaving(true);
        const payload = {
            title: editing.title!.trim(),
            banner_id: editing.banner_id,
            function_id: editing.function_id ?? null,
            req_leadership: clamp(editing.req_leadership),
            req_experiences: clamp(editing.req_experiences),
            req_skill: clamp(editing.req_skill),
            req_market: clamp(editing.req_market),
            jd_content: editing.jd_content?.trim() || null,
        };
        let id = editing.position_id;
        const res = id
            ? await updatePosition(id, payload as any)
            : await createPosition(payload as any);
        if (res.ok && !id) id = (res as any).id;
        if (res.ok && jdFile && id) {
            setUploadingJd(true);
            const fd = new FormData();
            fd.append("file", jdFile);
            const upRes = await uploadPositionJdPdf(id, fd);
            setUploadingJd(false);
            if (!upRes.ok) toast.error("Saved, but JD PDF upload failed: " + (upRes.error || ""));
        }
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); setJdFile(null); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(p: Position) {
        if (!confirm(`Delete position "${p.title}"? Employees in it will be unassigned.`)) return;
        const res = await deletePosition(p.position_id);
        if (res.ok) { toast.success("Deleted"); router.refresh(); }
        else toast.error(res.error || "Delete failed");
    }

    return (
        <>
            {/* Page header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Positions &amp; Requirements</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">Competency targets per role, per company – scored 1 to 10</p>
                </div>
                <div className="flex items-center gap-2">
                    <select className="h-9 rounded-md border bg-background px-3 text-sm"
                        value={filterBanner} onChange={(e) => setFilterBanner(e.target.value === "all" ? "all" : Number(e.target.value))}>
                        <option value="all">All companies</option>
                        {banners.map((b) => <option key={b.banner_id} value={b.banner_id}>{b.name}</option>)}
                    </select>
                    <Button className="gap-1.5 bg-[#0b1f3a] hover:bg-[#0b1f3a]/90" onClick={openAdd}>
                        <Plus className="h-4 w-4" /> Add Position
                    </Button>
                </div>
            </div>

            {/* Card grid */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
                    {visible.map((p) => (
                        <div key={p.position_id} className="bg-white border border-slate-200 rounded-[13px] overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)] flex flex-col">
                            {/* Card header */}
                            <div className="px-[15px] pt-[13px] pb-[11px] border-b border-slate-100">
                                <div className="text-[10.5px] font-bold text-[#a16207] uppercase tracking-wide mb-0.5">{p.banner_name || "—"}</div>
                                <div className="text-[13.5px] font-bold text-[#0b1f3a] leading-snug min-h-[34px]">{p.title}</div>
                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-[5px]">
                                        {p.function_name || "—"}
                                    </span>
                                    <span className="text-[11px] text-slate-400 tabular-nums">{p.headcount} filled</span>
                                </div>
                            </div>

                            {/* Requirement bars */}
                            <div className="px-[15px] py-3 flex flex-col gap-2.5 flex-1">
                                {CATS.map((c) => {
                                    const v = (p as any)[c.key] as number ?? 0;
                                    return (
                                        <div key={c.key}>
                                            <div className="flex justify-between text-[10.5px] mb-1">
                                                <span className="font-semibold text-slate-500">{c.label}</span>
                                                <span className="font-bold text-[#0f172a] tabular-nums">{v}</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{ width: `${v * 10}%`, background: reqBarColor(v) }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-1 px-3 pb-2.5">
                                <button
                                    onClick={() => openEdit(p)}
                                    className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#0b1f3a] px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                                >
                                    <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button
                                    onClick={() => remove(p)}
                                    className="flex items-center gap-1 text-[11px] font-medium text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="h-3 w-3" /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add / Edit dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>{editing?.position_id ? "Edit Position" : "Add Position"}</DialogTitle></DialogHeader>
                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
                                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Senior Product Manager" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Company</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={editing.banner_id ?? ""}
                                    onChange={(e) => setEditing({ ...editing, banner_id: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">— select —</option>
                                    {banners.map((b) => <option key={b.banner_id} value={b.banner_id}>{b.name}</option>)}
                                </select>
                                <p className="mt-1 text-[11px] text-slate-400">Requirements are set per company, since the same title can differ across companies.</p>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Function</label>
                                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={editing.function_id ?? ""}
                                    onChange={(e) => setEditing({ ...editing, function_id: e.target.value ? Number(e.target.value) : null })}>
                                    <option value="">— none —</option>
                                    {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {CATS.map((c) => (
                                    <div key={c.key}>
                                        <label className="mb-1 block text-xs font-medium text-slate-600">{c.label} (1–10)</label>
                                        <Input type="number" min={1} max={10} value={(editing as any)[c.key] ?? ""}
                                            onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value === "" ? null : Number(e.target.value) })} />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Job Description</label>
                                <textarea
                                    className="h-32 w-full resize-none rounded-md border bg-background p-2.5 text-sm"
                                    placeholder="Key responsibilities, scope, reporting lines…"
                                    value={editing.jd_content || ""}
                                    onChange={(e) => setEditing({ ...editing, jd_content: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">JD attachment (PDF, view-only)</label>
                                <div className="flex items-center gap-2">
                                    <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                        <Upload className="h-3.5 w-3.5" /> {jdFile ? jdFile.name : "Choose PDF…"}
                                        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setJdFile(e.target.files?.[0] || null)} />
                                    </label>
                                    {editing.jd_pdf_url && !jdFile && (
                                        <a href={editing.jd_pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                            <FileText className="h-3.5 w-3.5" /> current file
                                        </a>
                                    )}
                                </div>
                                <p className="mt-1 text-[11px] text-slate-400">Choosing a new file replaces the current one on save.</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving || uploadingJd} className="gap-1.5">{(saving || uploadingJd) && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function clamp(v: number | null | undefined): number | null {
    if (v === null || v === undefined || isNaN(v)) return null;
    return Math.max(1, Math.min(10, Math.round(v)));
}
