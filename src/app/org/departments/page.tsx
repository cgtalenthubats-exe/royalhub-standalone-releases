import { listDepartments } from "@/app/actions/departments";
import { listEmployees } from "@/app/actions/employees";
import { listOffices, getFunctionSummary } from "@/app/actions/org";
import { DepartmentsClient } from "./departments-client";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
    const [departments, employees, offices, functions] = await Promise.all([
        listDepartments(), listEmployees(), listOffices(), getFunctionSummary(),
    ]);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <DepartmentsClient
                departments={departments}
                employees={employees.map((e) => ({ id: e.employee_id, name: e.name }))}
                offices={offices}
                functions={functions.map((f) => ({ id: f.function_id, name: f.name }))}
            />
        </div>
    );
}
