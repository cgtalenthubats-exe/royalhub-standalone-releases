"use server";

import { query } from "@/lib/postgres/client";
import { getEmployee } from "./employees";
import { compensationOnly } from "@/lib/format";
import { generateJson } from "@/lib/ai";

const CATEGORIES = ["Top Performer", "Leadership Potential", "Talent Status"];

// Generate Key Insights with Gemini from comp + performance + tenure + org context.
export async function generateInsights(employeeId: number): Promise<{ ok: boolean; error?: string }> {
    const emp = await getEmployee(employeeId);
    if (!emp) return { ok: false, error: "Employee not found" };

    const ctx = {
        name: emp.name,
        position: emp.position_title,
        banner: emp.banner_name,
        function: emp.function_name,
        job_grade: emp.job_grade,
        hire_date: emp.hire_date,
        position_effective_date: emp.position_effective_date,
        readiness_potential: emp.readiness_potential,
        team_size: emp.team_size,
        total_compensation: emp.total_compensation,
        compensation_only: compensationOnly(emp.compensation),
        performance: emp.performance.map((p) => ({ fy: p.fiscal_year, grade: p.grade })),
        // Competency scores vs. what their current role requires — a direct
        // "fit" signal for the Leadership Potential / Talent Status write-up.
        competency_scores: emp.scores,
        role_requirement: emp.position_req,
        // Recent-year base/total-comp trend — shows pay recognition/growth,
        // not just a single-year snapshot.
        compensation_trend: emp.comp_history
            .slice()
            .sort((a: any, b: any) => a.fiscal_year - b.fiscal_year)
            .map((h: any) => ({ fy: h.fiscal_year, base_salary: h.base_salary, total_comp: h.total_comp })),
        // Condensed career path (most recent first) — internal moves and any
        // prior external employers — for trajectory context.
        career_path: emp.employment_history
            .slice()
            .sort((a: any, b: any) => (b.start_date || "").localeCompare(a.start_date || ""))
            .slice(0, 5)
            .map((h: any) => ({ position: h.position, employer: h.banner, start_date: h.start_date, end_date: h.end_date, is_current: h.is_current })),
    };

    const prompt =
        `You are an HR talent analyst. Based on this employee's data, write three concise insight cards. ` +
        `Use the performance grades and compensation_trend for "Top Performer" (has pay/recognition kept pace with results?), ` +
        `competency_scores vs role_requirement and career_path for "Leadership Potential" (readiness, trajectory, gaps), ` +
        `and tenure/readiness_potential/team_size for "Talent Status". Cite a concrete number or fact from the data in each card — don't just restate the category name. ` +
        `Return STRICT JSON: an array of exactly 3 objects with keys "category" and "content". ` +
        `Categories must be exactly: "Top Performer", "Leadership Potential", "Talent Status". ` +
        `Each content is 1-2 sentences, specific to the data, no markdown.\n\nDATA:\n${JSON.stringify(ctx, null, 2)}`;

    const res = await generateJson<{ category: string; content: string }[]>(prompt, 800);
    if (!res.ok) return { ok: false, error: res.error };

    // replace existing AI insights for this employee
    await query(`delete from employee_insights where employee_id = $1 and source = 'ai'`, [employeeId]);
    const rows = res.data.filter((p) => CATEGORIES.includes(p.category));
    for (const p of rows) {
        await query(
            `insert into employee_insights (employee_id, category, content, source) values ($1, $2, $3, 'ai')`,
            [employeeId, p.category, p.content]
        );
    }

    return { ok: true };
}

export async function saveManualInsight(employeeId: number, category: string, content: string): Promise<{ ok: boolean }> {
    await query(
        `insert into employee_insights (employee_id, category, content, source) values ($1, $2, $3, 'manual')`,
        [employeeId, category, content]
    );
    return { ok: true };
}
