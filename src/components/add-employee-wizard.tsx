"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createEmployeeFull, type NewEmployeeCareerEntry, type NewEmployeeBackgroundEntry } from "@/app/actions/employee-crud";
import { upsertCompensationHistory, type CompHistoryInput } from "@/app/actions/compensation-history";
import { createCompanyOffice } from "@/app/actions/org";
import { createPosition } from "@/app/actions/positions";
import { uploadEmployeePhoto } from "@/app/actions/photo";
import { uploadEmployeeResume } from "@/app/actions/resume";
import { setEmployeeManager, type EmployeeListItem } from "@/app/actions/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { COUNTRIES } from "@/lib/countries";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight, Camera, FileUp, FileText, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Opt { id: number; name: string; banner_id: number | null }
interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
interface FunctionOpt { function_id: number; name: string }

const STEPS = ["Personal & Employment", "Compensation & Benefits", "Compensation History", "Career History", "Background & Résumé", "Review"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function emptyComp() {
    return {
        base_salary: "" as number | "", sti_target: "" as number | "", sti_max: "" as number | "",
        lti_target: "" as number | "", lti_max: "" as number | "", other_bonus: "" as number | "",
        allowance_company_car: "" as number | "", allowance_mobility: "" as number | "",
        allowance_home_office: "" as number | "", allowance_private_medical: "" as number | "",
        allowance_family_cover: "" as string, // free text ("Other benefit — please specify"), not a euro amount
    };
}
function emptyCareerDraft() { return { banner: "", position: "", location: "", start_date: "", end_date: "" }; }
function emptyCompHistDraft(): CompHistoryInput & { key: number } {
    return {
        key: Date.now(), fiscal_year: CURRENT_YEAR - 1, effective_date: null, base_salary: null, cash_allowance: null,
        sti_eligible_pct: null, sti_actual_pct: null, lti_eligible_pct: null, lti_actual_pct: null,
        pension_contribution: null, note: null,
    };
}
function backgroundDraft() { return { title: "", organization: "", detail: "" }; }

export function AddEmployeeWizard({ open, onOpenChange, offices: initialOffices, positions: initialPositions, functions, employees }: {
    open: boolean; onOpenChange: (open: boolean) => void; offices: OfficeOpt[]; positions: Opt[]; functions: FunctionOpt[]; employees: EmployeeListItem[];
}) {
    const router = useRouter();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);

    // Local, mutable copies — quick-add appends to these so a newly created
    // company/office/position is selectable immediately, without a page reload.
    const [offices, setOffices] = useState(initialOffices);
    const [positions, setPositions] = useState(initialPositions);

    const [personal, setPersonal] = useState({
        name: "", date_of_birth: "", gender: "", nationality: "", job_grade: "",
        office_id: "", position_id: "", hire_date: "", position_effective_date: "",
        status: "Active", readiness_potential: "Medium", manager_id: "",
    });
    const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
    // Reports-to candidates for the "real management chain" (banner dimension)
    // — optional at creation time, but offering it here means a new hire can
    // land on the org chart immediately instead of surfacing as an unplaced
    // root node until someone remembers to set it from the profile later.
    const managerCandidates = useMemo(
        () => employees.filter((e) => e.status === "Active").slice().sort((a, b) => a.name.localeCompare(b.name)),
        [employees]
    );
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [comp, setComp] = useState(emptyComp());
    const [career, setCareer] = useState<NewEmployeeCareerEntry[]>([]);
    const [careerDraft, setCareerDraft] = useState(emptyCareerDraft());
    const [compHist, setCompHist] = useState<(CompHistoryInput & { key: number })[]>([]);
    const [compHistDraft, setCompHistDraft] = useState(emptyCompHistDraft());
    // Effective Date's month/day need their own state, independent of the
    // combined ISO string in compHistDraft — deriving them back out of that
    // string on every render meant picking only one of the two (say, the
    // month) had nothing to pair with yet, so isoFromParts returned null and
    // the just-picked month appeared to reset itself on the next render.
    const [effMonth, setEffMonth] = useState<number | "">("");
    const [effDay, setEffDay] = useState<number | "">("");
    const [education, setEducation] = useState<NewEmployeeBackgroundEntry[]>([]);
    const [certifications, setCertifications] = useState<NewEmployeeBackgroundEntry[]>([]);
    const [experience, setExperience] = useState<NewEmployeeBackgroundEntry[]>([]);
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [resumeDragOver, setResumeDragOver] = useState(false);

    // Quick-add company/office
    const [showAddOffice, setShowAddOffice] = useState(false);
    const [newOffice, setNewOffice] = useState({ banner_name: "", country: "", city: "" });
    const [addingOffice, setAddingOffice] = useState(false);
    // Quick-add position
    const [showAddPosition, setShowAddPosition] = useState(false);
    const [newPosition, setNewPosition] = useState({ title: "", function_id: "", req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5 });
    const [addingPosition, setAddingPosition] = useState(false);

    const bannerNames = useMemo(() => Array.from(new Set(offices.map((o) => o.banner_name))).sort(), [offices]);
    const selectedOffice = useMemo(() => offices.find((o) => String(o.office_id) === personal.office_id), [offices, personal.office_id]);
    // Positions are scoped per company now — once a company/office is picked,
    // only that company's positions are selectable (and creatable).
    const filteredPositions = useMemo(
        () => (selectedOffice ? positions.filter((p) => p.banner_id === selectedOffice.banner_id) : positions),
        [positions, selectedOffice]
    );

    function toggleAddOffice() {
        setShowAddOffice((v) => { if (v) setNewOffice({ banner_name: "", country: "", city: "" }); return !v; });
    }
    function toggleAddPosition() {
        if (!selectedOffice) { toast.error("Pick a company/office first — positions belong to a company"); return; }
        setShowAddPosition((v) => { if (v) setNewPosition({ title: "", function_id: "", req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5 }); return !v; });
    }

    const background = [...education, ...certifications, ...experience];
    const hasAnyData = personal.name.trim() !== "" || personal.office_id !== "" || personal.position_id !== ""
        || career.length > 0 || background.length > 0 || compHist.length > 0 || photoFile != null || resumeFile != null
        || Object.values(comp).some((v) => v !== "");

    function reset() {
        setStep(0);
        setPersonal({ name: "", date_of_birth: "", gender: "", nationality: "", job_grade: "", office_id: "", position_id: "", hire_date: "", position_effective_date: "", status: "Active", readiness_potential: "Medium", manager_id: "" });
        setPhotoFile(null);
        setComp(emptyComp());
        setCareer([]); setCareerDraft(emptyCareerDraft());
        setCompHist([]); setCompHistDraft(emptyCompHistDraft());
        setEffMonth(""); setEffDay("");
        setEducation([]); setCertifications([]); setExperience([]);
        setResumeFile(null);
        setShowAddOffice(false); setNewOffice({ banner_name: "", country: "", city: "" });
        setShowAddPosition(false); setNewPosition({ title: "", function_id: "", req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5 });
    }

    function requestClose() {
        if (hasAnyData) { setDiscardConfirmOpen(true); return; }
        reset();
        onOpenChange(false);
    }
    function confirmDiscard() {
        setDiscardConfirmOpen(false);
        reset();
        onOpenChange(false);
    }

    async function submitNewOffice() {
        if (!newOffice.banner_name.trim() || !newOffice.country.trim()) { toast.error("Company name and country are required"); return; }
        setAddingOffice(true);
        const res = await createCompanyOffice({ banner_name: newOffice.banner_name, country: newOffice.country, city: newOffice.city });
        setAddingOffice(false);
        if (!res.ok || !res.office) { toast.error(res.error || "Could not create company/office"); return; }
        setOffices((prev) => (prev.some((o) => o.office_id === res.office!.office_id) ? prev : [...prev, res.office!]));
        setPersonal((p) => ({ ...p, office_id: String(res.office!.office_id) }));
        setShowAddOffice(false);
        setNewOffice({ banner_name: "", country: "", city: "" });
        toast.success(`${res.office.banner_name} — ${res.office.country} added`);
    }

    async function submitNewPosition() {
        if (!newPosition.title.trim()) { toast.error("Position title is required"); return; }
        if (!selectedOffice) { toast.error("Pick a company/office first — positions belong to a company"); return; }
        setAddingPosition(true);
        const res = await createPosition({
            title: newPosition.title.trim(),
            banner_id: selectedOffice.banner_id,
            function_id: newPosition.function_id ? Number(newPosition.function_id) : null,
            req_leadership: newPosition.req_leadership, req_experiences: newPosition.req_experiences,
            req_skill: newPosition.req_skill, req_market: newPosition.req_market,
        });
        setAddingPosition(false);
        if (!res.ok || !res.id) { toast.error(res.error || "Could not create position"); return; }
        setPositions((prev) => [...prev, { id: res.id!, name: newPosition.title.trim(), banner_id: selectedOffice.banner_id }]);
        setPersonal((p) => ({ ...p, position_id: String(res.id) }));
        setShowAddPosition(false);
        setNewPosition({ title: "", function_id: "", req_leadership: 5, req_experiences: 5, req_skill: 5, req_market: 5 });
        toast.success(`"${newPosition.title.trim()}" added`);
    }

    function addCareerEntry() {
        if (!careerDraft.banner.trim() || !careerDraft.position.trim()) { toast.error("Company and position are required for a career entry"); return; }
        setCareer((prev) => [...prev, { ...careerDraft, location: careerDraft.location || null, start_date: careerDraft.start_date || null, end_date: careerDraft.end_date || null }]);
        setCareerDraft(emptyCareerDraft());
    }
    function addCompHistEntry() {
        if (!compHistDraft.fiscal_year) { toast.error("Fiscal year is required"); return; }
        if (compHist.some((c) => c.fiscal_year === compHistDraft.fiscal_year)) { toast.error(`FY${compHistDraft.fiscal_year} already added`); return; }
        setCompHist((prev) => [...prev, compHistDraft].sort((a, b) => a.fiscal_year - b.fiscal_year));
        setCompHistDraft(emptyCompHistDraft());
        setEffMonth(""); setEffDay("");
    }
    function addBackgroundEntry(kind: "education" | "certification" | "experience", draft: { title: string; organization: string; detail: string }, clear: () => void) {
        if (!draft.title.trim()) { toast.error("Title is required"); return; }
        const entry: NewEmployeeBackgroundEntry = { type: kind, title: draft.title.trim(), organization: draft.organization || null, detail: draft.detail || null };
        if (kind === "education") setEducation((prev) => [...prev, entry]);
        else if (kind === "certification") setCertifications((prev) => [...prev, entry]);
        else setExperience((prev) => [...prev, entry]);
        clear();
    }

    function validateStep1(): boolean {
        if (!personal.name.trim()) { toast.error("Name is required"); return false; }
        if (!personal.office_id) { toast.error("Company / office is required"); return false; }
        if (!personal.position_id) { toast.error("Position is required"); return false; }
        return true;
    }

    function next() {
        if (step === 0 && !validateStep1()) return;
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
    function back() { setStep((s) => Math.max(s - 1, 0)); }

    function handleResumeFile(file: File | null | undefined) {
        if (!file) return;
        const okType = /\.(pdf|doc|docx)$/i.test(file.name);
        if (!okType) { toast.error("Only PDF, DOC, or DOCX files are accepted"); return; }
        setResumeFile(file);
    }

    // STI/LTI are entered as % of base (how everyone actually talks about a
    // bonus target — "20% target"), matching Compensation History and
    // Proposals elsewhere in the app; € is always derived, never typed.
    const base = Number(comp.base_salary) || 0;
    const pctToAmt = (pct: number | "") => (pct === "" || !base ? 0 : Math.round((base * Number(pct)) / 100));
    const stiTargetAmt = pctToAmt(comp.sti_target);
    const ltiTargetAmt = pctToAmt(comp.lti_target);
    const totalComp = base + stiTargetAmt + ltiTargetAmt + (Number(comp.other_bonus) || 0);
    const amtHint = (pct: number | "") => (pct !== "" && base > 0 ? ` = €${pctToAmt(pct).toLocaleString()}` : "");

    // Compensation History (step 3) — Eligible/Actual % fields also compute a
    // live € hint, the same "type a %, see the money" pattern as step 1's
    // PctField, using that row's own Base Salary rather than step 1's.
    const histAmtHint = (pct: number | null) => (pct != null && compHistDraft.base_salary ? ` = €${Math.round((compHistDraft.base_salary * pct) / 100).toLocaleString()}` : "");

    // Effective Date only captures month/day — the year always comes from
    // Fiscal Year (already a field on this same step), so there's no
    // redundant year entry. effMonth/effDay (declared above) hold whichever
    // part has been picked so far; effective_date only gets written once
    // both are present.
    function isoFromParts(year: number, month: number | "", day: number | "") {
        if (month === "" || day === "") return null;
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    function setEffMonthDay(month: number | "", day: number | "") {
        setEffMonth(month);
        setEffDay(day);
        setCompHistDraft({ ...compHistDraft, effective_date: isoFromParts(compHistDraft.fiscal_year || CURRENT_YEAR, month, day) });
    }

    async function submit() {
        if (!validateStep1()) { setStep(0); return; }
        setSaving(true);
        const num = (v: number | "") => (v === "" ? null : Number(v));
        // sti_target/sti_max/lti_target/lti_max were entered as % of base —
        // convert to € here; the DB column (and every reader of it elsewhere
        // in the app) still expects a plain euro amount.
        const compPayload = Object.values(comp).some((v) => v !== "")
            ? {
                base_salary: num(comp.base_salary),
                sti_target: comp.sti_target === "" ? null : pctToAmt(comp.sti_target),
                sti_max: comp.sti_max === "" ? null : pctToAmt(comp.sti_max),
                lti_target: comp.lti_target === "" ? null : pctToAmt(comp.lti_target),
                lti_max: comp.lti_max === "" ? null : pctToAmt(comp.lti_max),
                other_bonus: num(comp.other_bonus),
                allowance_company_car: num(comp.allowance_company_car),
                allowance_mobility: num(comp.allowance_mobility),
                allowance_home_office: num(comp.allowance_home_office),
                allowance_private_medical: num(comp.allowance_private_medical),
                allowance_family_cover: comp.allowance_family_cover.trim() || null,
            }
            : null;
        const res = await createEmployeeFull({
            name: personal.name,
            office_id: Number(personal.office_id),
            position_id: Number(personal.position_id),
            date_of_birth: personal.date_of_birth || null,
            gender: personal.gender || null,
            nationality: personal.nationality || null,
            job_grade: personal.job_grade || null,
            hire_date: personal.hire_date || null,
            position_effective_date: personal.position_effective_date || null,
            status: personal.status,
            readiness_potential: personal.readiness_potential,
            compensation: compPayload,
            career_history: career,
            background,
        });
        if (!res.ok || !res.id) { setSaving(false); toast.error(res.error || "Could not create employee"); return; }

        // Labeled so a failure here can actually be reported — these used to
        // be fired with their results ignored, so e.g. a failed "Reports to"
        // save (silent on the server side too — see setEmployeeManager) left
        // the org chart wrong with no indication anything had gone wrong at
        // all; the success toast below said otherwise regardless.
        const followUps: { label: string; promise: Promise<{ ok: boolean; error?: string }> }[] = [];
        if (photoFile) { const fd = new FormData(); fd.append("file", photoFile); followUps.push({ label: "Photo", promise: uploadEmployeePhoto(res.id, fd) }); }
        if (resumeFile) { const fd = new FormData(); fd.append("file", resumeFile); followUps.push({ label: "Resume", promise: uploadEmployeeResume(res.id, fd) }); }
        if (personal.manager_id) followUps.push({ label: "Reports to", promise: setEmployeeManager(res.id, "banner", Number(personal.manager_id)) });
        for (const entry of compHist) {
            const { key, ...input } = entry as any;
            followUps.push({ label: "Compensation history", promise: upsertCompensationHistory(res.id, input) });
        }
        const failures: string[] = [];
        if (followUps.length) {
            const results = await Promise.all(followUps.map((f) => f.promise));
            results.forEach((r, i) => { if (!r.ok) failures.push(`${followUps[i].label}${r.error ? ` (${r.error})` : ""}`); });
        }

        setSaving(false);
        if (failures.length) {
            toast.warning(`${personal.name} added, but couldn't save: ${failures.join(", ")}. Fix these from their profile page.`);
        } else {
            toast.success(`${personal.name} added`);
        }
        reset();
        onOpenChange(false);
        router.refresh();
    }

    const officeLabel = offices.find((o) => String(o.office_id) === personal.office_id);
    const positionLabel = positions.find((p) => String(p.id) === personal.position_id);
    const managerLabel = managerCandidates.find((m) => String(m.employee_id) === personal.manager_id);

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) requestClose(); else onOpenChange(true); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>

                {/* Stepper */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {STEPS.map((label, i) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => { if (i <= step || validateStep1()) setStep(i); }}
                                className={cn(
                                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                                    i === step ? "bg-[#0b1f3a] text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                                )}
                            >
                                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </button>
                            <span className={cn("hidden text-[10.5px] font-medium whitespace-nowrap md:inline", i === step ? "text-[#0b1f3a]" : "text-slate-400")}>{label}</span>
                            {i < STEPS.length - 1 && <div className="h-px w-3 shrink-0 bg-slate-200" />}
                        </div>
                    ))}
                </div>

                <div className="max-h-[60vh] overflow-y-auto pr-1">
                    {step === 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    {photoFile ? (
                                        <img src={URL.createObjectURL(photoFile)} alt="" className="h-16 w-16 rounded-full object-cover" />
                                    ) : (
                                        <Camera className="h-6 w-6" />
                                    )}
                                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                        <Camera className="h-5 w-5" />
                                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                                    </label>
                                </div>
                                <div className="flex-1">
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
                                    <Input value={personal.name} onChange={(e) => setPersonal({ ...personal, name: e.target.value })} placeholder="Full name" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <div className="mb-1 flex items-center justify-between">
                                        <label className="text-xs font-medium text-slate-600">Company / Office *</label>
                                        <button type="button" onClick={toggleAddOffice} className="text-[11px] font-medium text-[#0b1f3a] hover:underline">+ New</button>
                                    </div>
                                    <select
                                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                        value={personal.office_id}
                                        onChange={(e) => {
                                            const office_id = e.target.value;
                                            const newBannerId = offices.find((o) => String(o.office_id) === office_id)?.banner_id ?? null;
                                            const stillValid = positions.some((p) => String(p.id) === personal.position_id && p.banner_id === newBannerId);
                                            setPersonal({ ...personal, office_id, position_id: stillValid ? personal.position_id : "" });
                                        }}
                                    >
                                        <option value="">— select —</option>
                                        {offices.map((o) => <option key={o.office_id} value={o.office_id}>{o.banner_name} — {o.country}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div className="mb-1 flex items-center justify-between">
                                        <label className="text-xs font-medium text-slate-600">Position *</label>
                                        <button type="button" onClick={toggleAddPosition} className="text-[11px] font-medium text-[#0b1f3a] hover:underline">+ New</button>
                                    </div>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={personal.position_id} onChange={(e) => setPersonal({ ...personal, position_id: e.target.value })} disabled={!selectedOffice}>
                                        <option value="">{selectedOffice ? "— select —" : "— pick company/office first —"}</option>
                                        {filteredPositions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>

                                {showAddOffice && (
                                    <div className="sm:col-span-2 space-y-2 rounded-lg border border-dashed p-3">
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                            <Combobox options={bannerNames} value={newOffice.banner_name || null} onChange={(v) => setNewOffice({ ...newOffice, banner_name: v || "" })} placeholder="Company name" searchPlaceholder="Search or type new…" />
                                            <Combobox options={COUNTRIES} value={newOffice.country || null} onChange={(v) => setNewOffice({ ...newOffice, country: v || "" })} placeholder="Country" searchPlaceholder="Search country…" />
                                            <Input value={newOffice.city} onChange={(e) => setNewOffice({ ...newOffice, city: e.target.value })} placeholder="City (optional)" />
                                        </div>
                                        <p className="text-[11px] text-slate-400">If the company already exists, this just adds a new country office for it.</p>
                                        <Button size="sm" className="gap-1.5" style={{ backgroundColor: "#0b1f3a" }} disabled={addingOffice} onClick={submitNewOffice}>
                                            {addingOffice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create &amp; select
                                        </Button>
                                    </div>
                                )}
                                {showAddPosition && (
                                    <div className="sm:col-span-2 space-y-2 rounded-lg border border-dashed p-3">
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <Input value={newPosition.title} onChange={(e) => setNewPosition({ ...newPosition, title: e.target.value })} placeholder="Position title" />
                                            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={newPosition.function_id} onChange={(e) => setNewPosition({ ...newPosition, function_id: e.target.value })}>
                                                <option value="">— function (optional) —</option>
                                                {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <ReqField label="Leadership" value={newPosition.req_leadership} onChange={(v) => setNewPosition({ ...newPosition, req_leadership: v })} />
                                            <ReqField label="Experience" value={newPosition.req_experiences} onChange={(v) => setNewPosition({ ...newPosition, req_experiences: v })} />
                                            <ReqField label="Skill" value={newPosition.req_skill} onChange={(v) => setNewPosition({ ...newPosition, req_skill: v })} />
                                            <ReqField label="Market" value={newPosition.req_market} onChange={(v) => setNewPosition({ ...newPosition, req_market: v })} />
                                        </div>
                                        <Button size="sm" className="gap-1.5" style={{ backgroundColor: "#0b1f3a" }} disabled={addingPosition} onClick={submitNewPosition}>
                                            {addingPosition ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create &amp; select
                                        </Button>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600" title="The real management chain — same as the 'Company (Banner)' dimension on the profile's Org Snapshot. Leave blank to place them on the org chart later.">Reports to (optional)</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={personal.manager_id} onChange={(e) => setPersonal({ ...personal, manager_id: e.target.value })}>
                                        <option value="">— set later on the org chart —</option>
                                        {managerCandidates.map((m) => (
                                            <option key={m.employee_id} value={m.employee_id}>{m.name}{m.position_title ? ` · ${m.position_title}` : ""}{m.banner_name ? ` · ${m.banner_name}` : ""}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Job Grade</label>
                                    <Input value={personal.job_grade} onChange={(e) => setPersonal({ ...personal, job_grade: e.target.value })} placeholder="e.g. Exec, Manager" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Gender</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={personal.gender} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })}>
                                        <option value="">—</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Nationality</label>
                                    <Combobox options={COUNTRIES} value={personal.nationality || null} onChange={(v) => setPersonal({ ...personal, nationality: v || "" })} placeholder={officeLabel?.country || "Select…"} searchPlaceholder="Search country…" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
                                    <Input type="date" value={personal.date_of_birth} onChange={(e) => setPersonal({ ...personal, date_of_birth: e.target.value })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Hire Date</label>
                                    <Input type="date" value={personal.hire_date} onChange={(e) => setPersonal({ ...personal, hire_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Current Job Effective Date</label>
                                    <Input type="date" value={personal.position_effective_date} onChange={(e) => setPersonal({ ...personal, position_effective_date: e.target.value })} placeholder="defaults to hire date" />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={personal.status} onChange={(e) => setPersonal({ ...personal, status: e.target.value })}>
                                        <option>Active</option><option>Resigned</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-slate-600" title="Succession-readiness rating — feeds the Readiness Pipeline breakdown on the dashboard and the Succession Plan pages.">Readiness</label>
                                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={personal.readiness_potential} onChange={(e) => setPersonal({ ...personal, readiness_potential: e.target.value })}>
                                        <option>High</option><option>Medium</option><option>Low</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-3">
                            <p className="text-[12.5px] text-muted-foreground">Optional — can be filled in later from the profile page.</p>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
                                <span className="text-slate-500">Total Compensation (calculated)</span>
                                <span className="ml-2 font-bold text-[#0b1f3a]">€{totalComp.toLocaleString()}</span>
                                <div className="mt-0.5 text-[10.5px] text-slate-400">= Base Salary + STI Target + LTI Target + Other Bonus (allowances &amp; benefits not included)</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <CompField label="Base Salary" value={comp.base_salary} onChange={(v) => setComp({ ...comp, base_salary: v })} />
                                <PctField label="STI Target" value={comp.sti_target} onChange={(v) => setComp({ ...comp, sti_target: v })} hint={amtHint(comp.sti_target)} />
                                <PctField label="STI Max" value={comp.sti_max} onChange={(v) => setComp({ ...comp, sti_max: v })} hint={amtHint(comp.sti_max)} />
                                <PctField label="LTI Target" value={comp.lti_target} onChange={(v) => setComp({ ...comp, lti_target: v })} hint={amtHint(comp.lti_target)} />
                                <PctField label="LTI Max" value={comp.lti_max} onChange={(v) => setComp({ ...comp, lti_max: v })} hint={amtHint(comp.lti_max)} />
                                <CompField label="Other Bonus" value={comp.other_bonus} onChange={(v) => setComp({ ...comp, other_bonus: v })} />
                                <CompField label="Allowance · Car" value={comp.allowance_company_car} onChange={(v) => setComp({ ...comp, allowance_company_car: v })} />
                                <CompField label="Allowance · Mobile" value={comp.allowance_mobility} onChange={(v) => setComp({ ...comp, allowance_mobility: v })} />
                                <CompField label="Allowance · Housing" value={comp.allowance_home_office} onChange={(v) => setComp({ ...comp, allowance_home_office: v })} />
                                <CompField label="Benefit · Medical" value={comp.allowance_private_medical} onChange={(v) => setComp({ ...comp, allowance_private_medical: v })} />
                                <div className="sm:col-span-3">
                                    <label className="mb-1 block truncate text-[10px] text-muted-foreground" title="Other benefit (please specify)">Other benefit (please specify)</label>
                                    <Input className="h-9" value={comp.allowance_family_cover} onChange={(e) => setComp({ ...comp, allowance_family_cover: e.target.value })} placeholder="e.g. gym membership, transport pass…" />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-3">
                            <p className="text-[12.5px] text-muted-foreground">Optional — salary review history for past fiscal years (useful when backfilling someone who's already been with the company for a while). STI/LTI amounts and Total Comp are calculated from the % fields, same as the profile page.</p>
                            <div className="space-y-2 rounded-lg border p-3">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <NumField
                                        label="Fiscal Year"
                                        value={compHistDraft.fiscal_year}
                                        onChange={(v) => {
                                            const fiscal_year = v ?? CURRENT_YEAR;
                                            // Effective Date only captures month/day (see below) — its year always
                                            // tracks Fiscal Year, so re-derive it here too if a date's already set.
                                            const effective_date = effMonth !== "" && effDay !== "" ? isoFromParts(fiscal_year, effMonth, effDay) : compHistDraft.effective_date;
                                            setCompHistDraft({ ...compHistDraft, fiscal_year, effective_date });
                                        }}
                                    />
                                    <div>
                                        <label className="mb-1 block text-[10px] text-muted-foreground">Effective Date (year = Fiscal Year above)</label>
                                        <div className="flex gap-1">
                                            <select
                                                className="h-9 w-full rounded-md border bg-background px-1.5 text-sm"
                                                value={effMonth}
                                                onChange={(e) => setEffMonthDay(e.target.value === "" ? "" : Number(e.target.value), effDay)}
                                            >
                                                <option value="">MMM</option>
                                                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                            </select>
                                            <Input
                                                type="number" min={1} max={31} placeholder="DD" className="h-9 w-16"
                                                value={effDay}
                                                onChange={(e) => setEffMonthDay(effMonth, e.target.value === "" ? "" : Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                    <NumField label="Base Salary (€)" value={compHistDraft.base_salary} onChange={(v) => setCompHistDraft({ ...compHistDraft, base_salary: v })} />
                                    <NumField label="Cash Allowance (€)" value={compHistDraft.cash_allowance} onChange={(v) => setCompHistDraft({ ...compHistDraft, cash_allowance: v })} />
                                    <NumField label="STI Eligible %" value={compHistDraft.sti_eligible_pct} onChange={(v) => setCompHistDraft({ ...compHistDraft, sti_eligible_pct: v })} hint={histAmtHint(compHistDraft.sti_eligible_pct)} />
                                    <NumField label="STI Actual %" value={compHistDraft.sti_actual_pct} onChange={(v) => setCompHistDraft({ ...compHistDraft, sti_actual_pct: v })} hint={histAmtHint(compHistDraft.sti_actual_pct)} />
                                    <NumField label="LTI Eligible %" value={compHistDraft.lti_eligible_pct} onChange={(v) => setCompHistDraft({ ...compHistDraft, lti_eligible_pct: v })} hint={histAmtHint(compHistDraft.lti_eligible_pct)} />
                                    <NumField label="LTI Actual %" value={compHistDraft.lti_actual_pct} onChange={(v) => setCompHistDraft({ ...compHistDraft, lti_actual_pct: v })} hint={histAmtHint(compHistDraft.lti_actual_pct)} />
                                    <NumField label="Pension (€)" value={compHistDraft.pension_contribution} onChange={(v) => setCompHistDraft({ ...compHistDraft, pension_contribution: v })} />
                                    <div className="col-span-2 sm:col-span-3">
                                        <label className="mb-1 block text-[10px] text-muted-foreground">Note</label>
                                        <Input className="h-9" value={compHistDraft.note || ""} onChange={(e) => setCompHistDraft({ ...compHistDraft, note: e.target.value || null })} />
                                    </div>
                                </div>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={addCompHistEntry}><Plus className="h-3.5 w-3.5" /> Add fiscal year</Button>
                            </div>
                            {compHist.length > 0 && (
                                <div className="divide-y divide-slate-100 rounded-lg border">
                                    {compHist.map((c) => {
                                        const stiAmt = c.base_salary && c.sti_actual_pct ? Math.round((c.base_salary * c.sti_actual_pct) / 100) : 0;
                                        const ltiAmt = c.base_salary && c.lti_actual_pct ? Math.round((c.base_salary * c.lti_actual_pct) / 100) : 0;
                                        const total = (c.base_salary ?? 0) + stiAmt + ltiAmt;
                                        return (
                                            <div key={c.fiscal_year} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-[#0f172a]">FY{c.fiscal_year} — €{total.toLocaleString()} total</div>
                                                    <div className="text-[11px] text-slate-400">Base €{(c.base_salary ?? 0).toLocaleString()}{c.note ? ` · ${c.note}` : ""}</div>
                                                </div>
                                                <button onClick={() => setCompHist((prev) => prev.filter((x) => x.fiscal_year !== c.fiscal_year))} className="shrink-0 text-red-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            <p className="text-[12.5px] text-muted-foreground">Optional — previous roles (internal or external), any order.</p>
                            <div className="space-y-2 rounded-lg border p-3">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <Input value={careerDraft.banner} onChange={(e) => setCareerDraft({ ...careerDraft, banner: e.target.value })} placeholder="Company / employer" />
                                    <Input value={careerDraft.position} onChange={(e) => setCareerDraft({ ...careerDraft, position: e.target.value })} placeholder="Position" />
                                    <Combobox options={COUNTRIES} value={careerDraft.location || null} onChange={(v) => setCareerDraft({ ...careerDraft, location: v || "" })} placeholder="Location" searchPlaceholder="Search country, or type a city too…" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input type="date" value={careerDraft.start_date} onChange={(e) => setCareerDraft({ ...careerDraft, start_date: e.target.value })} />
                                        <Input type="date" value={careerDraft.end_date} onChange={(e) => setCareerDraft({ ...careerDraft, end_date: e.target.value })} />
                                    </div>
                                </div>
                                <Button size="sm" variant="outline" className="gap-1.5" onClick={addCareerEntry}><Plus className="h-3.5 w-3.5" /> Add entry</Button>
                            </div>
                            {career.length > 0 && (
                                <div className="divide-y divide-slate-100 rounded-lg border">
                                    {career.map((h, i) => (
                                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                                            <div className="min-w-0">
                                                <div className="font-medium text-[#0f172a]">{h.position} · {h.banner}</div>
                                                <div className="text-[11px] text-slate-400">{[h.location, h.start_date, h.end_date].filter(Boolean).join(" · ")}</div>
                                            </div>
                                            <button onClick={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-red-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <BackgroundSection title="Education" placeholder="e.g. MBA, BSc Economics" entries={education} onAdd={(d) => addBackgroundEntry("education", d, () => {})} onRemove={(i) => setEducation((prev) => prev.filter((_, idx) => idx !== i))} />
                            <BackgroundSection title="Certifications" placeholder="e.g. PMP, CFA Level 2" entries={certifications} onAdd={(d) => addBackgroundEntry("certification", d, () => {})} onRemove={(i) => setCertifications((prev) => prev.filter((_, idx) => idx !== i))} />
                            <BackgroundSection title="Notable Experience" placeholder="e.g. Led APAC expansion" entries={experience} onAdd={(d) => addBackgroundEntry("experience", d, () => {})} onRemove={(i) => setExperience((prev) => prev.filter((_, idx) => idx !== i))} />

                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Résumé / CV</label>
                                {resumeFile ? (
                                    <div className="flex items-center justify-between gap-2 rounded-lg border p-3 text-[12.5px]">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                            <span className="truncate font-medium text-[#0f172a]">{resumeFile.name}</span>
                                        </div>
                                        <button onClick={() => setResumeFile(null)} className="shrink-0 text-slate-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                                    </div>
                                ) : (
                                    <label
                                        onDragOver={(e) => { e.preventDefault(); setResumeDragOver(true); }}
                                        onDragLeave={() => setResumeDragOver(false)}
                                        onDrop={(e) => { e.preventDefault(); setResumeDragOver(false); handleResumeFile(e.dataTransfer.files?.[0]); }}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-[12.5px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50",
                                            resumeDragOver && "border-[#0b1f3a] bg-slate-50"
                                        )}
                                    >
                                        <FileUp className="h-4 w-4" /> Drag &amp; drop, or click to attach a PDF or Word file (max 10MB)
                                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => handleResumeFile(e.target.files?.[0])} />
                                    </label>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4 text-[12.5px]">
                            <ReviewSection title="Personal & Employment">
                                <ReviewRow label="Name" value={personal.name} />
                                <ReviewRow label="Company / Office" value={officeLabel ? `${officeLabel.banner_name} — ${officeLabel.country}` : "—"} />
                                <ReviewRow label="Position" value={positionLabel?.name || "—"} />
                                <ReviewRow label="Reports to" value={managerLabel?.name || "— set later on the org chart —"} />
                                <ReviewRow label="Job Grade" value={personal.job_grade || "—"} />
                                <ReviewRow label="Gender" value={personal.gender || "—"} />
                                <ReviewRow label="Nationality" value={personal.nationality || officeLabel?.country || "—"} />
                                <ReviewRow label="Date of Birth" value={personal.date_of_birth || "—"} />
                                <ReviewRow label="Hire Date" value={personal.hire_date || "—"} />
                                <ReviewRow label="Status" value={personal.status} />
                                <ReviewRow label="Readiness" value={personal.readiness_potential} />
                                <ReviewRow label="Photo" value={photoFile ? photoFile.name : "—"} />
                            </ReviewSection>
                            <ReviewSection title="Compensation & Benefits">
                                {Object.values(comp).some((v) => v !== "") ? (
                                    <>
                                        <ReviewRow label="Total Compensation (calculated)" value={`€${totalComp.toLocaleString()}`} />
                                        {comp.base_salary !== "" && <ReviewRow label="Base Salary" value={`€${Number(comp.base_salary).toLocaleString()}`} />}
                                        {comp.sti_target !== "" && <ReviewRow label="STI Target" value={`${comp.sti_target}% (€${stiTargetAmt.toLocaleString()})`} />}
                                        {comp.sti_max !== "" && <ReviewRow label="STI Max" value={`${comp.sti_max}% (€${pctToAmt(comp.sti_max).toLocaleString()})`} />}
                                        {comp.lti_target !== "" && <ReviewRow label="LTI Target" value={`${comp.lti_target}% (€${ltiTargetAmt.toLocaleString()})`} />}
                                        {comp.lti_max !== "" && <ReviewRow label="LTI Max" value={`${comp.lti_max}% (€${pctToAmt(comp.lti_max).toLocaleString()})`} />}
                                        {comp.other_bonus !== "" && <ReviewRow label="Other Bonus" value={`€${Number(comp.other_bonus).toLocaleString()}`} />}
                                        {comp.allowance_company_car !== "" && <ReviewRow label="Allowance · Car" value={`€${Number(comp.allowance_company_car).toLocaleString()}`} />}
                                        {comp.allowance_mobility !== "" && <ReviewRow label="Allowance · Mobile" value={`€${Number(comp.allowance_mobility).toLocaleString()}`} />}
                                        {comp.allowance_home_office !== "" && <ReviewRow label="Allowance · Housing" value={`€${Number(comp.allowance_home_office).toLocaleString()}`} />}
                                        {comp.allowance_private_medical !== "" && <ReviewRow label="Benefit · Medical" value={`€${Number(comp.allowance_private_medical).toLocaleString()}`} />}
                                        {comp.allowance_family_cover.trim() !== "" && <ReviewRow label="Other benefit" value={comp.allowance_family_cover} />}
                                    </>
                                ) : <p className="text-slate-400">Not entered</p>}
                            </ReviewSection>
                            <ReviewSection title="Compensation History">
                                {compHist.length ? (
                                    <div className="space-y-1">
                                        {compHist.map((c) => {
                                            const stiAmt = c.base_salary && c.sti_actual_pct ? Math.round((c.base_salary * c.sti_actual_pct) / 100) : 0;
                                            const ltiAmt = c.base_salary && c.lti_actual_pct ? Math.round((c.base_salary * c.lti_actual_pct) / 100) : 0;
                                            const total = (c.base_salary ?? 0) + stiAmt + ltiAmt;
                                            return <ReviewRow key={c.fiscal_year} label={`FY${c.fiscal_year}`} value={`€${total.toLocaleString()} total (base €${(c.base_salary ?? 0).toLocaleString()})`} />;
                                        })}
                                    </div>
                                ) : <p className="text-slate-400">Not entered</p>}
                            </ReviewSection>
                            <ReviewSection title="Career History">
                                {career.length ? (
                                    <div className="space-y-1">
                                        {career.map((h, i) => (
                                            <ReviewRow key={i} label={`${h.position} · ${h.banner}`} value={[h.location, h.start_date, h.end_date].filter(Boolean).join(" · ") || "—"} />
                                        ))}
                                    </div>
                                ) : <p className="text-slate-400">Not entered</p>}
                            </ReviewSection>
                            <ReviewSection title="Background & Résumé">
                                {background.length > 0 ? (
                                    <div className="space-y-1">
                                        {background.map((b, i) => (
                                            <ReviewRow key={i} label={`${b.type[0].toUpperCase()}${b.type.slice(1)} · ${b.title}`} value={[b.organization, b.detail].filter(Boolean).join(" · ") || "—"} />
                                        ))}
                                    </div>
                                ) : <p className="text-slate-400">Not entered</p>}
                                <ReviewRow label="Résumé" value={resumeFile ? resumeFile.name : "—"} />
                            </ReviewSection>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                    <Button variant="ghost" onClick={requestClose}>Cancel</Button>
                    <div className="flex gap-2">
                        {step > 0 && <Button variant="outline" className="gap-1.5" onClick={back}><ChevronLeft className="h-4 w-4" /> Back</Button>}
                        {step < STEPS.length - 1 ? (
                            <Button className="gap-1.5" style={{ backgroundColor: "#0b1f3a" }} onClick={next}>Next <ChevronRight className="h-4 w-4" /></Button>
                        ) : (
                            <Button className="gap-1.5" style={{ backgroundColor: "#0b1f3a" }} disabled={saving} onClick={submit}>
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Employee
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>

            <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Discard this new employee?</AlertDialogTitle>
                        <AlertDialogDescription>Nothing entered has been saved yet.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDiscard}>Discard</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Dialog>
    );
}

function CompField({ label, value, onChange, hint }: { label: string; value: number | ""; onChange: (v: number | "") => void; hint?: string }) {
    return (
        <div>
            <label className="mb-1 block truncate text-[10px] text-muted-foreground" title={label}>{label} (€)</label>
            <Input type="number" className="h-9" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
            {hint && <div className="mt-0.5 text-[9.5px] text-slate-400">{hint}</div>}
        </div>
    );
}
// STI/LTI are entered as % of base, not € — matches Compensation History and
// Proposals, where a bonus is always expressed as a target %, and the euro
// figure is shown only as a derived readout underneath, never typed directly.
function PctField({ label, value, onChange, hint }: { label: string; value: number | ""; onChange: (v: number | "") => void; hint?: string }) {
    return (
        <div>
            <label className="mb-1 block truncate text-[10px] text-muted-foreground" title={label}>{label} (%)</label>
            <Input type="number" className="h-9" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
            {hint && <div className="mt-0.5 text-[9.5px] text-slate-400">{hint}</div>}
        </div>
    );
}
function NumField({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
    return (
        <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">{label}</label>
            <Input type="number" className="h-9" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
            {hint && <div className="mt-0.5 text-[9.5px] text-slate-400">{hint}</div>}
        </div>
    );
}
function ReqField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">{label} (1–10)</label>
            <Input type="number" min={1} max={10} className="h-9" value={value} onChange={(e) => onChange(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
    );
}

function BackgroundSection({ title, placeholder, entries, onAdd, onRemove }: {
    title: string; placeholder: string; entries: NewEmployeeBackgroundEntry[];
    onAdd: (draft: { title: string; organization: string; detail: string }) => void; onRemove: (index: number) => void;
}) {
    const [draft, setDraft] = useState({ title: "", organization: "", detail: "" });
    function add() { onAdd(draft); setDraft({ title: "", organization: "", detail: "" }); }
    return (
        <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
            <div className="space-y-2 rounded-lg border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={placeholder} />
                    <Input value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} placeholder="Organization" />
                    <Input value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="Detail (optional)" />
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={add}><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
            {entries.length > 0 && (
                <div className="divide-y divide-slate-100 rounded-lg border">
                    {entries.map((b, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                            <div className="min-w-0">
                                <div className="font-medium text-[#0f172a]">{b.title}</div>
                                <div className="text-[11px] text-slate-400">{[b.organization, b.detail].filter(Boolean).join(" · ")}</div>
                            </div>
                            <button onClick={() => onRemove(i)} className="shrink-0 text-red-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
            <div className="space-y-1">{children}</div>
        </div>
    );
}
function ReviewRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-[#0f172a]">{value}</span>
        </div>
    );
}
