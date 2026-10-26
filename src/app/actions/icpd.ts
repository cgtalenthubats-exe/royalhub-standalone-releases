"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

// ── Types ────────────────────────────────────────────────────────────────

export type DevelopmentPlanCategory = "action_plan" | "next_role_prep";

export interface DevelopmentPlan {
    id: number;
    employee_id: number;
    category: DevelopmentPlanCategory;
    plan: string;
    next_steps: string | null;
    by_when: string | null;
    status: string | null;
    sort_order: number | null;
}

export interface Achievement {
    id: number;
    employee_id: number;
    description: string;
    sort_order: number | null;
}

export interface PeriodicAssessment {
    id: number;
    employee_id: number;
    fiscal_year: number;
    performance: string | null;
    commitment_engagement: string | null;
    promotion_readiness: string | null;
    risk_of_losing: string | null;
}

export interface Competency {
    id: number;
    employee_id: number;
    competency_name: string;
    rating: string | null;
    sort_order: number | null;
}

export interface CareerStep {
    id: number;
    employee_id: number;
    step_order: number | null;
    destination_role: string | null;
    level: string | null;
    function_id: number | null;
    by_year: number | null;
    by_age: number | null;
    type: string | null;
    banner_id: number | null;
}

export interface SuccessionCandidateAttribute {
    attribute_name: string;
    potential: string | null;
}

export interface SuccessionPositionForEmployee {
    candidate_id: number;
    seat_id: number;
    seat_label: string | null;
    banner_name: string | null;
    incumbent_name: string | null;
    readiness: string | null;
    rank: number | null;
    attributes: SuccessionCandidateAttribute[];
}

export interface IcpdData {
    developmentPlans: DevelopmentPlan[];
    achievements: Achievement[];
    periodicAssessments: PeriodicAssessment[];
    competencies: Competency[];
    careerSteps: CareerStep[];
    successionPositions: SuccessionPositionForEmployee[];
    mentor: { employee_id: number; name: string } | null;
    crossGroupMobility: boolean | null;
}

// ── Aggregate fetch (one call from the profile page) ───────────────────

export async function getEmployeeIcpd(employeeId: number): Promise<IcpdData> {
    const [developmentPlans, achievements, periodicAssessments, competencies, careerSteps, successionRows, emp] = await Promise.all([
        query<DevelopmentPlan>(`select * from employee_development_plans where employee_id = $1 order by sort_order, id`, [employeeId]),
        query<Achievement>(`select * from employee_achievements where employee_id = $1 order by sort_order, id`, [employeeId]),
        query<PeriodicAssessment>(`select * from employee_periodic_assessments where employee_id = $1 order by fiscal_year`, [employeeId]),
        query<Competency>(`select * from employee_competencies where employee_id = $1 order by sort_order, id`, [employeeId]),
        query<CareerStep>(`select * from employee_career_steps where employee_id = $1 order by step_order, id`, [employeeId]),
        query<any>(
            `select sc.candidate_id, sc.seat_id, sc.readiness, sc.rank,
                    ss.label as seat_label, b.name as banner_name,
                    inc.name as incumbent_name
             from succession_candidates sc
             join succession_seats ss on ss.seat_id = sc.seat_id
             left join banners b on b.banner_id = ss.banner_id
             left join employees inc on inc.employee_id = ss.employee_id
             where sc.candidate_employee_id = $1
             order by sc.rank`,
            [employeeId]
        ),
        queryOne<any>(
            `select e.mentor_employee_id, e.cross_group_mobility, m.name as mentor_name
             from employees e left join employees m on m.employee_id = e.mentor_employee_id
             where e.employee_id = $1`,
            [employeeId]
        ),
    ]);

    const candidateIds = successionRows.map((r) => r.candidate_id);
    const attributeRows = candidateIds.length
        ? await query<{ candidate_id: number; attribute_name: string; potential: string | null }>(
              `select candidate_id, attribute_name, potential from succession_candidate_attributes where candidate_id = any($1) order by sort_order, id`,
              [candidateIds]
          )
        : [];
    const attributesByCandidate = new Map<number, SuccessionCandidateAttribute[]>();
    for (const a of attributeRows) {
        const arr = attributesByCandidate.get(a.candidate_id) || [];
        arr.push({ attribute_name: a.attribute_name, potential: a.potential });
        attributesByCandidate.set(a.candidate_id, arr);
    }

    return {
        developmentPlans,
        achievements,
        periodicAssessments,
        competencies,
        careerSteps,
        successionPositions: successionRows.map((r) => ({ ...r, attributes: attributesByCandidate.get(r.candidate_id) || [] })),
        mentor: emp?.mentor_employee_id ? { employee_id: emp.mentor_employee_id, name: emp.mentor_name } : null,
        crossGroupMobility: emp?.cross_group_mobility == null ? null : !!emp.cross_group_mobility,
    };
}

// ── Development plans ────────────────────────────────────────────────────

