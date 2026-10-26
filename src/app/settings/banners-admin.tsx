"use client";

import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { BannerAdminItem } from "@/app/actions/banners";
import { createBanner, updateBanner, uploadBannerLogo, removeBannerLogo } from "@/app/actions/banners";
import type { CompanySummary, CompanyOfficeSummary, OfficeInput } from "@/app/actions/org";
import { createBannerOffice, updateBannerOffice, deleteBannerOffice } from "@/app/actions/org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Upload, Trash2, Loader2, Check, Building2, ChevronDown, ChevronRight, Plus, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ACCEPT = ".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp";

// Companies (banners) master data: name, short name, logo, and each
// company's country offices — the only place in the app to manage any of
// this (previously logo/name lived here but offices only existed as a
// side effect of the Add Employee wizard's quick-add).
export function BannersAdmin({ banners, companySummary }: { banners: BannerAdminItem[]; companySummary: CompanySummary[] }) {
    const router = useRouter();
    const [busyId, setBusyId] = useState<number | null>(null);
    const [draft, setDraft] = useState<Record<number, { name: string; short_name: string }>>(
        Object.fromEntries(banners.map((b) => [b.banner_id, { name: b.name, short_name: b.short_name || "" }]))
    );
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Crop dialog state — set together when a file is picked, cleared together on cancel/confirm.
    const [cropTarget, setCropTarget] = useState<{ bannerId: number; file: File; imageSrc: string; mimeType: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const targetRef = useRef<number | null>(null);

    const [showAddBanner, setShowAddBanner] = useState(false);
    const [newBanner, setNewBanner] = useState({ name: "", short_name: "" });
    const [addingBanner, setAddingBanner] = useState(false);

    function requestLogo(bannerId: number) {
        targetRef.current = bannerId;
        fileRef.current?.click();
    }

    function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const id = targetRef.current;
        e.target.value = "";
        if (!file || id == null) return;
        // SVG is already vector/scalable — rasterizing it through the canvas
        // crop step would throw away exactly what makes it useful, so it
        // skips straight to upload instead.
        if (file.type === "image/svg+xml") { uploadLogo(id, file); return; }
        setCropTarget({ bannerId: id, file, imageSrc: URL.createObjectURL(file), mimeType: file.type });
    }

    async function uploadLogo(bannerId: number, fileOrBlob: File | Blob) {
        setBusyId(bannerId);
        const fd = new FormData();
        fd.append("file", fileOrBlob, "logo." + (fileOrBlob.type.split("/")[1] || "png"));
        const res = await uploadBannerLogo(bannerId, fd);
        setBusyId(null);
        if (res.ok) { toast.success("Logo updated"); router.refresh(); }
        else toast.error(res.error || "Upload failed");
    }

    function cancelCrop() {
        if (cropTarget) URL.revokeObjectURL(cropTarget.imageSrc);
        setCropTarget(null);
    }
    async function confirmCrop(blob: Blob) {
        if (!cropTarget) return;
        await uploadLogo(cropTarget.bannerId, blob);
        URL.revokeObjectURL(cropTarget.imageSrc);
        setCropTarget(null);
    }

    async function handleRemoveLogo(b: BannerAdminItem) {
        setBusyId(b.banner_id);
        const res = await removeBannerLogo(b.banner_id);
        setBusyId(null);
        if (res.ok) { toast.success("Logo removed"); router.refresh(); }
        else toast.error(res.error || "Could not remove logo");
    }

    async function save(b: BannerAdminItem) {
        const d = draft[b.banner_id];
        setBusyId(b.banner_id);
        const res = await updateBanner(b.banner_id, { name: d.name, short_name: d.short_name });
        setBusyId(null);
        if (res.ok) { toast.success("Saved"); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function submitNewBanner() {
        if (!newBanner.name.trim()) { toast.error("Company name is required"); return; }
        setAddingBanner(true);
        const res = await createBanner({ name: newBanner.name, short_name: newBanner.short_name || null });
        setAddingBanner(false);
        if (!res.ok) { toast.error(res.error || "Could not create company"); return; }
        toast.success(`"${newBanner.name.trim()}" added`);
        setShowAddBanner(false);
        setNewBanner({ name: "", short_name: "" });
        router.refresh();
    }

    const officesByBanner = new Map<number, CompanyOfficeSummary[]>(companySummary.map((c) => [c.banner_id, c.offices]));

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Companies &amp; logos</span>
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => setShowAddBanner((v) => !v)}>
                    <Plus className="h-3.5 w-3.5" /> Add Company
                </Button>
            </div>
            <p className="border-b bg-slate-50 px-4 py-2 text-[12px] text-slate-500">
                The short name and logo shown on every org-chart card, plus each company&apos;s country offices. PNG, JPG, SVG or WebP · max 2&nbsp;MB.
            </p>

            {showAddBanner && (
                <div className="border-b bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="mb-1 block text-[11px] text-slate-500">Company name</label>
                            <Input className="h-8 w-56 text-[13px]" value={newBanner.name} onChange={(e) => setNewBanner({ ...newBanner, name: e.target.value })} placeholder="e.g. Globus" />
                        </div>
                        <div>
                            <label className="mb-1 block text-[11px] text-slate-500">Short name</label>
                            <Input className="h-8 w-28 text-[13px]" value={newBanner.short_name} onChange={(e) => setNewBanner({ ...newBanner, short_name: e.target.value })} placeholder="e.g. GLB" />
                        </div>
                        <Button size="sm" className="h-8 gap-1.5 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={addingBanner} onClick={submitNewBanner}>
                            {addingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowAddBanner(false); setNewBanner({ name: "", short_name: "" }); }}>Cancel</Button>
                    </div>
                </div>
            )}

            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFilePicked} />
            <ImageCropDialog
                open={cropTarget != null}
                imageSrc={cropTarget?.imageSrc ?? null}
                mimeType={cropTarget?.mimeType ?? "image/png"}
                saving={cropTarget != null && busyId === cropTarget.bannerId}
                onCancel={cancelCrop}
                onConfirm={confirmCrop}
            />

            <table className="w-full text-[13px]">
                <thead>
                    <tr className="border-b bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="w-8 px-2 py-2"></th>
                        <th className="px-2 py-2 font-medium">Logo</th>
                        <th className="px-3 py-2 font-medium">Company name</th>
                        <th className="px-3 py-2 font-medium">Short name</th>
                        <th className="px-3 py-2 font-medium">FTE</th>
                        <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {banners.map((b) => {
                        const busy = busyId === b.banner_id;
                        const d = draft[b.banner_id] || { name: b.name, short_name: "" };
                        const dirty = d.name !== b.name || d.short_name !== (b.short_name || "");
                        const expanded = expandedId === b.banner_id;
                        return (
                            <Fragment key={b.banner_id}>
                                <tr className={busy ? "opacity-50" : ""}>
                                    <td className="px-2 py-2.5">
                                        <button onClick={() => setExpandedId(expanded ? null : b.banner_id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b1f3a]">
                                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>
                                    </td>
                                    <td className="px-2 py-2.5">
                                        {b.logo_url ? (
                                            <img src={b.logo_url} alt={b.name} className="h-7 max-w-[110px] object-contain object-left" />
                                        ) : (
                                            <div className="flex h-7 w-16 items-center justify-center rounded border border-dashed border-slate-300 text-slate-300">
                                                <Building2 className="h-3.5 w-3.5" />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <Input className="h-8 text-[13px]" value={d.name} disabled={busy}
                                            onChange={(e) => setDraft({ ...draft, [b.banner_id]: { ...d, name: e.target.value } })} />
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <Input className="h-8 w-28 text-[13px]" value={d.short_name} disabled={busy} placeholder="e.g. SRL"
                                            onChange={(e) => setDraft({ ...draft, [b.banner_id]: { ...d, short_name: e.target.value } })} />
                                    </td>
                                    <td className="px-3 py-2.5 tabular-nums text-slate-500">{b.employee_count}</td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {dirty && (
                                                <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => save(b)}>
                                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
                                                </Button>
                                            )}
                                            <button title="Upload logo" disabled={busy} onClick={() => requestLogo(b.banner_id)}
                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40">
                                                <Upload className="h-4 w-4" />
                                            </button>
                                            {b.logo_url && (
                                                <button title="Remove logo" disabled={busy} onClick={() => handleRemoveLogo(b)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {expanded && (
                                    <tr>
                                        <td colSpan={6} className="bg-slate-50 px-4 py-3">
                                            <OfficeManager bannerId={b.banner_id} offices={officesByBanner.get(b.banner_id) || []} />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </Card>
    );
}

function emptyOfficeDraft(): OfficeInput { return { country: "", city: "", is_hq: false, is_regional_office: false }; }

function OfficeManager({ bannerId, offices }: { bannerId: number; offices: CompanyOfficeSummary[] }) {
    const router = useRouter();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState<OfficeInput>(emptyOfficeDraft());
    const [busyId, setBusyId] = useState<number | "new" | null>(null);
    const [showAdd, setShowAdd] = useState(false);
    const [addDraft, setAddDraft] = useState<OfficeInput>(emptyOfficeDraft());

    function startEdit(o: CompanyOfficeSummary) {
        setEditingId(o.office_id);
        setEditDraft({ country: o.country, city: o.city || "", is_hq: o.is_hq, is_regional_office: o.is_regional_office });
    }

    async function saveEdit(officeId: number) {
        setBusyId(officeId);
        const res = await updateBannerOffice(officeId, editDraft);
        setBusyId(null);
        if (res.ok) { toast.success("Office updated"); setEditingId(null); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function remove(o: CompanyOfficeSummary) {
        setBusyId(o.office_id);
        const res = await deleteBannerOffice(o.office_id);
        setBusyId(null);
        if (res.ok) { toast.success("Office removed"); router.refresh(); }
        else toast.error(res.error || "Could not remove office");
    }

    async function submitAdd() {
        if (!addDraft.country.trim()) { toast.error("Country is required"); return; }
        setBusyId("new");
        const res = await createBannerOffice(bannerId, addDraft);
        setBusyId(null);
        if (!res.ok) { toast.error(res.error || "Could not add office"); return; }
        toast.success("Office added");
        setShowAdd(false);
        setAddDraft(emptyOfficeDraft());
        router.refresh();
    }

    return (
        <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Country offices</div>
            {offices.length === 0 && !showAdd && <p className="text-[12.5px] text-slate-400">No offices yet — nobody can be added under this company until one exists.</p>}
            {offices.length > 0 && (
                <div className="divide-y divide-slate-200 rounded-lg border bg-white">
                    {offices.map((o) => {
                        const busy = busyId === o.office_id;
                        const editing = editingId === o.office_id;
                        return (
                            <div key={o.office_id} className={cn("flex items-center gap-2 px-3 py-2 text-[12.5px]", busy && "opacity-50")}>
                                {editing ? (
                                    <>
                                        <Input className="h-7 w-32 text-[12.5px]" value={editDraft.country} onChange={(e) => setEditDraft({ ...editDraft, country: e.target.value })} placeholder="Country" />
                                        <Input className="h-7 w-32 text-[12.5px]" value={editDraft.city || ""} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} placeholder="City (optional)" />
                                        <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={editDraft.is_hq} onChange={(e) => setEditDraft({ ...editDraft, is_hq: e.target.checked })} /> HQ</label>
                                        <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={editDraft.is_regional_office} onChange={(e) => setEditDraft({ ...editDraft, is_regional_office: e.target.checked })} /> Regional</label>
                                        <div className="ml-auto flex items-center gap-1">
                                            <Button size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => saveEdit(o.office_id)}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save</Button>
                                            <button className="rounded p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium text-[#0f172a]">{o.country}</span>
                                        {o.city && <span className="text-slate-400">· {o.city}</span>}
                                        {o.is_hq && <span className="rounded bg-[#0b1f3a]/[.08] px-1.5 py-0.5 text-[10px] font-semibold text-[#0b1f3a]">HQ</span>}
                                        {o.is_regional_office && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Regional</span>}
                                        <span className="text-slate-400">{o.employee_count} FTE</span>
                                        <div className="ml-auto flex items-center gap-1">
                                            <button title="Edit" disabled={busy} onClick={() => startEdit(o)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button>
                                            <button title="Remove" disabled={busy} onClick={() => remove(o)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showAdd ? (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2.5">
                    <Input className="h-7 w-32 text-[12.5px]" value={addDraft.country} onChange={(e) => setAddDraft({ ...addDraft, country: e.target.value })} placeholder="Country" />
                    <Input className="h-7 w-32 text-[12.5px]" value={addDraft.city || ""} onChange={(e) => setAddDraft({ ...addDraft, city: e.target.value })} placeholder="City (optional)" />
                    <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={addDraft.is_hq} onChange={(e) => setAddDraft({ ...addDraft, is_hq: e.target.checked })} /> HQ</label>
                    <label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={addDraft.is_regional_office} onChange={(e) => setAddDraft({ ...addDraft, is_regional_office: e.target.checked })} /> Regional</label>
                    <Button size="sm" className="h-7 gap-1 text-xs" style={{ backgroundColor: "#0b1f3a" }} disabled={busyId === "new"} onClick={submitAdd}>
                        {busyId === "new" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAdd(false); setAddDraft(emptyOfficeDraft()); }}>Cancel</Button>
                </div>
            ) : (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setShowAdd(true)}><Plus className="h-3.5 w-3.5" /> Add office</Button>
            )}
        </div>
    );
}
