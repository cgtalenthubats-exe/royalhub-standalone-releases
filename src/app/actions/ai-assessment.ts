"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { getEmployee, getComparisonData } from "./employees";
import { compensationOnly } from "@/lib/format";
import { generateJson } from "@/lib/ai";

export interface ProposalAssessment {
    proposal_id: number;
    job_description: string | null;
    additional_context: string | null;
    headline: string | null;
    fit_bullets: string[];
    market_bullets: string[];
    peer_employee_ids: number[];
    model: string | null;
    generated_at: string;
}

// SQLite has no native jsonb type — these 3 columns are stored as TEXT (JSON
// strings) instead of the auto-parsed objects Postgres's driver used to
// hand back, so parse defensively here rather than at every call site.
function asArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

export async function getProposalAssessment(proposalId: number): Promise<ProposalAssessment | null> {
    const data = await queryOne<any>(`select * from proposal_assessments where proposal_id = $1`, [proposalId]);
    if (!data) return null;
    return {
        ...data,
        fit_bullets: asArray(data.fit_bullets),
        market_bullets: asArray(data.market_bullets),
        peer_employee_ids: asArray(data.peer_employee_ids),
    };
}

function personSummary(d: any) {
    return {
        name: d.name,
        position: d.position_title,
        banner: d.banner_name,
        country: d.country,
        job_grade: d.job_grade,
        hire_date: d.hire_date,
        position_effective_date: d.position_effective_date,
        total_compensation: d.total_compensation,
        compensation_only: compensationOnly(d.compensation),
        team_size: d.team_size,
        readiness_potential: d.readiness_potential,
        performance: (d.performance || []).map((p: any) => ({ fy: p.fiscal_year, grade: p.grade })),
    };
}

// Generate (or regenerate — full replace) the AI Assessment for a proposal:
// subject vs the proposal's saved comparison peers vs an optional job
// description, plus a qualitative market/career-benchmark read.
export async function generateProposalAssessment(
    proposalId: number,
    jobDescription: string,
    additionalContext: string,
): Promise<{ ok: boolean; error?: string }> {
    const proposal = await queryOne<any>(`select * from salary_proposals where proposal_id = $1`, [proposalId]);
    if (!proposal) return { ok: false, error: "Proposal not found" };

    const employee = await getEmployee(proposal.employee_id);
    if (!employee) return { ok: false, error: "Employee not found" };

    let newPositionTitle: string | null = null;
    if (proposal.new_position_id) {
        const pos = await queryOne<{ title: string }>(`select title from positions where position_id = $1`, [proposal.new_position_id]);
        newPositionTitle = pos?.title ?? null;
    }

    const peerRows = await query<{ employee_id: number }>(
        `select employee_id from salary_proposal_comparisons where proposal_id = $1 order by sort_order`,
        [proposalId]
    );
    const peerIds = peerRows.map((r) => r.employee_id);
    const peers = peerIds.length ? await getComparisonData(peerIds) : [];

    const ctx = {
        subject: personSummary(employee),
        target_position: newPositionTitle || employee.position_title,
        job_description: jobDescription.trim() || null,
        additional_context: additionalContext.trim() || null,
        peers: peers.map(personSummary),
    };

    const prompt =
        `You are an HR talent analyst preparing an executive-facing appointment & compensation review. ` +
        `Assess the SUBJECT against (a) the target position / job description (if given) and their PEER benchmark set, ` +
        `and (b) the general career market for this kind of role — but for (b) you only have general professional knowledge, ` +
        `not verified live compensation survey data, so keep those points qualitative and clearly hedged (e.g. "typically", "in many markets"), ` +
        `never invent specific percentile numbers or named survey sources.\n\n` +
        `Return STRICT JSON with this exact shape: ` +
        `{"headline": "one sentence verdict", "fit_bullets": ["...", "..."], "market_bullets": ["...", "..."]}. ` +
        `fit_bullets: 3-5 bullets comparing the subject to the target position/JD and to the named peers specifically (use their names). ` +
        `market_bullets: 2-4 bullets on general career/market context for this role — qualitative, hedged, no fabricated stats. ` +
        `No markdown, no extra keys, no commentary outside the JSON.\n\nDATA:\n${JSON.stringify(ctx, null, 2)}`;

    const res = await generateJson<{ headline: string; fit_bullets: string[]; market_bullets: string[] }>(prompt, 1200);
    if (!res.ok) return { ok: false, error: res.error };

    try {
        await query(
            `insert into proposal_assessments
                (proposal_id, job_description, additional_context, headline, fit_bullets, market_bullets, peer_employee_ids, model, generated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8, CURRENT_TIMESTAMP)
             on conflict (proposal_id) do update set
                job_description = excluded.job_description,
                additional_context = excluded.additional_context,
                headline = excluded.headline,
                fit_bullets = excluded.fit_bullets,
                market_bullets = excluded.market_bullets,
                peer_employee_ids = excluded.peer_employee_ids,
                model = excluded.model,
                generated_at = excluded.generated_at`,
            [
                proposalId,
                jobDescription.trim() || null,
                additionalContext.trim() || null,
                res.data.headline || null,
                JSON.stringify(res.data.fit_bullets || []),
                JSON.stringify(res.data.market_bullets || []),
                JSON.stringify(peerIds),
                "gemini-3.1-flash-lite",
            ]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    revalidatePath(`/proposals/${proposalId}`);
    return { ok: true };
}
