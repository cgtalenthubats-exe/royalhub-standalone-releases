"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireSuper } from "@/lib/auth/current-user";

export interface OrgScores { leadership: number | null; experiences: number | null; skill: number | null; market: number | null }

export interface OrgNode {
    // The org-chart node/edge identity now — a person holding two concurrent
    // positions is two separate nodes (see migration 026 / "seat model").
    employee_position_id: number;
    employee_id: number;
    name: string;
    position_title: string | null;
    photo: string | null;
    banner_id: number | null;
    banner_name: string | null; // company name
    banner_short_name: string | null; // compact form for the org-chart node ("SRL", "DBK" …)
    banner_logo_url: string | null;
    office_id: number | null;
    function_name: string | null;
    country: string | null;
    status: string;
    scores: OrgScores | null;
    position_req: OrgScores | null;  // requirement of THIS node's position
    // false = drawn one level below its parent for rank, but does NOT report
    // to it, so the connector is hidden. Used for a company that runs a
    // function independently of the Head of Function: its lead belongs at the
    // same level as the leads who do report in, just with no line.
    reports_to_parent?: boolean;
    // Free-form planning tag (see src/lib/tag-colors.ts) — a preset color key,
    // no HR meaning, purely a visual marker for whoever's using the chart.
    tag_color: string | null;
    // Concurrent positions ("seat model") — whether THIS node is the person's
    // primary seat, and whether they hold any other seat at all (across every
    // dimension, not just this one) — the node card only shows a Primary/
    // Concurrent chip when has_concurrent is true; an ordinary single-job
    // person never gets one.
    is_primary: boolean;
    has_concurrent: boolean;
    children: OrgNode[];
}

export type Dimension = "banner" | "function" | "headcount";

// "As of" for an org page — the most recent real change to that dimension's
// structure (a saved drag-move, or for headcount, also a department edit),
// not a manually-typed field. Returns null if nothing has ever changed.
export async function getOrgAsOf(dimension: Dimension): Promise<string | null> {
    if (dimension === "headcount") {
        const [edge, dept] = await Promise.all([
            queryOne<{ updated_at: string }>(`select updated_at from org_edges where dimension = 'headcount' order by updated_at desc limit 1`),
            queryOne<{ updated_at: string }>(`select updated_at from departments order by updated_at desc limit 1`),
        ]);
        const dates = [edge?.updated_at, dept?.updated_at].filter(Boolean) as string[];
        if (!dates.length) return null;
        return dates.reduce((a, b) => (a > b ? a : b));
    }
    const row = await queryOne<{ updated_at: string }>(`select updated_at from org_edges where dimension = $1 order by updated_at desc limit 1`, [dimension]);
    return row?.updated_at ?? null;
}

export interface OrgTreeFilter {
    functionId?: number; // only employees in this function (each company runs its own function hierarchy)
    bannerId?: number;   // only employees in this company
}

