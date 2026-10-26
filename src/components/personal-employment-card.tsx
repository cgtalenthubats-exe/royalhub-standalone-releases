"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEmployeePersonal } from "@/app/actions/employee-crud";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate, formatYears, calcAge, estimatedRetirementDate, yearsUntil } from "@/lib/format";
import { COUNTRIES } from "@/lib/countries";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface PersonalEmploymentData {
    date_of_birth: string | null;
    hire_date: string | null;
    position_effective_date: string | null;
    nationality: string | null;
    gender: string | null;
    country: string | null;
    city: string | null;
    job_grade: string | null;
    retirement_age: number | null;
}

// canSeePersonal gates Age + Estimated Retirement — both derived from a
// birthdate, so they carry the same "how old are you" sensitivity as
// compensation. Retirement age itself is per-employee (varies by country).
export function PersonalEmploymentCard({ employeeId, data, canSeePersonal = true }: { employeeId: number; data: PersonalEmploymentData; canSeePersonal?: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState(data);

    function openEdit() { setDraft(data); setOpen(true); }

    async function save() {
        setSaving(true);
        const res = await updateEmployeePersonal(employeeId, {
            date_of_birth: draft.date_of_birth,
            hire_date: draft.hire_date,
            position_effective_date: draft.position_effective_date,
            nationality: draft.nationality,
            gender: draft.gender,
            job_grade: draft.job_grade,
            ...(canSeePersonal ? { retirement_age: draft.retirement_age } : {}),
        });
        setSaving(false);
        if (res.ok) { toast.success("Saved"); setOpen(false); router.refresh(); }
        else toast.error(res.error || "Save failed");
    }

    const rows: [string, string][] = [
        ["Date of Birth", formatDate(data.date_of_birth)],
        ["Hire Date", formatDate(data.hire_date)],
        ["Years of Service", formatYears(data.hire_date)],
        ["Current Job Effective Date", formatDate(data.position_effective_date)],
        ["Years in Position", formatYears(data.position_effective_date)],
        ["Nationality", data.nationality || "-"],
        ["Gender", data.gender || "-"],
        ["Country / City", [data.country, data.city].filter(Boolean).join(" · ") || "-"],
        ["Job Grade", data.job_grade || "-"],
    ];
    if (canSeePersonal) {
        const age = calcAge(data.date_of_birth);
        const retireDate = estimatedRetirementDate(data.date_of_birth, data.retirement_age);
        const retireLabel = retireDate
            ? `${formatDate(retireDate.toISOString())} (${yearsUntil(retireDate)} yrs from now)`
            : (data.retirement_age ? "-" : "Set retirement age →");
        rows.push(
            ["Age", age != null ? `${age}` : "-"],
            ["Estimated Retirement", retireLabel],
        );
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Personal &amp; Employment</span>
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openEdit}>
                    <Pencil className="h-3 w-3" /> Edit
                </Button>
            </div>
            <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-slate-100">
                    {rows.map(([k, v]) => (
                        <tr key={k}><td className="px-3.5 py-2 text-slate-500">{k}</td><td className="px-3.5 py-2 text-right font-medium text-[#0f172a]">{v}</td></tr>
                    ))}
                </tbody>
            </table>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Edit Personal &amp; Employment</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
                            <Input type="date" value={draft.date_of_birth || ""} onChange={(e) => setDraft({ ...draft, date_of_birth: e.target.value || null })} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Hire Date</label>
                            <Input type="date" value={draft.hire_date || ""} onChange={(e) => setDraft({ ...draft, hire_date: e.target.value || null })} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Current Job Effective Date</label>
                            <Input type="date" value={draft.position_effective_date || ""} onChange={(e) => setDraft({ ...draft, position_effective_date: e.target.value || null })} />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Job Grade</label>
                            <Input value={draft.job_grade || ""} onChange={(e) => setDraft({ ...draft, job_grade: e.target.value })} placeholder="e.g. Exec, Manager" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Nationality</label>
                            <Combobox options={COUNTRIES} value={draft.nationality || null} onChange={(v) => setDraft({ ...draft, nationality: v || "" })} placeholder="Select…" searchPlaceholder="Search or type new…" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Gender</label>
                            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.gender || ""} onChange={(e) => setDraft({ ...draft, gender: e.target.value || null })}>
                                <option value="">—</option>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        {canSeePersonal && (
                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Retirement Age</label>
                                <Input
                                    type="number" min={40} max={80}
                                    value={draft.retirement_age ?? ""}
                                    onChange={(e) => setDraft({ ...draft, retirement_age: e.target.value ? Number(e.target.value) : null })}
                                    placeholder="varies by country, e.g. 60"
                                />
                            </div>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400">Country / City follow the employee's office assignment — move them on an org chart to change those.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
