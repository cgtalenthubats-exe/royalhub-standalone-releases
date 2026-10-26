"use client";

import { useMemo, useRef, useState } from "react";
import type { FolderItem } from "@/app/actions/document-folders";
import { FilePreviewDialog, type PreviewTarget } from "@/components/file-preview-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Folder, FolderPlus, Upload, FileText, Pencil, Trash2, Eye, FolderInput,
    ChevronRight, Home, Loader2, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export interface FileBrowserFile {
    id: number;
    filename: string;
    description: string | null;
    folder_id: number | null;
    mime_type: string | null;
    size_bytes: number | null;
    uploaded_by: string | null;
    created_at: string;
    url: string;
}

export interface FileBrowserProps {
    folders: FolderItem[];
    files: FileBrowserFile[];
    accept: string;
    maxSizeLabel: string;
    emptyStateText: string;
    onUpload: (file: File, description: string, folderId: number | null) => Promise<{ ok: boolean; error?: string }>;
    onReplace?: (id: number, file: File) => Promise<{ ok: boolean; error?: string }>;
    onUpdateDescription: (id: number, description: string) => Promise<{ ok: boolean; error?: string }>;
    onDelete: (id: number) => Promise<{ ok: boolean; error?: string }>;
    onMove: (id: number, folderId: number | null) => Promise<{ ok: boolean; error?: string }>;
    onCreateFolder: (name: string, parentFolderId: number | null) => Promise<{ ok: boolean; error?: string }>;
    onRenameFolder: (folderId: number, name: string) => Promise<{ ok: boolean; error?: string }>;
    onDeleteFolder: (folderId: number) => Promise<{ ok: boolean; error?: string }>;
    onRefresh: () => void;
}

function formatSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function kindLabel(mime: string | null): string {
    if (!mime) return "FILE";
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("presentationml") || mime.includes("ms-powerpoint")) return "PPT";
    if (mime.includes("wordprocessing") || mime.includes("msword")) return "DOC";
    if (mime.includes("spreadsheet") || mime.includes("ms-excel")) return "XLS";
    if (mime.startsWith("image/")) return "IMG";
    return "FILE";
}

function folderPath(folders: FolderItem[], folderId: number | null): FolderItem[] {
    const byId = new Map(folders.map((f) => [f.folder_id, f]));
    const path: FolderItem[] = [];
    let cur = folderId != null ? byId.get(folderId) : undefined;
    while (cur) {
        path.unshift(cur);
        cur = cur.parent_folder_id != null ? byId.get(cur.parent_folder_id) : undefined;
    }
    return path;
}

// Flattened "Folder / Sub-folder" labels for the move-to picker, depth-first.
function folderOptions(folders: FolderItem[]): { id: number; label: string }[] {
    const byParent = new Map<number | null, FolderItem[]>();
    for (const f of folders) {
        const key = f.parent_folder_id;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(f);
    }
    const out: { id: number; label: string }[] = [];
    function walk(parentId: number | null, prefix: string) {
        for (const f of (byParent.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name))) {
            const label = prefix ? `${prefix} / ${f.name}` : f.name;
            out.push({ id: f.folder_id, label });
            walk(f.folder_id, label);
        }
    }
    walk(null, "");
    return out;
}

