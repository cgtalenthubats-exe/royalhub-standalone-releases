import { listEmployees } from "@/app/actions/employees";
import { listProposals } from "@/app/actions/proposals";
import { listPositions } from "@/app/actions/positions";
import { ComparisonV2Client } from "./comparison-v2-client";

export const dynamic = "force-dynamic";

// Redesign preview of /comparison — "Tale of the Tape" scoreboard.
// Reuses the same data + server actions; the original page is left untouched.
export default async function ComparisonV2Page() {
    const [employees, proposals, positions] = await Promise.all([
        listEmployees(),
        listProposals(),
        listPositions(),
    ]);
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <ComparisonV2Client
                employees={employees}
                saveTarget={{
                    proposals: proposals.map((p) => ({ proposal_id: p.proposal_id, employee_name: p.employee_name })),
                    positions: positions.map((p) => ({ position_id: p.position_id, title: p.title })),
                }}
            />
        </div>
    );
}