export async function createDevelopmentPlan(employeeId: number, input: {
    category: DevelopmentPlanCategory; plan: string; next_steps: string | null; by_when: string | null; status: string | null;
}): Promise<{ ok: boolean; error?: string }> {
    if (!input.plan?.trim()) return { ok: false, error: "Plan is required" };
    try {
        await query(
            `insert into employee_development_plans (employee_id, category, plan, next_steps, by_when, status) values ($1, $2, $3, $4, $5, $6)`,
            [employeeId, input.category, input.plan.trim(), input.next_steps || null, input.by_when || null, input.status || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateDevelopmentPlan(id: number, employeeId: number, input: {
    plan: string; next_steps: string | null; by_when: string | null; status: string | null;
}): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `update employee_development_plans set plan = $1, next_steps = $2, by_when = $3, status = $4 where id = $5`,
            [input.plan.trim(), input.next_steps || null, input.by_when || null, input.status || null, id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteDevelopmentPlan(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_development_plans where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Achievements ─────────────────────────────────────────────────────────

export async function createAchievement(employeeId: number, description: string): Promise<{ ok: boolean; error?: string }> {
    if (!description?.trim()) return { ok: false, error: "Description is required" };
    try {
        await query(`insert into employee_achievements (employee_id, description) values ($1, $2)`, [employeeId, description.trim()]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateAchievement(id: number, employeeId: number, description: string): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update employee_achievements set description = $1 where id = $2`, [description.trim(), id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteAchievement(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_achievements where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Periodic assessment (upsert by fiscal year, mirrors performance_grades) ─

export async function upsertPeriodicAssessment(employeeId: number, input: {
    fiscal_year: number; performance: string | null; commitment_engagement: string | null;
    promotion_readiness: string | null; risk_of_losing: string | null;
}): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `insert into employee_periodic_assessments (employee_id, fiscal_year, performance, commitment_engagement, promotion_readiness, risk_of_losing)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (employee_id, fiscal_year) do update set
               performance = excluded.performance, commitment_engagement = excluded.commitment_engagement,
               promotion_readiness = excluded.promotion_readiness, risk_of_losing = excluded.risk_of_losing`,
            [employeeId, input.fiscal_year, input.performance || null, input.commitment_engagement || null, input.promotion_readiness || null, input.risk_of_losing || null]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deletePeriodicAssessment(employeeId: number, fiscalYear: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_periodic_assessments where employee_id = $1 and fiscal_year = $2`, [employeeId, fiscalYear]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Competencies ─────────────────────────────────────────────────────────

export async function createCompetency(employeeId: number, input: { competency_name: string; rating: string | null }): Promise<{ ok: boolean; error?: string }> {
    if (!input.competency_name?.trim()) return { ok: false, error: "Competency name is required" };
    try {
        await query(`insert into employee_competencies (employee_id, competency_name, rating) values ($1, $2, $3)`, [employeeId, input.competency_name.trim(), input.rating || null]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateCompetency(id: number, employeeId: number, input: { competency_name: string; rating: string | null }): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update employee_competencies set competency_name = $1, rating = $2 where id = $3`, [input.competency_name.trim(), input.rating || null, id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteCompetency(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_competencies where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Career steps ─────────────────────────────────────────────────────────

export async function createCareerStep(employeeId: number, input: {
    destination_role: string; level: string | null; function_id: number | null;
    by_year: number | null; by_age: number | null; type: string | null; banner_id: number | null;
}): Promise<{ ok: boolean; error?: string }> {
    if (!input.destination_role?.trim()) return { ok: false, error: "Destination role is required" };
    try {
        const existing = await query<{ step_order: number | null }>(`select step_order from employee_career_steps where employee_id = $1`, [employeeId]);
        const nextOrder = existing.length ? Math.max(...existing.map((r) => r.step_order || 0)) + 1 : 1;
        await query(
            `insert into employee_career_steps (employee_id, step_order, destination_role, level, function_id, by_year, by_age, type, banner_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [employeeId, nextOrder, input.destination_role.trim(), input.level || null, input.function_id, input.by_year, input.by_age, input.type || null, input.banner_id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateCareerStep(id: number, employeeId: number, input: {
    destination_role: string; level: string | null; function_id: number | null;
    by_year: number | null; by_age: number | null; type: string | null; banner_id: number | null;
}): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(
            `update employee_career_steps set destination_role = $1, level = $2, function_id = $3, by_year = $4, by_age = $5, type = $6, banner_id = $7 where id = $8`,
            [input.destination_role.trim(), input.level || null, input.function_id, input.by_year, input.by_age, input.type || null, input.banner_id, id]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function deleteCareerStep(id: number, employeeId: number): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`delete from employee_career_steps where id = $1`, [id]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

// ── Mentor + cross-group mobility (single-field updates on employees) ────

export async function listEmployeeOptions(excludeId: number): Promise<{ employee_id: number; name: string }[]> {
    return query<{ employee_id: number; name: string }>(
        `select employee_id, name from employees where employee_id != $1 order by name`,
        [excludeId]
    );
}

export async function updateMentor(employeeId: number, mentorEmployeeId: number | null): Promise<{ ok: boolean; error?: string }> {
    if (mentorEmployeeId === employeeId) return { ok: false, error: "Someone can't be their own mentor" };
    try {
        await query(`update employees set mentor_employee_id = $1 where employee_id = $2`, [mentorEmployeeId, employeeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}

export async function updateCrossGroupMobility(employeeId: number, value: boolean | null): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update employees set cross_group_mobility = $1 where employee_id = $2`, [value == null ? null : (value ? 1 : 0), employeeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath(`/employees/${employeeId}`);
    return { ok: true };
}