// Google-Drive-like browser reused by both the shared Document Center and the
// per-employee document library: folder tree + file table at the current
// level, with an inline preview instead of navigating away on click.
export function FileBrowser(props: FileBrowserProps) {
    const {
        folders, files, accept, maxSizeLabel, emptyStateText,
        onUpload, onReplace, onUpdateDescription, onDelete, onMove,
        onCreateFolder, onRenameFolder, onDeleteFolder, onRefresh,
    } = props;

    const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);

    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [description, setDescription] = useState("");
    const [editing, setEditing] = useState<FileBrowserFile | null>(null);
    const [editText, setEditText] = useState("");
    const [moving, setMoving] = useState<FileBrowserFile | null>(null);
    const [moveTarget, setMoveTarget] = useState<string>("root");
    const [preview, setPreview] = useState<PreviewTarget | null>(null);

    const [newFolderOpen, setNewFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [renamingFolder, setRenamingFolder] = useState<FolderItem | null>(null);
    const [renameText, setRenameText] = useState("");

    const inputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const replaceTargetRef = useRef<number | null>(null);

    const crumbs = useMemo(() => folderPath(folders, currentFolderId), [folders, currentFolderId]);
    const childFolders = useMemo(
        () => folders.filter((f) => (f.parent_folder_id ?? null) === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
        [folders, currentFolderId]
    );
    const currentFiles = useMemo(
        () => files.filter((f) => (f.folder_id ?? null) === currentFolderId),
        [files, currentFolderId]
    );
    const moveOptions = useMemo(() => folderOptions(folders), [folders]);

    function onPick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        setPendingFile(file);
        setDescription("");
    }

    async function confirmUpload() {
        if (!pendingFile) return;
        setBusy(true);
        const res = await onUpload(pendingFile, description, currentFolderId);
        setBusy(false);
        if (res.ok) { toast.success("Uploaded"); setPendingFile(null); setDescription(""); onRefresh(); }
        else toast.error(res.error || "Upload failed");
    }

    function requestReplace(id: number) {
        replaceTargetRef.current = id;
        replaceInputRef.current?.click();
    }
    async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const id = replaceTargetRef.current;
        e.target.value = "";
        if (!file || id == null || !onReplace) return;
        setBusyId(id);
        const res = await onReplace(id, file);
        setBusyId(null);
        if (res.ok) { toast.success("Replaced"); onRefresh(); }
        else toast.error(res.error || "Replace failed");
    }

    async function saveDescription() {
        if (!editing) return;
        setBusyId(editing.id);
        const res = await onUpdateDescription(editing.id, editText);
        setBusyId(null);
        if (res.ok) { toast.success("Saved"); setEditing(null); onRefresh(); }
        else toast.error(res.error || "Save failed");
    }

    async function handleDelete(file: FileBrowserFile) {
        if (!confirm(`Delete "${file.filename}"? This can't be undone.`)) return;
        setBusyId(file.id);
        const res = await onDelete(file.id);
        setBusyId(null);
        if (res.ok) { toast.success("Deleted"); onRefresh(); }
        else toast.error(res.error || "Delete failed");
    }

    function openMove(file: FileBrowserFile) {
        setMoving(file);
        setMoveTarget(file.folder_id != null ? String(file.folder_id) : "root");
    }
    async function confirmMove() {
        if (!moving) return;
        setBusyId(moving.id);
        const folderId = moveTarget === "root" ? null : Number(moveTarget);
        const res = await onMove(moving.id, folderId);
        setBusyId(null);
        if (res.ok) { toast.success("Moved"); setMoving(null); onRefresh(); }
        else toast.error(res.error || "Move failed");
    }

    async function confirmCreateFolder() {
        if (!newFolderName.trim()) return;
        setBusy(true);
        const res = await onCreateFolder(newFolderName, currentFolderId);
        setBusy(false);
        if (res.ok) { toast.success("Folder created"); setNewFolderOpen(false); setNewFolderName(""); onRefresh(); }
        else toast.error(res.error || "Could not create folder");
    }

    async function confirmRenameFolder() {
        if (!renamingFolder || !renameText.trim()) return;
        setBusy(true);
        const res = await onRenameFolder(renamingFolder.folder_id, renameText);
        setBusy(false);
        if (res.ok) { toast.success("Renamed"); setRenamingFolder(null); onRefresh(); }
        else toast.error(res.error || "Rename failed");
    }

    async function handleDeleteFolder(folder: FolderItem) {
        if (!confirm(`Delete folder "${folder.name}"? It must be empty.`)) return;
        setBusy(true);
        const res = await onDeleteFolder(folder.folder_id);
        setBusy(false);
        if (res.ok) { toast.success("Folder deleted"); onRefresh(); }
        else toast.error(res.error || "Could not delete folder");
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1 text-[12.5px] text-slate-500">
                    <button onClick={() => setCurrentFolderId(null)}
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-[#0b1f3a] ${currentFolderId === null ? "font-semibold text-[#0b1f3a]" : ""}`}>
                        <Home className="h-3.5 w-3.5" /> All files
                    </button>
                    {crumbs.map((c) => (
                        <span key={c.folder_id} className="flex items-center gap-1">
                            <ChevronRight className="h-3 w-3 text-slate-300" />
                            <button onClick={() => setCurrentFolderId(c.folder_id)}
                                className={`rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-[#0b1f3a] ${c.folder_id === currentFolderId ? "font-semibold text-[#0b1f3a]" : ""}`}>
                                {c.name}
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => { setNewFolderName(""); setNewFolderOpen(true); }}>
                        <FolderPlus className="h-3.5 w-3.5" /> New folder
                    </Button>
                    <label>
                        <Button asChild size="sm" className="h-7 gap-1.5 text-xs" style={{ backgroundColor: "#0b1f3a" }}>
                            <span className="cursor-pointer"><Upload className="h-3.5 w-3.5" /> Upload</span>
                        </Button>
                        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onPick} />
                    </label>
                </div>
            </div>

            {onReplace && <input ref={replaceInputRef} type="file" accept={accept} className="hidden" onChange={handleReplace} />}

            {childFolders.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {childFolders.map((f) => (
                        <div key={f.folder_id} className="group flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-2 hover:border-slate-300">
                            <button onClick={() => setCurrentFolderId(f.folder_id)} className="flex items-center gap-2 text-[12.5px] font-medium text-[#0b1f3a]">
                                <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                                <span className="max-w-[140px] truncate">{f.name}</span>
                            </button>
                            <div className="ml-1 hidden items-center gap-0.5 group-hover:flex">
                                <button title="Rename" onClick={() => { setRenamingFolder(f); setRenameText(f.name); }}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#0b1f3a]">
                                    <Pencil className="h-3 w-3" />
                                </button>
                                <button title="Delete" onClick={() => handleDeleteFolder(f)}
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {currentFiles.length === 0 && childFolders.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12.5px] text-slate-400">{emptyStateText}</div>
            ) : currentFiles.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px] text-slate-300">No files in this folder yet.</div>
            ) : (
                <table className="w-full text-[12.5px]">
                    <thead>
                        <tr className="border-b bg-slate-50 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2 font-medium">File</th>
                            <th className="px-3 py-2 font-medium">Description</th>
                            <th className="px-3 py-2 font-medium">Uploaded</th>
                            <th className="px-3 py-2 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {currentFiles.map((file) => {
                            const busyRow = busyId === file.id;
                            return (
                                <tr key={file.id} className={busyRow ? "opacity-50" : ""}>
                                    <td className="px-3 py-2.5">
                                        <button onClick={() => setPreview({ filename: file.filename, url: file.url, mime_type: file.mime_type })}
                                            className="flex items-center gap-2 text-left font-medium text-[#0b1f3a] hover:underline">
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="truncate">{file.filename}</span>
                                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-500">{kindLabel(file.mime_type)}</span>
                                        </button>
                                        <div className="mt-0.5 pl-[22px] text-[10.5px] text-slate-400">{formatSize(file.size_bytes)}{file.uploaded_by ? ` · ${file.uploaded_by}` : ""}</div>
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-600">{file.description || <span className="text-slate-300">—</span>}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{formatDate(file.created_at)}</td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center justify-end gap-1">
                                            <button title="Preview" disabled={busyRow} onClick={() => setPreview({ filename: file.filename, url: file.url, mime_type: file.mime_type })}
                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40">
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                            <button title="Move" disabled={busyRow} onClick={() => openMove(file)}
                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40">
                                                <FolderInput className="h-3.5 w-3.5" />
                                            </button>
                                            <button title="Edit description" disabled={busyRow} onClick={() => { setEditing(file); setEditText(file.description || ""); }}
                                                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40">
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            {onReplace && (
                                                <button title="Replace file" disabled={busyRow} onClick={() => requestReplace(file.id)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0b1f3a] disabled:opacity-40">
                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button title="Delete" disabled={busyRow} onClick={() => handleDelete(file)}
                                                className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            <FilePreviewDialog target={preview} onOpenChange={(o) => { if (!o) setPreview(null); }} />

            <Dialog open={!!pendingFile} onOpenChange={(o) => { if (!o && !busy) { setPendingFile(null); setDescription(""); } }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader><DialogTitle>Upload file</DialogTitle></DialogHeader>
                    <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-[12.5px]">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate font-medium text-[#0b1f3a]">{pendingFile?.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">{formatSize(pendingFile?.size ?? null)}</span>
                    </div>
                    {crumbs.length > 0 && (
                        <div className="text-[11.5px] text-slate-400">Uploading into: <span className="font-medium text-slate-600">{crumbs.map((c) => c.name).join(" / ")}</span></div>
                    )}
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Description <span className="text-slate-400">(optional)</span></label>
                        <Input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this file?" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" disabled={busy} onClick={() => { setPendingFile(null); setDescription(""); }}>Cancel</Button>
                        <Button disabled={busy} onClick={confirmUpload}>
                            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Upload
                        </Button>
                    </DialogFooter>
                    <p className="text-[11px] text-slate-400">Max {maxSizeLabel}</p>
                </DialogContent>
            </Dialog>

            <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader><DialogTitle>Edit description</DialogTitle></DialogHeader>
                    <div className="truncate text-[12.5px] text-slate-500">{editing?.filename}</div>
                    <Input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="What is this file?" />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button onClick={saveDescription}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!moving} onOpenChange={(o) => { if (!o) setMoving(null); }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader><DialogTitle>Move file</DialogTitle></DialogHeader>
                    <div className="truncate text-[12.5px] text-slate-500">{moving?.filename}</div>
                    <Select value={moveTarget} onValueChange={setMoveTarget}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="root">All files (root)</SelectItem>
                            {moveOptions.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMoving(null)}>Cancel</Button>
                        <Button onClick={confirmMove}>Move</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
                <DialogContent className="sm:max-w-[380px]">
                    <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
                    <Input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder name" onKeyDown={(e) => { if (e.key === "Enter") confirmCreateFolder(); }} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                        <Button disabled={busy} onClick={confirmCreateFolder}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!renamingFolder} onOpenChange={(o) => { if (!o) setRenamingFolder(null); }}>
                <DialogContent className="sm:max-w-[380px]">
                    <DialogHeader><DialogTitle>Rename folder</DialogTitle></DialogHeader>
                    <Input autoFocus value={renameText} onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") confirmRenameFolder(); }} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenamingFolder(null)}>Cancel</Button>
                        <Button disabled={busy} onClick={confirmRenameFolder}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
