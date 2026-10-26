import { listEmployees } from "@/app/actions/employees";
import { ComparisonClient } from "./comparison-client";

export const dynamic = "force-dynamic";

export default async function ComparisonPage() {
    const employees = await listEmployees();
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <ComparisonClient employees={employees} />
        </div>
    );
}