// Each company runs its own function hierarchy by default, but a real
// cross-company (or even cross-function) reporting edge is allowed here too
// — e.g. a Head of Function whose direct reports sit in other companies. Set
// the same way as any other reporting line (drag-and-drop or the profile's
// Org Snapshot editor); getOrgTree below only adds display-time handling for
// a company that has no such edge to anyone at all.
export async function getOrgTreeRaw(dimension: Dimension, filter: OrgTreeFilter = {}): Promise<OrgNode[]> {
    // Positions carry the org-scoping fields now (a person's two concurrent
    // positions can be at different companies/functions) — employees only
    // supplies person-level display data (name/photo/status/tag_color).
    const posConds: string[] = [];
    const posParams: unknown[] = [];
    if (filter.functionId) { posConds.push(`function_id = $${posParams.length + 1}`); posParams.push(filter.functionId); }
    if (filter.bannerId) { posConds.push(`banner_id = $${posParams.length + 1}`); posParams.push(filter.bannerId); }
    const posWhere = posConds.length ? `where ${posConds.join(" and ")}` : "";

    const [edges, posRows, banners, offices, functions, scores, positions] = await Promise.all([
        query<any>(`select employee_position_id, parent_employee_position_id from org_edges where dimension = $1`, [dimension]),
        query<any>(`select employee_position_id, employee_id, position_title, position_id, function_id, banner_id, office_id, is_primary from employee_positions ${posWhere}`, posParams),
        query<any>(`select banner_id, name, short_name, logo_url from banners`),
        query<any>(`select office_id, country, city from banner_offices`),
        query<any>(`select function_id, name from functions`),
        query<any>(`select employee_id, leadership, experiences, skill, market from employee_scores`),
        query<any>(`select position_id, req_leadership, req_experiences, req_skill, req_market from positions`),
    ]);
    const bannerMap = new Map<number, any>(banners.map((b) => [b.banner_id, b]));
    const officeMap = new Map<number, { country: string; city: string | null }>(offices.map((o) => [o.office_id, { country: o.country, city: o.city }]));
    const functionMap = new Map<number, string>(functions.map((f) => [f.function_id, f.name]));
    const scoreMap = new Map<number, any>(scores.map((s) => [s.employee_id, s]));
    const posMap = new Map<number, any>(positions.map((p) => [p.position_id, p]));

    const employeeIds = Array.from(new Set(posRows.map((p) => p.employee_id)));
    const emps = employeeIds.length
        ? await query<any>(`select employee_id, name, photo, status, tag_color from employees where employee_id = any($1)`, [employeeIds])
        : [];
    const empMap = new Map<number, any>(emps.map((e) => [e.employee_id, e]));

    // Whether to show a Primary/Concurrent chip at all depends on whether this
    // PERSON holds more than one position anywhere — not just within this
    // filtered query — so this is a separate, unfiltered count by employee_id.
    const allPosForEmp = employeeIds.length
        ? await query<any>(`select employee_id from employee_positions where employee_id = any($1)`, [employeeIds])
        : [];
    const posCountMap = new Map<number, number>();
    allPosForEmp.forEach((p) => posCountMap.set(p.employee_id, (posCountMap.get(p.employee_id) ?? 0) + 1));

    const nodes = new Map<number, OrgNode>();
    posRows.forEach((pos: any) => {
        const e = empMap.get(pos.employee_id);
        if (!e) return;
        const s = scoreMap.get(pos.employee_id);
        const p = pos.position_id ? posMap.get(pos.position_id) : null;
        nodes.set(pos.employee_position_id, {
            employee_position_id: pos.employee_position_id,
            employee_id: pos.employee_id,
            name: e.name,
            position_title: pos.position_title,
            photo: e.photo ?? null,
            banner_id: pos.banner_id ?? null,
            banner_name: bannerMap.get(pos.banner_id)?.name ?? null,
            banner_short_name: bannerMap.get(pos.banner_id)?.short_name ?? bannerMap.get(pos.banner_id)?.name ?? null,
            banner_logo_url: bannerMap.get(pos.banner_id)?.logo_url ?? null,
            office_id: pos.office_id ?? null,
            function_name: functionMap.get(pos.function_id) ?? null,
            country: officeMap.get(pos.office_id)?.country ?? null,
            status: e.status,
            scores: s ? { leadership: s.leadership, experiences: s.experiences, skill: s.skill, market: s.market } : null,
            position_req: p ? { leadership: p.req_leadership, experiences: p.req_experiences, skill: p.req_skill, market: p.req_market } : null,
            tag_color: e.tag_color ?? null,
            is_primary: pos.is_primary ?? true,
            has_concurrent: (posCountMap.get(pos.employee_id) ?? 1) > 1,
            children: [],
        });
    });

    const roots: OrgNode[] = [];

    // attach
    edges.forEach((e: any) => {
        const node = nodes.get(e.employee_position_id);
        if (!node) return;
        if (e.parent_employee_position_id && nodes.get(e.parent_employee_position_id)) {
            nodes.get(e.parent_employee_position_id)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // sort children by name for stable layout
    const sortRec = (n: OrgNode) => { n.children.sort((a, b) => a.name.localeCompare(b.name)); n.children.forEach(sortRec); };
    roots.sort((a, b) => a.name.localeCompare(b.name));
    roots.forEach(sortRec);
    return roots;
}

// Candidates for "Head of Function" when viewing a function across every
// company: the natural top-of-hierarchy person in each company's independent
// function tree (each is a root in the raw, unmerged tree).
export interface FunctionHeadCandidate { employee_id: number; name: string; position_title: string | null; banner_id: number | null; banner_name: string | null }
export interface FunctionHeadInfo {
    headEmployeeId: number | null;
    candidates: FunctionHeadCandidate[];
}

export async function getFunctionHeadInfo(functionId: number): Promise<FunctionHeadInfo> {
    const [fn, roots] = await Promise.all([
        queryOne<{ global_head_id: number | null }>(`select global_head_id from functions where function_id = $1`, [functionId]),
        getOrgTreeRaw("function", { functionId }),
    ]);
    return {
        headEmployeeId: fn?.global_head_id ?? null,
        candidates: roots.map((r) => ({ employee_id: r.employee_id, name: r.name, position_title: r.position_title, banner_id: r.banner_id, banner_name: r.banner_name })),
    };
}

// For the profile page's "Designate as Head of Function" toggle — cheaper
// than getFunctionHeadInfo since it skips building the whole candidate tree.
export async function getFunctionHeadId(functionId: number): Promise<number | null> {
    const row = await queryOne<{ global_head_id: number | null }>(`select global_head_id from functions where function_id = $1`, [functionId]);
    return row?.global_head_id ?? null;
}

export async function setFunctionHead(functionId: number, employeeId: number | null): Promise<{ ok: boolean; error?: string }> {
    try {
        await query(`update functions set global_head_id = $1 where function_id = $2`, [employeeId, functionId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/org/function");
    return { ok: true };
}

// Public entry point: same as getOrgTreeRaw, except for the function
// dimension when viewing across every company (functionId set, no bannerId).
// If that function has a designated global_head_id who is one of the current
// per-company roots, then the roots of the companies listed in
// function_head_scope are composed as that head's children — in memory only;
// org_edges itself is untouched, so each company's function tree stays as
// independent in the data as it ever was.
//
// Companies NOT in scope keep running their function independently. They are
// still placed one level below the head — their lead ranks alongside the
// leads who do report in, and leaving them as separate roots would both put
// them level with the head and force a synthetic "Functions" box above
// everything — but their connector is hidden (reports_to_parent: false), so
// no reporting relationship is implied.
//
// The renderer (org-chart-d3.tsx) then draws each link one of three ways:
// hidden when reports_to_parent is false, dashed when the two ends are in
// different companies, solid otherwise.
export async function getOrgTree(dimension: Dimension, filter: OrgTreeFilter = {}): Promise<OrgNode[]> {
    const roots = await getOrgTreeRaw(dimension, filter);
    if (dimension !== "function" || !filter.functionId || filter.bannerId || roots.length <= 1) return roots;

    const fn = await queryOne<{ global_head_id: number | null }>(`select global_head_id from functions where function_id = $1`, [filter.functionId]);
    const headId = fn?.global_head_id;
    if (!headId) return roots;
    const head = roots.find((r) => r.employee_id === headId);
    if (!head) return roots; // designated head isn't a current root of this function — leave as-is

    // Every real cross-company report is already attached as a real child by
    // getOrgTreeRaw. Whatever root is left at this point has no reporting
    // edge to anyone — place it one level below the head for rank only, with
    // no connector, instead of leaving it level with the head as a second
    // root (which would also force a synthetic function-name box back).
    const independent = roots
        .filter((r) => r.employee_id !== headId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({ ...r, reports_to_parent: false }));

    head.children = [...head.children, ...independent];
    return [head];
}

export interface DepartmentOwned {
    department_id: number;
    name: string;
    headcount: number;
    country: string | null;
}

export interface OrgFlatNode {
    id: string; // employee_position_id (or the synthetic anchor's "root") — the real node identity
    parentId: string | null;
    employee_id: number; // who this position belongs to — for display/profile links, not node identity
    name: string;
    position_title: string | null;
    photo: string | null;
    banner_id: number | null;
    banner_name: string | null;
    banner_short_name: string | null;
    banner_logo_url: string | null;
    office_id: number | null;
    country: string | null;
    status: string;
    scores: OrgScores | null;
    position_req: OrgScores | null;
    reports_to_parent?: boolean; // false → parent link is hidden (see OrgNode)
    tag_color: string | null;
    is_primary: boolean;
    has_concurrent: boolean;
    // Normally absent — every node this file builds is a seat. `/performance`
    // injects extra "banner" nodes above each company's root so the company
    // itself is clickable in the chart (that's where its objectives are set);
    // those carry employee_id < 0 like the synthetic anchor, and this field is
    // what tells the renderer to draw them instead of hiding them.
    node_kind?: "banner";
    // headcount dimension only:
    own_departments?: DepartmentOwned[];
    own_headcount?: number;
    total_headcount?: number;
    country_count?: number;
}

// Flat node list for d3-org-chart. Adds a synthetic root when the dimension has multiple roots
// (e.g. banner/headcount dimension = one root per company; function dimension = one root per
// company+function when unfiltered, or one root per company when filtered to a single function).
// rootLabel overrides the synthetic root's display name (e.g. the selected function's name).
export async function getOrgFlat(dimension: Dimension, filter: OrgTreeFilter = {}, rootLabel?: string): Promise<{ nodes: OrgFlatNode[]; rootId: string }> {
    const roots = await getOrgTree(dimension, filter);
    const flat: OrgFlatNode[] = [];
    const walk = (n: OrgNode, parentId: string | null) => {
        flat.push({
            id: String(n.employee_position_id), parentId,
            employee_id: n.employee_id, name: n.name, position_title: n.position_title,
            photo: n.photo, banner_id: n.banner_id, banner_name: n.banner_name,
            banner_short_name: n.banner_short_name, banner_logo_url: n.banner_logo_url, office_id: n.office_id,
            country: n.country, status: n.status, scores: n.scores, position_req: n.position_req,
            reports_to_parent: n.reports_to_parent, tag_color: n.tag_color, is_primary: n.is_primary, has_concurrent: n.has_concurrent,
        });
        n.children.forEach((c) => walk(c, String(n.employee_position_id)));
    };

    if (roots.length === 1) {
        walk(roots[0], null);
        return { nodes: flat, rootId: String(roots[0].employee_position_id) };
    }
    // multiple roots → synthetic root
    const SYNTH = "root";
    const defaultLabel = dimension === "function" ? "Functions" : "Organization";
    flat.push({ id: SYNTH, parentId: null, employee_id: -1, name: rootLabel ?? defaultLabel, position_title: null, photo: null, banner_id: null, banner_name: null, banner_short_name: null, banner_logo_url: null, office_id: null, country: null, status: "Active", scores: null, position_req: null, tag_color: null, is_primary: true, has_concurrent: false });
    roots.forEach((r) => walk(r, SYNTH));
    return { nodes: flat, rootId: SYNTH };
}

// "Full Org" for one specific employee — their whole subtree in a given
// dimension, with them as the root instead of their company's actual CEO.
// Used by the profile's "Full Org" button (and reusable anywhere else a
// person-centered rather than company-centered chart is wanted).
export async function getEmployeeFullOrg(employeeId: number, dimension: Dimension = "banner"): Promise<{ nodes: OrgFlatNode[]; rootId: string } | null> {
    // A person can now hold more than one position — "Full Org" shows their
    // PRIMARY position's subtree, resolved explicitly so it's unambiguous
    // which of a concurrent holder's nodes this button means.
    const primary = await queryOne<{ employee_position_id: number }>(
        `select employee_position_id from employee_positions where employee_id = $1 and is_primary = true`,
        [employeeId]
    );
    if (!primary) return null;
    const roots = await getOrgTreeRaw(dimension);
    const find = (n: OrgNode): OrgNode | null => {
        if (n.employee_position_id === primary.employee_position_id) return n;
        for (const c of n.children) { const found = find(c); if (found) return found; }
        return null;
    };
    let target: OrgNode | null = null;
    for (const r of roots) { target = find(r); if (target) break; }
    if (!target) return null;

    const flat: OrgFlatNode[] = [];
    const walk = (n: OrgNode, parentId: string | null) => {
        flat.push({
            id: String(n.employee_position_id), parentId,
            employee_id: n.employee_id, name: n.name, position_title: n.position_title,
            photo: n.photo, banner_id: n.banner_id, banner_name: n.banner_name,
            banner_short_name: n.banner_short_name, banner_logo_url: n.banner_logo_url, office_id: n.office_id,
            country: n.country, status: n.status, scores: n.scores, position_req: n.position_req,
            reports_to_parent: n.reports_to_parent, tag_color: n.tag_color, is_primary: n.is_primary, has_concurrent: n.has_concurrent,
        });
        n.children.forEach((c) => walk(c, String(n.employee_position_id)));
    };
    walk(target, null);
    return { nodes: flat, rootId: String(target.employee_position_id) };
}

export interface HeadcountSummary {
    totalHeadcount: number;
    totalCountries: number;
    unassignedHeadcount: number;
}

// Headcount org tree: same node list as getOrgFlat("headcount"), plus per-node rollup.
// A node's own_headcount = itself (1, if a real employee) + headcount of departments it owns
// directly. total_headcount rolls that up through the whole subtree. This means headcount
// counts BOTH named employees (org chart person nodes) and unnamed department buckets.
export async function getHeadcountFlat(bannerId?: number): Promise<{ nodes: OrgFlatNode[]; rootId: string; summary: HeadcountSummary }> {
    const [{ nodes, rootId }, departments, offices] = await Promise.all([
        getOrgFlat("headcount", { bannerId }),
        query<any>(`select department_id, name, owner_employee_id, office_id, headcount from departments`),
        query<any>(`select office_id, banner_id, country from banner_offices`),
    ]);
    const officeInfo = new Map<number, { country: string; banner_id: number }>(offices.map((o) => [o.office_id, { country: o.country, banner_id: o.banner_id }]));

    const byId = new Map(nodes.map((n) => [n.id, n]));
    // Department ownership is still employee-scoped (out of scope for this
    // migration — see plan) so "is this owner currently visible" checks stay
    // employee_id-based, but the seat COUNT below has to count nodes, not
    // distinct people — a concurrent-position holder is two seats.
    const inScopeEmployeeIds = new Set(nodes.map((n) => n.employee_id).filter((id) => id > 0));
    const realNodeCount = nodes.filter((n) => n.employee_id > 0).length;

    const deptsByOwner = new Map<number, DepartmentOwned[]>();
    let unassignedHeadcount = 0;
    const scopedCountries = new Set<string>();
    let deptHeadcountInScope = 0;
    departments.forEach((d: any) => {
        const office = officeInfo.get(d.office_id);
        if (bannerId && office?.banner_id !== bannerId) return; // department outside the filtered company
        const country = office?.country ?? null;
        if (country) scopedCountries.add(country);
        if (d.owner_employee_id == null) { unassignedHeadcount += d.headcount; deptHeadcountInScope += d.headcount; return; }
        if (!inScopeEmployeeIds.has(d.owner_employee_id)) return;
        deptHeadcountInScope += d.headcount;
        const entry: DepartmentOwned = { department_id: d.department_id, name: d.name, headcount: d.headcount, country };
        const arr = deptsByOwner.get(d.owner_employee_id) || [];
        arr.push(entry);
        deptsByOwner.set(d.owner_employee_id, arr);
    });

    const childrenOf = new Map<string, string[]>();
    nodes.forEach((n) => { if (n.parentId) { const a = childrenOf.get(n.parentId) || []; a.push(n.id); childrenOf.set(n.parentId, a); } });

    // post-order: compute total_headcount + country_count bottom-up.
    // own_headcount = self (1, if a real employee node) + departments owned directly.
    function visit(id: string): { headcount: number; countries: Set<string> } {
        const node = byId.get(id)!;
        const isRealEmployee = node.employee_id > 0;
        const own = isRealEmployee ? (deptsByOwner.get(node.employee_id) || []) : [];
        node.own_departments = own;
        node.own_headcount = (isRealEmployee ? 1 : 0) + own.reduce((s, d) => s + d.headcount, 0);

        let headcount = node.own_headcount;
        const countries = new Set<string>(own.map((d) => d.country).filter((c): c is string => !!c));
        if (isRealEmployee && node.country) countries.add(node.country);
        for (const childId of childrenOf.get(id) || []) {
            const child = visit(childId);
            headcount += child.headcount;
            child.countries.forEach((c) => countries.add(c));
        }
        node.total_headcount = headcount;
        node.country_count = countries.size;
        return { headcount, countries };
    }
    visit(rootId);

    const totalHeadcount = realNodeCount + deptHeadcountInScope;
    return { nodes, rootId, summary: { totalHeadcount, totalCountries: scopedCountries.size, unassignedHeadcount } };
}

export interface CompanyOfficeSummary {
    office_id: number;
    country: string;
    city: string | null;
    is_hq: boolean;
    is_regional_office: boolean;
    country_head_id: number | null;
    country_head_name: string | null;
    employee_count: number;
}

export interface CompanySummary {
    banner_id: number;
    name: string;
    employee_count: number;
    offices: CompanyOfficeSummary[];
}

// Company summary: one row per company (banner), nested with its country offices.
// Counts positions (seats), not people — a concurrent position at a
// different company/office is its own seat there, separate from the
// person's primary one (see migration 026 / "seat model").
export async function getCompanySummary(): Promise<CompanySummary[]> {
    const [banners, offices, positions, emps] = await Promise.all([
        query<any>(`select banner_id, name from banners order by name`),
        query<any>(`select office_id, banner_id, country, city, is_hq, is_regional_office, country_head_id from banner_offices order by is_hq desc`),
        query<any>(`select employee_id, banner_id, office_id from employee_positions`),
        query<any>(`select employee_id, name, status from employees`),
    ]);
    const nameById = new Map<number, string>(emps.map((e) => [e.employee_id, e.name]));
    const statusById = new Map<number, string>(emps.map((e) => [e.employee_id, e.status]));
    const empByOffice = new Map<number, number>();
    const empByBanner = new Map<number, number>();
    positions.forEach((p: any) => {
        // Vacant seats are budgeted headcount, just unfilled — count toward FTE alongside Active.
        const status = statusById.get(p.employee_id);
        if (status !== "Active" && status !== "Vacant") return;
        empByOffice.set(p.office_id, (empByOffice.get(p.office_id) || 0) + 1);
        empByBanner.set(p.banner_id, (empByBanner.get(p.banner_id) || 0) + 1);
    });

    const officesByBanner = new Map<number, CompanyOfficeSummary[]>();
    offices.forEach((o: any) => {
        const arr = officesByBanner.get(o.banner_id) || [];
        arr.push({
            office_id: o.office_id, country: o.country, city: o.city,
            // SQLite returns these as 0/1, not real booleans — coerced here
            // (once, at the data layer) rather than at every render site,
            // since `{is_hq && <Badge>}` would otherwise print a literal "0"
            // for every non-HQ office instead of rendering nothing.
            is_hq: !!o.is_hq, is_regional_office: !!o.is_regional_office,
            country_head_id: o.country_head_id,
            country_head_name: o.country_head_id ? (nameById.get(o.country_head_id) ?? null) : null,
            employee_count: empByOffice.get(o.office_id) || 0,
        });
        officesByBanner.set(o.banner_id, arr);
    });

    return banners.map((b) => ({
        banner_id: b.banner_id,
        name: b.name,
        employee_count: empByBanner.get(b.banner_id) || 0,
        offices: officesByBanner.get(b.banner_id) || [],
    }));
}

// Kept for callers that only need banner totals (dashboard KPI, employee CSV/add-form dropdowns,
// org page company filters).
export interface BannerOption { banner_id: number; name: string }
export async function listBanners(): Promise<BannerOption[]> {
    return query<BannerOption>(`select banner_id, name from banners order by name`);
}

export interface OfficeOption { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
export async function listOffices(): Promise<OfficeOption[]> {
    const [offices, banners] = await Promise.all([
        query<any>(`select office_id, banner_id, country, city from banner_offices order by country`),
        query<any>(`select banner_id, name from banners`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));
    return offices.map((o) => ({ ...o, banner_name: bannerMap.get(o.banner_id) ?? "—" }));
}

// Quick-add from the Add Employee wizard — there's no other UI in the app to
// create a company or a country office today. Reuses an existing banner by
// (case-insensitive) name instead of creating a duplicate, and reuses an
// existing office for that banner+country pair the same way.
export async function createCompanyOffice(input: { banner_name: string; country: string; city?: string | null }): Promise<{ ok: boolean; office?: OfficeOption; error?: string }> {
    const name = input.banner_name.trim();
    const country = input.country.trim();
    if (!name) return { ok: false, error: "Company name is required" };
    if (!country) return { ok: false, error: "Country is required" };

    try {
        let bannerId: number;
        const existingBanner = await queryOne<{ banner_id: number }>(`select banner_id from banners where name like $1 collate nocase`, [name]);
        if (existingBanner) {
            bannerId = existingBanner.banner_id;
        } else {
            const created = await queryOne<{ banner_id: number }>(`insert into banners (name) values ($1) returning banner_id`, [name]);
            if (!created) return { ok: false, error: "Could not create company" };
            bannerId = created.banner_id;
        }

        const existingOffice = await queryOne<any>(
            `select office_id, banner_id, country, city from banner_offices where banner_id = $1 and country like $2 collate nocase`,
            [bannerId, country]
        );
        if (existingOffice) return { ok: true, office: { ...existingOffice, banner_name: name } };

        const office = await queryOne<any>(
            `insert into banner_offices (banner_id, country, city, is_hq, is_regional_office)
             values ($1,$2,$3,false,false) returning office_id, banner_id, country, city`,
            [bannerId, country, input.city?.trim() || null]
        );
        if (!office) return { ok: false, error: "Could not create office" };
        return { ok: true, office: { ...office, banner_name: name } };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

// ── Settings > Companies & logos: office management ────────────────────────
// The wizard's quick-add (above) only ever creates one office at a time as a
// side effect of adding an employee. This is the standalone CRUD for
// managing a company's full set of country offices from Settings directly.
export interface OfficeInput { country: string; city: string | null; is_hq: boolean; is_regional_office: boolean }

export async function createBannerOffice(bannerId: number, input: OfficeInput): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    const country = input.country.trim();
    if (!country) return { ok: false, error: "Country is required" };
    try {
        await query(
            `insert into banner_offices (banner_id, country, city, is_hq, is_regional_office) values ($1,$2,$3,$4,$5)`,
            [bannerId, country, input.city?.trim() || null, input.is_hq, input.is_regional_office]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateSettingsAndOrgViews();
    return { ok: true };
}

export async function updateBannerOffice(officeId: number, input: OfficeInput): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    const country = input.country.trim();
    if (!country) return { ok: false, error: "Country is required" };
    try {
        await query(
            `update banner_offices set country = $1, city = $2, is_hq = $3, is_regional_office = $4 where office_id = $5`,
            [country, input.city?.trim() || null, input.is_hq, input.is_regional_office, officeId]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateSettingsAndOrgViews();
    return { ok: true };
}

// Refuses rather than letting the FK constraint fail raw — employees,
// concurrent positions, and department headcount buckets all reference
// office_id (see departments.ts), and any one existing means deleting the
// office would orphan real data.
export async function deleteBannerOffice(officeId: number): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    const [empCount, posCount, deptCount] = await Promise.all([
        queryOne<{ count: string }>(`select count(*) from employees where office_id = $1`, [officeId]),
        queryOne<{ count: string }>(`select count(*) from employee_positions where office_id = $1`, [officeId]),
        queryOne<{ count: string }>(`select count(*) from departments where office_id = $1`, [officeId]),
    ]);
    const emp = Number(empCount?.count ?? 0), pos = Number(posCount?.count ?? 0), dept = Number(deptCount?.count ?? 0);
    if (emp > 0) return { ok: false, error: `${emp} employee${emp === 1 ? "" : "s"} still assigned to this office — move them first.` };
    if (pos > 0) return { ok: false, error: `${pos} position${pos === 1 ? "" : "s"} (incl. concurrent ones) still use this office — reassign them first.` };
    if (dept > 0) return { ok: false, error: `${dept} department${dept === 1 ? "" : "s"} still use this office — reassign them first.` };
    try {
        await query(`delete from banner_offices where office_id = $1`, [officeId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateSettingsAndOrgViews();
    return { ok: true };
}

function revalidateSettingsAndOrgViews() {
    revalidatePath("/settings");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
}

export interface FunctionOfficeBreakdown {
    banner_id: number;
    banner_name: string;
    office_id: number;
    country: string;
    employees: { employee_id: number; name: string; position_title: string | null }[];
}

export interface FunctionSummary {
    function_id: number;
    name: string;
    employee_count: number;
    company_count: number;
    breakdown: FunctionOfficeBreakdown[];
}

// Function summary: one row per function, broken down by company + country office
// (each company runs its own independent function hierarchy — see /org/function).
// Counts positions (seats), not people — someone holding two concurrent
// positions in two different functions counts once in each.
export async function getFunctionSummary(): Promise<FunctionSummary[]> {
    const [functions, positions, banners, offices, emps] = await Promise.all([
        query<any>(`select function_id, name from functions order by function_id`),
        query<any>(`select employee_position_id, employee_id, position_title, function_id, banner_id, office_id from employee_positions`),
        query<any>(`select banner_id, name from banners`),
        query<any>(`select office_id, country from banner_offices`),
        query<any>(`select employee_id, name, status from employees`),
    ]);
    const bannerMap = new Map<number, string>(banners.map((b) => [b.banner_id, b.name]));
    const countryMap = new Map<number, string>(offices.map((o) => [o.office_id, o.country]));
    const empInfoMap = new Map<number, { name: string; status: string }>(emps.map((e) => [e.employee_id, { name: e.name, status: e.status }]));

    // Vacant seats are budgeted headcount, just unfilled — count toward FTE alongside Active.
    const activePositions = positions.filter((p: any) => {
        const status = empInfoMap.get(p.employee_id)?.status;
        return status === "Active" || status === "Vacant";
    });
    return functions.map((f) => {
        const members = activePositions.filter((p: any) => p.function_id === f.function_id);
        const byKey = new Map<string, FunctionOfficeBreakdown>();
        const companies = new Set<number>();
        members.forEach((p: any) => {
            companies.add(p.banner_id);
            const key = `${p.banner_id}:${p.office_id}`;
            const entry: FunctionOfficeBreakdown = byKey.get(key) || {
                banner_id: p.banner_id, banner_name: bannerMap.get(p.banner_id) ?? "—",
                office_id: p.office_id, country: countryMap.get(p.office_id) ?? "—",
                employees: [],
            };
            entry.employees.push({ employee_id: p.employee_id, name: empInfoMap.get(p.employee_id)?.name ?? "—", position_title: p.position_title });
            byKey.set(key, entry);
        });
        const breakdown = Array.from(byKey.values()).sort((a, b) => a.banner_name.localeCompare(b.banner_name) || a.country.localeCompare(b.country));
        return { function_id: f.function_id, name: f.name, employee_count: members.length, company_count: companies.size, breakdown };
    });
}
