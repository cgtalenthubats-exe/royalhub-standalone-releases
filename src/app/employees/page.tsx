import { listEmployees } from "@/app/actions/employees";
import { listPositions, listFunctions } from "@/app/actions/positions";
import { listOffices } from "@/app/actions/org";
import { EmployeeTable } from "./employee-table";
import { EmployeeToolbar } from "./employee-toolbar";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; company?: string; country?: string; function?: string }> }) {
    const [{ q, company, country, function: func }, employees, positions, offices, functions] = await Promise.all([searchParams, listEmployees(), listPositions(), listOffices(), listFunctions()]);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 shrink-0">
                <div>
                    <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Employees</h1>
                    <p className="text-[13.5px] text-slate-500 mt-0.5">{employees.length} people across all companies</p>
                </div>
                <EmployeeToolbar
                    employees={employees}
                    offices={offices}
                    positions={positions.map((p) => ({ id: p.position_id, name: p.title, banner_id: p.banner_id }))}
                    functions={functions}
                />
            </div>
            <EmployeeTable employees={employees} initialQuery={q || ""} initialCompany={company || ""} initialCountry={country || ""} initialFunction={func || ""} />
        </div>
    );
}
