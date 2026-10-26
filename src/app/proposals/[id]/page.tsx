import { notFound } from "next/navigation";
import { getProposal, getProposalBoard } from "@/app/actions/proposals";
import { listEmployees } from "@/app/actions/employees";
import { getProposalAssessment } from "@/app/actions/ai-assessment";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canSeeComp } from "@/lib/permissions";
import { ProposalDetailClient } from "./proposal-detail-client";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
    const { id } = await params;
    const { tab } = await searchParams;
    const proposalId = Number(id);
    const detail = await getProposal(proposalId);
    if (!detail) notFound();
    const [allEmployees, board, assessment, user] = await Promise.all([
        listEmployees(),
        getProposalBoard(proposalId),
        getProposalAssessment(proposalId),
        getCurrentUser(),
    ]);
    const canEditComp = canSeeComp(user);
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <ProposalDetailClient
                detail={detail}
                allEmployees={allEmployees}
                board={board}
                assessment={assessment}
                canEditComp={canEditComp}
                initialTab={tab === "comparison" ? "comparison" : tab === "assessment" ? "assessment" : "proposal"}
            />
        </div>
    );
}
