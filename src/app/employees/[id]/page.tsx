import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmployee } from "@/app/actions/employees";
import { listDepartments } from "@/app/actions/departments";
import { listOffices, getFunctionSummary, getFunctionHeadId } from "@/app/actions/org";
import { Card } from "@/components/ui/card";
import { InsightsCard } from "@/components/insights-card";
import { ScoresCard } from "@/components/scores-card";
import { DepartmentsManagedCard } from "@/components/departments-managed-card";
import { PositionsCard } from "@/components/positions-card";
import { listPositionCandidates } from "@/app/actions/employee-positions";
import { CareerHistoryCard } from "@/components/career-history-card";
import { BackgroundCard } from "@/components/background-card";
import { CompensationHistoryCard } from "@/components/compensation-history-card";
import { PersonalEmploymentCard } from "@/components/personal-employment-card";
import { CompensationBenefitsCard } from "@/components/compensation-benefits-card";
import { PerformanceCard } from "@/components/performance-card";
import { PerformanceTargetsCard } from "@/components/performance-targets-card";
import { listCycles, getEmployeeTargets } from "@/app/actions/performance";
import { EmployeeStatusBadge } from "@/components/employee-status-badge";
import { TagColorPicker } from "@/components/tag-color-picker";
import { PhotoUpload } from "@/components/photo-upload";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { OrgPlacementEditor } from "@/components/org-placement-editor";
import { FunctionHeadToggle } from "@/components/function-head-toggle";
import { FullOrgButton } from "@/components/full-org-button";
import { EmployeeDocumentsCard } from "@/components/employee-documents-card";
import { listEmployeeDocuments } from "@/app/actions/employee-documents";
import { listFolders } from "@/app/actions/document-folders";
import { ProfileActions } from "./profile-actions";
import { formatDate, formatYears, yearsBetween } from "@/lib/format";
import { Money } from "@/components/comp-visibility";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canSeeComp, canSeePersonal } from "@/lib/permissions";
import { Euro, CalendarDays, Star, Users, Rocket, ChevronLeft, Building2, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getEmployeeIcpd } from "@/app/actions/icpd";
import { DevelopmentPlansCard } from "@/components/icpd-development-plans-card";
import { AchievementsCard } from "@/components/icpd-achievements-card";
import { PeriodicAssessmentCard } from "@/components/icpd-periodic-assessment-card";
import { CompetenciesCard } from "@/components/icpd-competencies-card";
import { CareerStepsCard } from "@/components/icpd-career-steps-card";
import { SuccessionPositionsCard } from "@/components/icpd-succession-positions-card";
import { MentorMobilityCard } from "@/components/icpd-mentor-mobility-card";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [emp, allDepartments, offices, functions, user, positionCandidates] = await Promise.all([
        getEmployee(Number(id)), listDepartments(), listOffices(), getFunctionSummary(), getCurrentUser(), listPositionCandidates(),
    ]);
    const canEditComp = canSeeComp(user);
    const canEditPersonal = canSeePersonal(user);
    if (!emp) notFound();
    const ownedDepartments = allDepartments.filter((d) => d.owner_employee_id === emp.employee_id);
    const [functionHeadId, employeeDocuments, employeeDocFolders, cycles, icpd] = await Promise.all([
        emp.function_id ? getFunctionHeadId(emp.function_id) : Promise.resolve(null),
        listEmployeeDocuments(emp.employee_id),
        listFolders(emp.employee_id),
        listCycles(),
        getEmployeeIcpd(emp.employee_id),
    ]);
    // Targets are shown for the current review cycle only — the card is a
    // snapshot of "this year", with /performance as the place to see any other.
    const currentCycle = cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
    const targetSeats = currentCycle ? await getEmployeeTargets(emp.employee_id, currentCycle.cycle_id) : [];

    const stats = [
        { icon: Euro, label: "Total Compensation", value: <Money value={emp.total_compensation} />, sub: "Total Annual Comp" },
        { icon: CalendarDays, label: "Years of Service", value: formatYears(emp.hire_date), sub: `Since ${formatDate(emp.hire_date)}` },
        { icon: Star, label: "Current Performance", value: emp.latest_grade || "-", sub: `FY${latestFy(emp.performance)} Grade` },
        { icon: Users, label: "Team Size", value: String(emp.team_size), sub: "Direct Reports" },
        { icon: Rocket, label: "Readiness / Potential", value: emp.readiness_potential || "-", sub: "Leadership Potential" },
    ];

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Page header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    <Link href="/employees" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-[#0b1f3a] font-medium transition-colors">
                        <ChevronLeft className="h-4 w-4" /> Employees
                    </Link>
                    <span className="text-slate-300">/</span>
                    <h1 className="text-[20px] sm:text-[22px] font-extrabold text-[#0b1f3a] tracking-tight">{emp.name}</h1>
                    <EmployeeStatusBadge employeeId={emp.employee_id} status={emp.status} resignDate={emp.resign_date} resignReason={emp.resignation_reason} />
                    <TagColorPicker employeeId={emp.employee_id} tagColor={emp.tag_color} />
                </div>
                <ProfileActions employee={emp} canSeePersonal={canEditPersonal} />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-2">

                {/* Hero strip: photo card + 5 stat cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:1.1fr_repeat(5,1fr)] gap-3.5">
                    <Card className="flex items-center gap-3.5 p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                        <PhotoUpload employeeId={emp.employee_id} name={emp.name} photo={emp.photo} size={64} />
                        <div className="min-w-0">
                            <div className="text-[14px] font-bold text-[#0b1f3a] leading-tight">{emp.position_title}</div>
                            <div className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-slate-500">
                                <span className="flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0" /> {emp.banner_name}</span>
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /> {[emp.country, emp.city].filter(Boolean).join(", ")}</span>
                            </div>
                        </div>
                    </Card>
                    {stats.map((s) => {
                        const Icon = s.icon;
                        return (
                            <Card key={s.label} className="flex flex-col justify-center p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="h-7 w-7 rounded-[7px] bg-[#0b1f3a]/[.07] flex items-center justify-center shrink-0">
                                        <Icon className="h-3.5 w-3.5 text-[#0b1f3a]" />
                                    </div>
                                    <span className="text-[10.5px] font-semibold text-slate-500 leading-tight">{s.label}</span>
                                </div>
                                <div className="text-[20px] font-extrabold text-[#0b1f3a] tabular-nums leading-none">{s.value}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
                            </Card>
                        );
                    })}
                </div>

                <Tabs defaultValue="profile">
                    <TabsList>
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                        <TabsTrigger value="icpd">ICPD</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4">

                {/* Lower grid: Personal / Comp / (Perf+Org) / Insights */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                    {/* Personal + Positions stacked */}
                    <div className="flex flex-col gap-3.5">
                        <PersonalEmploymentCard
                            employeeId={emp.employee_id}
                            data={{
                                date_of_birth: emp.date_of_birth,
                                hire_date: emp.hire_date,
                                position_effective_date: emp.position_effective_date,
                                nationality: emp.nationality,
                                gender: emp.gender,
                                country: emp.country,
                                city: emp.city,
                                job_grade: emp.job_grade,
                                retirement_age: emp.retirement_age,
                            }}
                            canSeePersonal={canEditPersonal}
                        />
                        <PositionsCard
                            employeeId={emp.employee_id}
                            positions={emp.positions}
                            offices={offices}
                            functions={functions.map((f) => ({ function_id: f.function_id, name: f.name }))}
                            candidates={positionCandidates}
                        />
                    </div>

                    {/* Compensation */}
                    <CompensationBenefitsCard employeeId={emp.employee_id} compensation={emp.compensation} totalCompensation={emp.total_compensation} canEdit={canEditComp} />

                    {/* Performance + Scores stacked */}
                    <div className="flex flex-col gap-3.5">
                        <PerformanceCard employeeId={emp.employee_id} performance={emp.performance} canEdit={canEditComp} />

                        {currentCycle && <PerformanceTargetsCard seats={targetSeats} cycleName={currentCycle.name} />}

                        <Card className="flex-1 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                                <span>Org Snapshot</span>
                                <div className="flex items-center gap-1.5">
                                    <FullOrgButton employeeId={emp.employee_id} employeeName={emp.name} />
                                    <OrgPlacementEditor employeeId={emp.employee_id} employeeName={emp.name} />
                                </div>
                            </div>
                            <div className="flex flex-col items-center p-3.5">
                                {emp.function_id && emp.function_name && (
                                    <div className="mb-2.5 self-start">
                                        <FunctionHeadToggle
                                            functionId={emp.function_id}
                                            functionName={emp.function_name}
                                            employeeId={emp.employee_id}
                                            isHead={functionHeadId === emp.employee_id}
                                        />
                                    </div>
                                )}
                                {!emp.manager && !emp.functionManager && emp.reports.length === 0 && (
                                    <p className="mb-2 text-center text-[11px] text-slate-400">
                                        Not connected to the org chart yet — use Edit to set who they report to.
                                    </p>
                                )}
                                {emp.manager && (
                                    <>
                                        <Link href={`/employees/${emp.manager.employee_id}`} className="block">
                                            <div className="flex items-center gap-2 rounded-[7px] border bg-slate-50 px-2.5 py-1.5 text-[12px] hover:bg-slate-100 transition-colors">
                                                <EmployeeAvatar name={emp.manager.name} photo={emp.manager.photo} size={24} />
                                                <div><div className="font-semibold text-slate-700 leading-tight">{emp.manager.name}</div>
                                                <div className="text-[9.5px] text-slate-400">{emp.manager.position_title}</div></div>
                                            </div>
                                        </Link>
                                        <div className="w-px h-3 bg-black" />
                                    </>
                                )}
                                {emp.functionManager && (
                                    <>
                                        <Link href={`/employees/${emp.functionManager.employee_id}`} className="block">
                                            <div className="flex items-center gap-2 rounded-[7px] border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[12px] hover:bg-slate-100 transition-colors">
                                                <EmployeeAvatar name={emp.functionManager.name} photo={emp.functionManager.photo} size={20} />
                                                <div><div className="font-semibold text-slate-700 leading-tight">{emp.functionManager.name}</div>
                                                <div className="text-[9px] text-slate-400">Head of Function{emp.functionManager.cross_banner ? " · other company" : ""}</div></div>
                                            </div>
                                        </Link>
                                        <div className={`w-px h-3 ${emp.functionManager.cross_banner ? "border-l border-dashed border-black" : "bg-black"}`} />
                                    </>
                                )}

                                <div className="flex items-center gap-2 rounded-[7px] border-2 border-[#0b1f3a] bg-white px-2.5 py-1.5 text-[12px] shadow-sm">
                                    <EmployeeAvatar name={emp.name} photo={emp.photo} size={26} />
                                    <div><div className="font-bold text-[#0b1f3a] leading-tight">{emp.name}</div>
                                    <div className="text-[10px] text-slate-500">{emp.position_title}</div></div>
                                </div>

                                {emp.reports.length > 0 && (
                                    <>
                                        <div className="w-px h-3 bg-black" />
                                        <div className="w-full overflow-x-auto">
                                            <div className="flex justify-center gap-3 w-max mx-auto">
                                                {emp.reports.map((r, i) => (
                                                    <div key={r.employee_id} className="relative flex flex-col items-center pt-3">
                                                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-px h-3 ${r.cross_banner ? "border-l border-dashed border-black" : "bg-black"}`} />
                                                        {i > 0 && <div className="absolute top-0 right-1/2 h-px bg-black" style={{ width: "calc(50% + 6px)" }} />}
                                                        {i < emp.reports.length - 1 && <div className="absolute top-0 left-1/2 h-px bg-black" style={{ width: "calc(50% + 6px)" }} />}
                                                        <Link href={`/employees/${r.employee_id}`}>
                                                            <div className={`flex w-[74px] flex-col items-center gap-1 rounded-[6px] border p-1.5 text-center hover:bg-slate-50 transition-colors ${r.status !== "Active" ? "opacity-50" : ""}`}>
                                                                <EmployeeAvatar name={r.name} photo={r.photo} size={22} />
                                                                <span className="w-full truncate text-[10.5px] font-medium leading-tight text-slate-700">{r.name.split(" ")[0]}</span>
                                                                <span className="w-full truncate text-[9px] leading-tight text-slate-400">{r.position_title}</span>
                                                                {r.cross_banner && <span className="text-[8px] font-semibold text-slate-400">other company</span>}
                                                            </div>
                                                        </Link>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Insights + Scores + Departments Managed */}
                    <div className="flex flex-col gap-3.5">
                        <ScoresCard employeeId={emp.employee_id} scores={emp.scores} req={emp.position_req} />
                        <InsightsCard employeeId={emp.employee_id} initial={emp.insights} />
                        <DepartmentsManagedCard employeeId={emp.employee_id} departments={ownedDepartments} offices={offices} functions={functions.map((f) => ({ id: f.function_id, name: f.name }))} />
                    </div>
                </div>

                {/* Per-year compensation history (base + STI/LTI actual vs eligible) */}
                <CompensationHistoryCard employeeId={emp.employee_id} history={emp.comp_history} canEdit={canEditComp} />

                {/* Career history + background (education/strengths/development areas — both editable) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <CareerHistoryCard employeeId={emp.employee_id} history={emp.employment_history} />
                    <BackgroundCard employeeId={emp.employee_id} entries={emp.background} />
                </div>

                {/* Files kept against this person (contracts, letters, certificates …) */}
                <EmployeeDocumentsCard employeeId={emp.employee_id} documents={employeeDocuments} folders={employeeDocFolders} />

                    </TabsContent>

                    <TabsContent value="icpd" className="space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            <DevelopmentPlansCard employeeId={emp.employee_id} plans={icpd.developmentPlans} category="action_plan" title="Action Plan" />
                            <AchievementsCard employeeId={emp.employee_id} achievements={icpd.achievements} />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            <PeriodicAssessmentCard employeeId={emp.employee_id} assessments={icpd.periodicAssessments} />
                            <CompetenciesCard employeeId={emp.employee_id} competencies={icpd.competencies} />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            <CareerStepsCard
                                employeeId={emp.employee_id}
                                steps={icpd.careerSteps}
                                functions={functions.map((f) => ({ function_id: f.function_id, name: f.name }))}
                                offices={offices.map((o) => ({ banner_id: o.banner_id, banner_name: o.banner_name }))}
                            />
                            <DevelopmentPlansCard employeeId={emp.employee_id} plans={icpd.developmentPlans} category="next_role_prep" title="Preparation to Support Next Roles" />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                            <SuccessionPositionsCard positions={icpd.successionPositions} />
                            <MentorMobilityCard employeeId={emp.employee_id} mentor={icpd.mentor} crossGroupMobility={icpd.crossGroupMobility} />
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Confidential footer */}
                <div className="text-center text-[11px] text-slate-400 py-1">
                    Confidential — for authorised Central Group HR use only
                </div>
            </div>
        </div>
    );
}

function latestFy(perf: { fiscal_year: number }[]): string {
    if (!perf.length) return "";
    return String(Math.max(...perf.map((p) => p.fiscal_year)));
}
