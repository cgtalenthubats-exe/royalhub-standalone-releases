"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SuccessionSeatNode, Readiness } from "@/app/actions/succession";
import { createSeat, updateSeat, deleteSeat, createCandidate, updateCandidate, deleteCandidate } from "@/app/actions/succession";
import { getComparisonData, type EmployeeDetail } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { ExternalLink, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const READY_COLOR: Record<Readiness, { bg: string; fg: string; label: string }> = {
    ready_now: { bg: "#dcfce7", fg: "#15803d", label: "Ready Now" },
    ready_1_3: { bg: "#fef9c3", fg: "#a16207", label: "Ready 1-3Y" },
    ready_3_5: { bg: "#fee2e2", fg: "#b91c1c", label: "Ready 3-5Y" },
};

export interface Opt { id: number; name: string }
export interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }

const CATS = [
    { key: "leadership", label: "Leadership" },
    { key: "experiences", label: "Experiences" },
    { key: "skill", label: "Skill" },
    { key: "market", label: "Market" },
] as const;

export function SeatDialog({ seat, open, onClose, bannerId, employees, positions, offices, onChanged }: {
    seat: SuccessionSeatNode | null; open: boolean; onClose: () => void; bannerId: number;
    employees: Opt[]; positions: Opt[]; offices: OfficeOpt[]; onChanged: () => void;
}) {
    const [saving, setSaving] = useState(false);
    const [addName, setAddName] = useState("");
    const [addEmployeeId, setAddEmployeeId] = useState("");
    const [addReadiness, setAddReadiness] = useState<Readiness>("ready_1_3");

    // Live detail (position, company, country, competency scores) for the
    // current incumbent + every internal successor — fetched fresh whenever
    // a different seat is opened, so the scoreboard always reflects reality.
    const [details, setDetails] = useState<Map<number, EmployeeDetail>>(new Map());
    const [loadingDetails, setLoadingDetails] = useState(false);
    const fetchSeq = useRef(0);

    useEffect(() => {
        if (!seat) return;
        const ids = Array.from(new Set([
            seat.employee_id,
            ...seat.candidates.map((c) => c.candidate_employee_id),
        ].filter((id): id is number => !!id)));
        if (ids.length === 0) { setDetails(new Map()); return; }
        setLoadingDetails(true);
        const requestId = ++fetchSeq.current;
        getComparisonData(ids).then((data) => {
            if (requestId !== fetchSeq.current) return;
            setDetails(new Map(data.map((d) => [d.employee_id, d])));
            setLoadingDetails(false);
        });
    }, [seat?.seat_id, seat?.employee_id, seat?.candidates.map((c) => c.candidate_employee_id).join(",")]);

    if (!seat) return null;

    async function addCandidate() {
        const name = addEmployeeId ? employees.find((e) => e.id === Number(addEmployeeId))?.name || addName : addName;
        if (!name.trim()) { toast.error("Candidate name required"); return; }
        setSaving(true);
        const res = await createCandidate(seat!.seat_id, {
            candidate_name: name.trim(),
            candidate_employee_id: addEmployeeId ? Number(addEmployeeId) : null,
            readiness: addReadiness,
            rank: seat!.candidates.length,
        });
        setSaving(false);
        if (res.ok) { toast.success("Candidate added"); setAddName(""); setAddEmployeeId(""); onChanged(); }
        else toast.error(res.error || "Failed");
    }

    async function changeReadiness(candidateId: number, readiness: Readiness) {
        const res = await updateCandidate(candidateId, { readiness });
        if (res.ok) onChanged(); else toast.error(res.error || "Failed");
    }

    async function removeCandidate(candidateId: number) {
        const res = await deleteCandidate(candidateId);
        if (res.ok) { toast.success("Removed"); onChanged(); } else toast.error(res.error || "Failed");
    }

    async function addChildSeat() {
        setSaving(true);
        const res = await createSeat({
            parent_seat_id: seat!.seat_id, banner_id: bannerId,
            office_id: seat!.office_id, position_id: null, employee_id: null, label: "New Position",
        });
        setSaving(false);
        if (res.ok) { toast.success("Child position added — edit it to set details"); onChanged(); onClose(); }
        else toast.error(res.error || "Failed");
    }

    async function removeSeat() {
        if (!confirm("Delete this seat? Any child positions under it will be deleted too.")) return;
        const res = await deleteSeat(seat!.seat_id);
        if (res.ok) { toast.success("Deleted"); onChanged(); onClose(); }
        else toast.error(res.error || "Failed");
    }

    async function assignEmployee(employeeId: string) {
        const res = await updateSeat(seat!.seat_id, { employee_id: employeeId ? Number(employeeId) : null });
        if (res.ok) onChanged(); else toast.error(res.error || "Failed");
    }

    async function assignPosition(positionId: string) {
        const res = await updateSeat(seat!.seat_id, { position_id: positionId ? Number(positionId) : null, label: positionId ? null : seat!.label });
        if (res.ok) onChanged(); else toast.error(res.error || "Failed");
    }

    const sortedCandidates = [...seat.candidates].sort((a, b) => a.rank - b.rank);
    // Columns: current incumbent (if any) first, then every successor in rank order.
    type Col = { key: string; kind: "current" | "candidate"; name: string; employeeId: number | null; candidateId?: number; readiness?: Readiness };
    const columns: Col[] = [
        ...(seat.employee_id ? [{ key: "current", kind: "current" as const, name: seat.employee_name || "—", employeeId: seat.employee_id }] : []),
        ...sortedCandidates.map((c) => ({ key: `c${c.candidate_id}`, kind: "candidate" as const, name: c.candidate_name, employeeId: c.candidate_employee_id, candidateId: c.candidate_id, readiness: c.readiness })),
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="w-[95vw] sm:max-w-[880px] max-h-[88vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{seat.position_title || "Position"}</DialogTitle></DialogHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Position</label>
                        <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue={seat.position_id ?? ""} onChange={(e) => assignPosition(e.target.value)}>
                            <option value="">— custom label —</option>
                            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Current Incumbent</label>
                        <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" defaultValue={seat.employee_id ?? ""} onChange={(e) => assignEmployee(e.target.value)}>
                            <option value="">— vacant —</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Comparison-style scoreboard: Current + each successor, side by side */}
                <div className="rounded-lg border overflow-hidden">
                    <div className="bg-[#0b1f3a] px-3 py-2 text-xs font-semibold text-white">
                        Current vs Successors {loadingDetails && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />}
                    </div>
                    {columns.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-slate-400">Vacant seat, no successors yet — add one below.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-0 text-[12px]">
                                <thead>
                                    <tr>
                                        <th className="sticky left-0 z-10 w-[110px] min-w-[110px] border-b border-r bg-slate-50 px-2.5 py-2 text-left text-[10px] font-medium uppercase text-slate-400">&nbsp;</th>
                                        {columns.map((col) => {
                                            const d = col.employeeId ? details.get(col.employeeId) : undefined;
                                            return (
                                                <th key={col.key} className={`min-w-[150px] border-b px-2.5 py-2 text-center ${col.kind === "current" ? "bg-slate-50" : ""}`}>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <EmployeeAvatar name={col.name} photo={d?.photo} size={32} />
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[12px] font-bold text-[#0b1f3a] truncate max-w-[120px]">{col.name}</span>
                                                            {col.employeeId && <Link href={`/employees/${col.employeeId}`} className="text-slate-400 hover:text-[#0b1f3a]" title="Open profile"><ExternalLink className="h-3 w-3" /></Link>}
                                                        </div>
                                                        {col.kind === "current" ? (
                                                            <span className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Current</span>
                                                        ) : (
                                                            <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: READY_COLOR[col.readiness!].bg, color: READY_COLOR[col.readiness!].fg }}>
                                                                {READY_COLOR[col.readiness!].label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    <ScoreRow label="Position" columns={columns} details={details} get={(d) => d?.position_title || "—"} />
                                    <ScoreRow label="Company" columns={columns} details={details} get={(d) => d?.banner_name || "—"} />
                                    <ScoreRow label="Country" columns={columns} details={details} get={(d) => d?.country || "—"} />
                                    {CATS.map((cat) => (
                                        <ScoreRow key={cat.key} label={cat.label} columns={columns} details={details} get={(d) => d?.scores?.[cat.key] ?? null} numeric />
                                    ))}
                                    {/* per-column edit controls for successors (not shown for the Current column) */}
                                    <tr>
                                        <td className="sticky left-0 z-10 border-r bg-slate-50 px-2.5 py-2 text-slate-500">&nbsp;</td>
                                        {columns.map((col) => (
                                            <td key={col.key} className="px-2 py-2 text-center">
                                                {col.kind === "candidate" && (
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <select
                                                            className="h-7 rounded border bg-background px-1 text-[11px]"
                                                            value={col.readiness}
                                                            onChange={(e) => changeReadiness(col.candidateId!, e.target.value as Readiness)}
                                                        >
                                                            <option value="ready_now">Ready Now</option>
                                                            <option value="ready_1_3">Ready 1-3Y</option>
                                                            <option value="ready_3_5">Ready 3-5Y</option>
                                                        </select>
                                                        <button onClick={() => removeCandidate(col.candidateId!)} className="text-red-300 hover:text-red-600" title="Remove successor"><Trash2 className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Add successor */}
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[120px]">
                        <label className="mb-1 block text-[10px] text-slate-500">Internal (optional)</label>
                        <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={addEmployeeId} onChange={(e) => setAddEmployeeId(e.target.value)}>
                            <option value="">— none —</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <label className="mb-1 block text-[10px] text-slate-500">Or external name</label>
                        <Input className="h-8 text-xs" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="External candidate" disabled={!!addEmployeeId} />
                    </div>
                    <div className="min-w-[110px]">
                        <label className="mb-1 block text-[10px] text-slate-500">Readiness</label>
                        <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={addReadiness} onChange={(e) => setAddReadiness(e.target.value as Readiness)}>
                            <option value="ready_now">Ready Now</option>
                            <option value="ready_1_3">Ready 1-3Y</option>
                            <option value="ready_3_5">Ready 3-5Y</option>
                        </select>
                    </div>
                    <Button size="sm" className="h-8 gap-1" disabled={saving} onClick={addCandidate}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add</Button>
                </div>

                <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:!justify-between">
                    <Button variant="outline" className="gap-1.5 text-red-600 hover:text-red-700" onClick={removeSeat}><Trash2 className="h-3.5 w-3.5" /> Delete Seat</Button>
                    <Button className="gap-1.5" disabled={saving} onClick={addChildSeat}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} + Add Child Position</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ScoreRow({ label, columns, details, get, numeric }: {
    label: string;
    columns: { key: string; employeeId: number | null }[];
    details: Map<number, EmployeeDetail>;
    get: (d: EmployeeDetail | undefined) => string | number | null;
    numeric?: boolean;
}) {
    return (
        <tr>
            <td className="sticky left-0 z-10 border-b border-r bg-slate-50 px-2.5 py-1.5 text-slate-500">{label}</td>
            {columns.map((col) => {
                const d = col.employeeId ? details.get(col.employeeId) : undefined;
                const v = col.employeeId ? get(d) : null;
                return (
                    <td key={col.key} className={`border-b px-2.5 py-1.5 text-center ${numeric ? "tabular-nums font-semibold text-[#0b1f3a]" : "text-slate-700"}`}>
                        {v == null || v === "" ? <span className="text-slate-300">—</span> : numeric ? `${v}/10` : v}
                    </td>
                );
            })}
        </tr>
    );
}
