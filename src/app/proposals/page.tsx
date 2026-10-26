import { listProposals } from "@/app/actions/proposals";
import { listEmployees } from "@/app/actions/employees";
import { ProposalsClient } from "./proposals-client";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
    const [proposals, employees] = await Promise.all([listProposals(), listEmployees()]);

    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <ProposalsClient
                proposals={proposals}
                employees={employees.map((e) => ({ id: e.employee_id, name: e.name, position_title: e.position_title }))}
            />
        </div>
    );
}
