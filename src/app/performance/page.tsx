import type { OrgFlatNode } from "@/app/actions/org";
import { getOrgFlat, listBanners } from "@/app/actions/org";
import { listCycles, listBannerGoals, getPerformanceOverview, getDepartedHolders, type BannerGoal } from "@/app/actions/performance";
import { goalProgress, rollup, perfStatus } from "@/lib/performance";
import { PerformanceClient } from "./performance-client";

// Slot a node for the company itself above each company's root person, so the
// chart shows where a seat's objectives come from and the company is clickable
// in the same place its people are — that's where banner goals get set.
//
// Done here rather than in getOrgFlat because the other three org pages have no
// use for it and shouldn't grow a node they'd have to filter back out.
function withBannerNodes(nodes: OrgFlatNode[], goals: BannerGoal[]): OrgFlatNode[] {
    const synthetic = nodes.find((n) => n.id === "root");
    const roots = nodes.filter((n) => n.employee_id > 0 && (n.parentId === null || n.parentId === "root"));

    const rootsByBanner = new Map<number, OrgFlatNode[]>();
    roots.forEach((r) => {
        if (r.banner_id == null) return;
        const a = rootsByBanner.get(r.banner_id) || [];
        a.push(r);
        rootsByBanner.set(r.banner_id, a);
    });
    if (!rootsByBanner.size) return nodes;

    const goalsByBanner = new Map<number, BannerGoal[]>();
    goals.forEach((g) => {
        const a = goalsByBanner.get(g.banner_id) || [];
        a.push(g);
        goalsByBanner.set(g.banner_id, a);
    });

    const out = nodes.map((n) => ({ ...n }));
    const byId = new Map(out.map((n) => [n.id, n]));
    const bannerNodes: OrgFlatNode[] = [];

    rootsByBanner.forEach((bannerRoots, bannerId) => {
        const sample = bannerRoots[0];
        const id = `banner:${bannerId}`;
        bannerNodes.push({
            id,
            parentId: synthetic ? "root" : null,
            employee_id: -1, // not a person — keeps every "real seat" guard working unchanged
            node_kind: "banner",
            name: sample.banner_name ?? "Company",
            position_title: null,
            photo: null,
            banner_id: bannerId,
            banner_name: sample.banner_name,
            banner_short_name: sample.banner_short_name,
            banner_logo_url: sample.banner_logo_url,
            office_id: null,
            country: null,
            status: "Active",
            scores: null,
            position_req: null,
            tag_color: null,
            is_primary: true,
            has_concurrent: false,
        });
        // the company's top people now hang off the company, not the anchor
        bannerRoots.forEach((r) => { byId.get(r.id)!.parentId = id; });
    });

    return [...out, ...bannerNodes];
}

export const dynamic = "force-dynamic";

// Performance Management (migration 027). Same tree the org chart draws —
// getOrgFlat("banner") — with a per-seat target overlay on top, so the two
// views can never drift apart structurally.
export default async function PerformancePage({ searchParams }: {
    searchParams: Promise<{ company?: string; cycle?: string; tab?: string }>;
}) {
    const { company, cycle, tab } = await searchParams;
    const bannerId = company ? Number(company) : undefined;

    // The cycle has to resolve first — everything else is scoped to it.
    const cycles = await listCycles();
    const active =
        (cycle ? cycles.find((c) => String(c.cycle_id) === cycle) : null) ??
        cycles.find((c) => c.status === "active") ??
        cycles[0];

    if (!active) {
        return (
            <div className="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
                <h1 className="text-[20px] font-extrabold text-[#0b1f3a]">No review cycle yet</h1>
                <p className="mt-2 max-w-md text-[13.5px] text-slate-500">
                    Performance targets are recorded against a review year. Create one to get started.
                </p>
            </div>
        );
    }

    const [{ nodes }, overview, goals, banners, departed] = await Promise.all([
        getOrgFlat("banner", { bannerId }),
        getPerformanceOverview(active.cycle_id, bannerId),
        listBannerGoals(active.cycle_id, bannerId),
        listBanners(),
        getDepartedHolders(active.cycle_id, bannerId),
    ]);

    // Give each banner node its own status entry so the chart can show a
    // company's overall objective progress the same way it shows a person's.
    const byPosition = { ...overview.byPosition };
    const goalsByBanner = new Map<number, BannerGoal[]>();
    goals.forEach((g) => {
        const a = goalsByBanner.get(g.banner_id) || [];
        a.push(g);
        goalsByBanner.set(g.banner_id, a);
    });
    goalsByBanner.forEach((gs, bId) => {
        // Weight the company's goals against each other, using each goal's own
        // figure — which is itself already rolled up from its aligned targets
        // when nothing was entered by hand (see goalProgress).
        const pct = rollup(gs.map((g) => ({
            target_value: null, actual_value: null,
            progress_pct: goalProgress(g), weight: g.weight ?? null,
        })));
        byPosition[`banner:${bId}`] = {
            status: perfStatus(pct, gs.length),
            pct,
            targetCount: gs.length,
            withActualCount: gs.filter((g) => goalProgress(g) != null).length,
        };
    });

    const chartNodes = withBannerNodes(nodes, goals);

    return (
        <PerformanceClient
            nodes={chartNodes}
            overview={{ ...overview, byPosition }}
            goals={goals}
            departed={departed}
            cycles={cycles}
            cycleId={active.cycle_id}
            banners={banners.map((b) => ({ id: b.banner_id, name: b.name }))}
            bannerId={bannerId}
            tab={tab === "goals" ? "goals" : "overview"}
        />
    );
}
