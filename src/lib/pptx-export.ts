// Native PPTX export (pptxgenjs) — draws slides from data, no screenshot/canvas
// (avoids cross-origin image tainting). Client-only: pptxgenjs is dynamically imported.
import type { OrgFlatNode } from "@/app/actions/org";
import type { EmployeeDetail } from "@/app/actions/employees";
import type { SalaryReviewColumn } from "@/app/actions/proposals";
import type { IcpdData } from "@/app/actions/icpd";
import { formatCurrency, formatDate, formatYears, compensationOnly, yearsBetween, calcAge } from "@/lib/format";
import { fetchImageAsDataUri } from "@/app/actions/photo";
import { tagColorHex } from "@/lib/tag-colors";

// Central Group brand (from the real CGE template: "New CG Template with
// Color Code - Aptos.potx" + "Appointment & Compensation Review" sample deck).
const NAVY = "0E2841"; // theme dk2 — was 0B1F3A
const NAVY_LIGHT = "1E3A5F"; // header-band gradient partner
const BLUE = "3B6EA5";
const ACCENT = "156082"; // theme accent1 — the template's dominant color
const ACCENT_LIGHT = "E4EFF3"; // pale accent1 tint for "highlighted" row fills
const GREY = "64748B";
const LIGHT = "E2E8F0";
const PANEL = "F8FAFC"; // section-panel background — matches on-screen slate-50 cards
const LINE = "000000"; // org connector lines & node borders — black, per existing org-chart convention
const FONT = "Aptos"; // ships with Office 2021+/365 — the template's own font

const PAGE_W = 13.33, PAGE_H = 7.5;
const MARGIN = 0.4;
const LOGO = "/brand/central-group-logo.png"; // wordmark extracted from the CG template, transparent bg
const LOGO_AR = 1268 / 242; // source pixel aspect ratio — every placement derives from this

// pptxgenjs doesn't apply a presentation-level default font to text runs —
// each run's own `options.fontFace` wins and there's no fallback (falls back
// to hardcoded 'Arial' otherwise). Rather than repeat `fontFace: FONT` at
// every one of this file's ~60 addText/addTable call sites, wrap each new
// slide's addText/addTable once so every run gets our brand font by default.
function withBrandFont(item: any): any {
    if (Array.isArray(item)) return item.map(withBrandFont);
    if (item && typeof item === "object" && "text" in item) return { ...item, options: { fontFace: FONT, ...(item.options || {}) } };
    return item;
}
function applyBrandFont(slide: any) {
    const origAddText = slide.addText.bind(slide);
    slide.addText = (text: any, opts: any = {}) =>
        origAddText(typeof text === "string" || typeof text === "number" ? text : withBrandFont(text), { fontFace: FONT, ...opts });
    const origAddTable = slide.addTable.bind(slide);
    slide.addTable = (rows: any, opts: any = {}) => origAddTable((rows || []).map(withBrandFont), opts);
}

// ── Shared slide chrome: navy header band + accent trim + footer (incl. the
// Central Group corner wordmark) + a slim brand strip down the left edge, so
// every slide reads as "designed" instead of plain text-on-white. ─────────
function chrome(slide: any, kicker: string, title: string, subtitle: string, pageLabel: string, photoUrl?: string | null) {
    applyBrandFont(slide);
    slide.background = { color: "FFFFFF" };
    // left brand strip
    slide.addShape("rect", { x: 0, y: 0, w: 0.12, h: PAGE_H, fill: { color: ACCENT } });
    // header band
    slide.addShape("rect", { x: 0, y: 0, w: PAGE_W, h: 1.15, fill: { color: NAVY } });
    slide.addShape("rect", { x: 0, y: 1.15, w: PAGE_W, h: 0.045, fill: { color: ACCENT } });
    // when a profile photo is supplied, leave room for a circular headshot on the right
    const textW = photoUrl ? PAGE_W - 0.8 - 1.1 : PAGE_W - 0.8;
    slide.addText(kicker.toUpperCase(), { x: MARGIN, y: 0.2, w: textW, h: 0.25, fontSize: 10, bold: true, color: "BFDCE8", charSpacing: 1.5 });
    slide.addText(title, { x: MARGIN, y: 0.42, w: textW, h: 0.5, fontSize: 22, bold: true, color: "FFFFFF" });
    slide.addText(subtitle, { x: MARGIN, y: 0.88, w: textW, h: 0.25, fontSize: 10.5, color: "C7D2E0" });
    if (photoUrl) {
        const size = 0.85, px = PAGE_W - MARGIN - size, py = (1.15 - size) / 2;
        slide.addShape("ellipse", { x: px - 0.045, y: py - 0.045, w: size + 0.09, h: size + 0.09, fill: { color: ACCENT } });
        slide.addImage({ data: photoUrl, x: px, y: py, w: size, h: size, rounding: true });
    }
    // footer — page label's box is narrowed to leave room for the corner logo
    slide.addShape("line", { x: MARGIN, y: PAGE_H - 0.32, w: PAGE_W - MARGIN * 2, h: 0, line: { color: LIGHT, width: 0.75 } });
    slide.addText("CONFIDENTIAL — Royal Flush ATS · for authorised REMCO use only", { x: MARGIN, y: PAGE_H - 0.28, w: 9, h: 0.2, fontSize: 7.5, color: GREY });
    slide.addText(pageLabel, { x: PAGE_W - MARGIN - 3, y: PAGE_H - 0.28, w: 1.6, h: 0.2, fontSize: 7.5, color: GREY, align: "right" });
    const logoW = 1.3, logoH = logoW / LOGO_AR;
    slide.addImage({ path: LOGO, x: PAGE_W - MARGIN - logoW, y: PAGE_H - 0.32 + (0.32 - logoH) / 2, w: logoW, h: logoH });
}

// A titled content panel (light card background + navy section-label bar),
// mirroring the on-screen Card + SectionHeader pattern used across the app.
function panel(slide: any, x: number, y: number, w: number, h: number, label: string) {
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color: PANEL }, line: { color: LIGHT, width: 0.75 } });
    slide.addShape("roundRect", { x, y, w, h: 0.32, rectRadius: 0.06, fill: { color: NAVY }, line: { type: "none" } });
    slide.addShape("rect", { x, y: y + 0.16, w, h: 0.16, fill: { color: NAVY }, line: { type: "none" } }); // square off the bar's bottom corners
    slide.addText(label, { x: x + 0.15, y, w: w - 0.3, h: 0.32, fontSize: 11, bold: true, color: "FFFFFF", valign: "middle" });
    return { innerX: x + 0.2, innerY: y + 0.45, innerW: w - 0.4, innerH: h - 0.6 };
}

// ---------------- ORG CHART ----------------
export async function exportOrgPptx(nodes: OrgFlatNode[], title: string) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map<string, OrgFlatNode[]>();
    nodes.forEach((n) => { if (n.parentId) { const a = childrenOf.get(n.parentId) || []; a.push(n); childrenOf.set(n.parentId, a); } });
    const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));

    // FTE = seat count of this node's own subtree (incl. itself), same
    // definition the live chart uses — memoized since every node's count gets
    // read at least once per slide it appears on (as parent and as a child).
    const fteCache = new Map<string, number>();
    const fteOf = (id: string): number => {
        if (fteCache.has(id)) return fteCache.get(id)!;
        const kids = childrenOf.get(id) || [];
        const total = 1 + kids.reduce((s, k) => s + fteOf(k.id), 0);
        fteCache.set(id, total);
        return total;
    };

    // Photos + banner logos, fetched once as data URIs up front (pptxgenjs
    // can't load cross-origin URLs directly at export time).
    const images = await loadPhotos(nodes.flatMap((n) => [n.photo, n.banner_logo_url]));
    const imageOf = (u?: string | null) => (u ? images.get(u) || null : null);

    const drawTeam = (parent: OrgFlatNode, kids: OrgFlatNode[]) => {
        const slide = pptx.addSlide();
        chrome(slide, "Organization Chart", title, `${parent.name}${parent.position_title ? " · " + parent.position_title : ""} — ${kids.length} direct report${kids.length === 1 ? "" : "s"}`, "");

        const boxW = 2.3, boxH = 0.95;
        const parentX = (PAGE_W - boxW) / 2, parentY = 1.55;
        drawBox(slide, parentX, parentY, boxW, boxH, parent, true, imageOf, fteOf(parent.id));

        const n = Math.max(kids.length, 1);
        const perRow = Math.min(n, 5);
        const rows = Math.ceil(n / perRow);
        const busY = parentY + boxH + 0.4;
        for (let r = 0; r < rows; r++) {
            const rowKids = kids.slice(r * perRow, (r + 1) * perRow);
            const spacing = Math.min(2.55, (PAGE_W - 0.8) / rowKids.length);
            const totalW = spacing * rowKids.length;
            const startX = (PAGE_W - totalW) / 2;
            const childY = busY + 0.4 + r * (boxH + 0.7);
            const childCenters = rowKids.map((_, i) => startX + i * spacing + spacing / 2);
            drawElbow(slide, parentX + boxW / 2, parentY + boxH, busY, childCenters, childY);
            rowKids.forEach((kid, i) => {
                const x = startX + i * spacing + (spacing - boxW) / 2;
                drawBox(slide, x, childY, boxW, boxH, kid, false, imageOf, fteOf(kid.id));
            });
        }
    };

    // overview = each root + its children; then a slide per node that has children
    const queue: OrgFlatNode[] = [...roots];
    const seen = new Set<string>();
    while (queue.length) {
        const node = queue.shift()!;
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        const kids = childrenOf.get(node.id) || [];
        if (kids.length > 0) {
            drawTeam(node, kids);
            queue.push(...kids);
        }
    }

    await pptx.writeFile({ fileName: `org-chart-${Date.now()}.pptx` });
}

// Orthogonal ("elbow") connector: one vertical stub down from the parent to a
// shared horizontal bus, then a vertical stub from the bus down to each
// child. Skips the horizontal segment entirely for a single child (a plain
// straight line reads better than a zero-length bus).
// dashedChild[i] marks a child whose connector should render dashed (a
// cross-company report into a Head of Function, matching the dashed line
// used for the same relationship on the org chart and profile).
function drawElbow(slide: any, parentCx: number, parentBottomY: number, busY: number, childCenters: number[], childTopY: number, dashedChild: boolean[] = []) {
    slide.addShape("line", { x: parentCx, y: parentBottomY, w: 0, h: busY - parentBottomY, line: { color: LINE, width: 1.25 } });
    if (childCenters.length > 1) {
        const minX = Math.min(...childCenters), maxX = Math.max(...childCenters);
        slide.addShape("line", { x: minX, y: busY, w: maxX - minX, h: 0, line: { color: LINE, width: 1.25 } });
    }
    childCenters.forEach((cx, i) => {
        slide.addShape("line", { x: cx, y: busY, w: 0, h: childTopY - busY, line: { color: LINE, width: 1.25, dashType: dashedChild[i] ? "dash" : "solid" } });
    });
}

// Mirrors the live node card: photo bleeds the box's own left edge/height,
// a small banner-logo badge sits in the top-right corner, and text stacks as
// name -> Primary/Concurrent chip (only if the person holds >1 seat) ->
// position -> FTE. tag_color (a per-employee planning marker, no HR meaning)
// tints the whole box the same way it tints the on-screen card.
function drawBox(slide: any, x: number, y: number, w: number, h: number, node: OrgFlatNode, isParent: boolean, imageOf: (u?: string | null) => string | null, fte: number) {
    const tagHex = tagColorHex(node.tag_color)?.replace("#", "");
    const fillColor = isParent ? NAVY : (tagHex || "FFFFFF");
    const fillTransparency = isParent ? 0 : (tagHex ? 88 : 0);
    const borderColor = !isParent && tagHex ? tagHex : LINE;

    slide.addShape("roundRect", { x: x + 0.035, y: y + 0.035, w, h, rectRadius: 0.08, fill: { color: "D8DEE7" }, line: { type: "none" } }); // drop shadow
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: fillColor, transparency: fillTransparency }, line: { color: borderColor, width: 1 } });

    const photoW = h * 0.85;
    const photoUri = imageOf(node.photo);
    if (photoUri) {
        slide.addImage({ data: photoUri, x, y, w: photoW, h, sizing: { type: "cover", w: photoW, h } });
    } else {
        slide.addShape("rect", { x, y, w: photoW, h, fill: { color: isParent ? "1E3A5F" : NAVY }, line: { type: "none" } });
        slide.addText(initials(node.name), { x, y, w: photoW, h, align: "center", valign: "middle", fontSize: 12, bold: true, color: "FFFFFF" });
    }

    const logoUri = imageOf(node.banner_logo_url);
    if (logoUri) {
        const logoH = 0.15, logoW = logoH * 2.6;
        slide.addImage({ data: logoUri, x: x + w - logoW - 0.07, y: y + 0.05, w: logoW, h: logoH, sizing: { type: "contain", w: logoW, h: logoH } });
    }

    const textX = x + photoW + 0.08, textW = w - photoW - 0.13;
    const rows: any[] = [{ text: node.name || "—", options: { bold: true, fontSize: 10.5, color: isParent ? "FFFFFF" : NAVY, breakLine: true } }];
    if (node.has_concurrent) {
        rows.push({ text: node.is_primary ? "PRIMARY" : "CONCURRENT", options: { fontSize: 6.5, bold: true, color: node.is_primary ? "0F766E" : "7C3AED", breakLine: true } });
    }
    rows.push({ text: node.position_title || "", options: { fontSize: 8, color: isParent ? "C7D2E0" : GREY, breakLine: true } });
    rows.push({ text: `FTE ${fte}`, options: { fontSize: 8, bold: true, color: isParent ? "FFFFFF" : NAVY } });
    slide.addText(rows, { x: textX, y, w: textW, h, align: "left", valign: "middle" });
}

// ---------------- PERFORMANCE ----------------
// Two exports, because the two audiences are different: a company-level deck
// for the review meeting ("what did we set, where did we land, who hasn't
// filled theirs in"), and a one-person sheet for that person's own review.
//
// Deliberately NOT the org chart: /performance reuses OrgChartD3 for display,
// but exporting a plain reporting tree from it would carry none of the
// objectives, achievement, or weights that are the entire point of the page.

export interface PerfExportGoal {
    goal_id: number;
    title: string;
    banner_name: string | null;
    metric_unit: string | null;
    target_value: number | null;
    actual_value: number | null;
    weight: number | null;
    aligned_count: number;
    pct: number | null;
    derived: boolean;
}

export interface PerfExportPerson {
    id: string;
    name: string;
    position_title: string | null;
    banner_name: string | null;
    targetCount: number;
    pct: number | null;
    statusLabel: string;
}

export interface PerfExportTarget {
    title: string;
    description: string | null;
    goalTitle: string | null;   // the company objective it serves, if any
    metric_unit: string | null;
    target_value: number | null;
    actual_value: number | null;
    weight: number | null;
    pct: number | null;
}

const PERF_HEADER = ["", "Weight", "Target", "Actual", "Achieved"];

function pctCell(pct: number | null): string {
    return pct == null ? "—" : `${Math.round(pct)}%`;
}
function measureCell(target: number | null, unit: string | null): string {
    return target == null ? "—" : `${target}${unit ? ` ${unit}` : ""}`;
}
// Red below 80, amber to 99, green at or above target — matching the on-screen
// bands in src/lib/performance.ts. Always paired with the number itself, never
// standing in for it.
function pctColor(pct: number | null): string {
    if (pct == null) return GREY;
    if (pct < 80) return "C0392B";
    if (pct < 100) return "B7791F";
    return "1E7A54";
}

// ── Company overview ──────────────────────────────────────────────────────
export async function exportPerformanceBannerPptx(input: {
    cycleName: string;
    bannerName: string;
    goals: PerfExportGoal[];
    people: PerfExportPerson[];
    seatsWithTargets: number;
    totalSeats: number;
}) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";

    const { cycleName, bannerName, goals, people, seatsWithTargets, totalSeats } = input;
    const setPct = totalSeats ? Math.round((seatsWithTargets / totalSeats) * 100) : 0;

    // ── Slide 1: the objectives themselves ──
    const s1 = pptx.addSlide();
    chrome(s1, "Performance", `${bannerName} — ${cycleName}`, `Company objectives · ${goals.length} set`, "1");

    const kpi = panel(s1, MARGIN, 1.45, 3.1, 1.5, "Targets set");
    s1.addText(
        [
            { text: `${seatsWithTargets}`, options: { fontSize: 34, bold: true, color: NAVY } },
            { text: ` / ${totalSeats}`, options: { fontSize: 17, color: GREY } },
        ],
        { x: kpi.innerX, y: kpi.innerY + 0.1, w: kpi.innerW, h: 0.55 }
    );
    s1.addText(`${setPct}% of people have recorded targets`, { x: kpi.innerX, y: kpi.innerY + 0.68, w: kpi.innerW, h: 0.3, fontSize: 9.5, color: GREY });

    const goalsPanel = panel(s1, MARGIN + 3.3, 1.45, PAGE_W - MARGIN * 2 - 3.3, PAGE_H - 1.45 - 0.55, "Objectives");
    if (goals.length) {
        s1.addTable(
            ([
                PERF_HEADER.map((h, i) => ({
                    text: i === 0 ? "Objective" : h,
                    options: { bold: true, fontSize: 9, color: "FFFFFF", fill: { color: NAVY }, align: i === 0 ? "left" : "right" },
                })),
                ...goals.map((g) => [
                    {
                        text: g.aligned_count
                            ? `${g.title}\n${g.aligned_count} target${g.aligned_count === 1 ? "" : "s"} aligned${g.derived ? " · achievement rolled up from them" : ""}`
                            : `${g.title}\nno targets aligned yet`,
                        options: { fontSize: 9.5, color: NAVY, align: "left" },
                    },
                    { text: g.weight != null ? `${g.weight}%` : "—", options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: measureCell(g.target_value, g.metric_unit), options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: g.actual_value != null ? String(g.actual_value) : "—", options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: pctCell(g.pct), options: { fontSize: 11, bold: true, color: pctColor(g.pct), align: "right" } },
                ]),
            ] as any),
            { x: goalsPanel.innerX, y: goalsPanel.innerY, w: goalsPanel.innerW, colW: colWidths(goalsPanel.innerW), border: { type: "solid", color: LIGHT, pt: 0.5 }, valign: "middle", autoPage: false } as any
        );
    } else {
        s1.addText("No objectives recorded for this cycle.", { x: goalsPanel.innerX, y: goalsPanel.innerY + 0.3, w: goalsPanel.innerW, h: 0.4, fontSize: 11, color: GREY, align: "center" });
    }

    // ── Slide 2+: where each person stands ──
    // Paged by hand rather than autoPage so every page keeps the slide chrome.
    const PER_PAGE = 14;
    const pages = Math.max(1, Math.ceil(people.length / PER_PAGE));
    for (let p = 0; p < pages; p++) {
        const slice = people.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
        const s = pptx.addSlide();
        chrome(s, "Performance", `${bannerName} — ${cycleName}`, `People · ${people.length} seat${people.length === 1 ? "" : "s"}`, `${p + 2}`);
        const pnl = panel(s, MARGIN, 1.45, PAGE_W - MARGIN * 2, PAGE_H - 1.45 - 0.55, pages > 1 ? `Overview (${p + 1}/${pages})` : "Overview");
        if (!slice.length) {
            s.addText("No people in scope.", { x: pnl.innerX, y: pnl.innerY + 0.3, w: pnl.innerW, h: 0.4, fontSize: 11, color: GREY, align: "center" });
            continue;
        }
        s.addTable(
            ([
                ["Name", "Role", "Company", "Targets", "Achieved"].map((h, i) => ({
                    text: h,
                    options: { bold: true, fontSize: 9, color: "FFFFFF", fill: { color: NAVY }, align: i >= 3 ? "right" : "left" },
                })),
                ...slice.map((r) => [
                    { text: r.name, options: { fontSize: 9.5, bold: true, color: NAVY, align: "left" } },
                    { text: r.position_title || "—", options: { fontSize: 9, color: GREY, align: "left" } },
                    { text: r.banner_name || "—", options: { fontSize: 9, color: GREY, align: "left" } },
                    { text: String(r.targetCount), options: { fontSize: 9.5, color: r.targetCount ? GREY : "C0392B", align: "right" } },
                    {
                        text: r.targetCount === 0 ? r.statusLabel : pctCell(r.pct),
                        options: { fontSize: 10.5, bold: true, color: r.targetCount === 0 ? "C0392B" : pctColor(r.pct), align: "right" },
                    },
                ]),
            ] as any),
            {
                x: pnl.innerX, y: pnl.innerY, w: pnl.innerW,
                colW: [2.6, 3.4, 2.4, 1.2, 1.6].map((c) => (c / 11.2) * pnl.innerW),
                border: { type: "solid", color: LIGHT, pt: 0.5 }, valign: "middle", autoPage: false,
            } as any
        );
    }

    await pptx.writeFile({ fileName: `performance-${slug(bannerName)}-${slug(cycleName)}.pptx` });
}

// ── One person ────────────────────────────────────────────────────────────
export async function exportPerformanceEmployeePptx(input: {
    cycleName: string;
    name: string;
    positionTitle: string | null;
    bannerName: string | null;
    photo?: string | null;
    targets: PerfExportTarget[];
    overallPct: number | null;
    weightTotal: number;
}) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";

    const { cycleName, name, positionTitle, bannerName, targets, overallPct, weightTotal } = input;
    const photo = input.photo ? await fetchImageAsDataUri(input.photo) : null;

    const s = pptx.addSlide();
    chrome(
        s, "Performance review",
        name,
        [positionTitle, bannerName, cycleName].filter(Boolean).join(" · "),
        "",
        photo
    );

    // Headline: overall achievement, and whether the weights actually add up
    const head = panel(s, MARGIN, 1.45, 3.1, 1.5, "Overall");
    s.addText(pctCell(overallPct), { x: head.innerX, y: head.innerY + 0.1, w: head.innerW, h: 0.55, fontSize: 34, bold: true, color: pctColor(overallPct) });
    s.addText(
        `${targets.length} target${targets.length === 1 ? "" : "s"} · weights total ${Math.round(weightTotal)}%${Math.round(weightTotal) === 100 || weightTotal === 0 ? "" : " (should be 100%)"}`,
        { x: head.innerX, y: head.innerY + 0.68, w: head.innerW, h: 0.3, fontSize: 9.5, color: GREY }
    );

    const pnl = panel(s, MARGIN + 3.3, 1.45, PAGE_W - MARGIN * 2 - 3.3, PAGE_H - 1.45 - 0.55, "Goals & achievement");
    if (!targets.length) {
        s.addText("No targets recorded for this cycle.", { x: pnl.innerX, y: pnl.innerY + 0.3, w: pnl.innerW, h: 0.4, fontSize: 11, color: GREY, align: "center" });
    } else {
        // Grouped under the objective each target serves, the same way the
        // on-screen table reads, so the deck and the app tell one story.
        const groups = new Map<string, PerfExportTarget[]>();
        targets.forEach((t) => {
            const k = t.goalTitle ?? "";
            const a = groups.get(k) || [];
            a.push(t);
            groups.set(k, a);
        });

        const rows: any[] = [
            PERF_HEADER.map((h, i) => ({
                text: i === 0 ? "Goal / target" : h,
                options: { bold: true, fontSize: 9, color: "FFFFFF", fill: { color: NAVY }, align: i === 0 ? "left" : "right" },
            })),
        ];
        groups.forEach((items, goalTitle) => {
            if (groups.size > 1 || goalTitle) {
                rows.push([
                    { text: goalTitle || "Not tied to a company objective", options: { fontSize: 9, bold: true, color: NAVY, fill: { color: "EEF2F7" }, align: "left" } },
                    ...Array(4).fill({ text: "", options: { fill: { color: "EEF2F7" } } }),
                ]);
            }
            items.forEach((t) => {
                rows.push([
                    { text: `${goalTitle ? "     " : ""}${t.title}`, options: { fontSize: 9.5, color: NAVY, align: "left" } },
                    { text: t.weight != null ? `${t.weight}%` : "—", options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: measureCell(t.target_value, t.metric_unit), options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: t.actual_value != null ? String(t.actual_value) : "—", options: { fontSize: 9.5, color: GREY, align: "right" } },
                    { text: pctCell(t.pct), options: { fontSize: 11, bold: true, color: pctColor(t.pct), align: "right" } },
                ]);
            });
        });

        s.addTable(rows, {
            x: pnl.innerX, y: pnl.innerY, w: pnl.innerW,
            colW: colWidths(pnl.innerW),
            border: { type: "solid", color: LIGHT, pt: 0.5 }, valign: "middle", autoPage: false,
        });
    }

    await pptx.writeFile({ fileName: `performance-${slug(name)}-${slug(cycleName)}.pptx` });
}

// Shared column proportions for the goal/target tables.
function colWidths(total: number): number[] {
    return [5.4, 1.1, 1.5, 1.2, 1.4].map((c) => (c / 10.6) * total);
}

function slug(s: string): string {
    return (s || "export").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

// ---------------- COMPARISON ----------------
export async function exportComparisonPptx(details: EmployeeDetail[], compOnly: boolean) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";

    // Same headshots the org snapshot needs — subject, manager, function
    // manager, reports — loaded once up front like the Proposal export does.
    const photos = await loadPhotos(details.flatMap((d) => [
        d.photo, d.manager?.photo, d.functionManager?.photo,
        ...(d.reports || []).map((r) => r.photo),
    ]));
    const photoOf = (url: string | null | undefined) => (url ? photos.get(url) || null : null);

    // ---- Overview slide ----
    const s = pptx.addSlide();
    chrome(s, "Compensation Review", "Employee Comparison", `${details.length} employees · ${compOnly ? "compensation only (excl. benefits)" : "total compensation"} · ${new Date().toLocaleDateString("en-GB")}`, "");

    const colW = Math.min(2.4, 12.5 / details.length);
    details.forEach((d, i) => {
        const x = 0.4 + i * colW;
        s.addText([
            { text: d.name, options: { bold: true, fontSize: 11, color: NAVY, breakLine: true } },
            { text: d.position_title || "", options: { fontSize: 9, color: GREY } },
        ], { x, y: 1.4, w: colW, h: 0.7, align: "center" });
    });

    const vals = details.map((d) => compOnly ? compensationOnly(d.compensation) : (d.total_compensation || 0));
    s.addChart(pptx.ChartType.bar, [{ name: compOnly ? "Compensation" : "Total Compensation", labels: details.map((d) => d.name), values: vals }], {
        x: 0.5, y: 2.3, w: 12.3, h: 4.4,
        barDir: "col", showValue: true, dataLabelFormatCode: "#,##0", chartColors: [ACCENT],
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, showLegend: false,
        valAxisLabelFormatCode: "#,##0",
    });

    // ---- detail slide per employee ----
    for (const d of details) {
        const ds = pptx.addSlide();
        chrome(ds, "Compensation Review", d.name, `${d.position_title || ""} · ${d.banner_name || ""} · ${d.country || ""}`, "");

        const c = d.compensation;
        const left = [
            ["Date of Birth", formatDate(d.date_of_birth)],
            ["Hire Date", formatDate(d.hire_date)],
            ["Years of Service", formatYears(d.hire_date)],
            ["Years in Position", formatYears(d.position_effective_date)],
            ["Status", d.status],
            ["Team Size", String(d.team_size)],
        ];
        const right = [
            ["Total Compensation", formatCurrency(d.total_compensation)],
            ["Base / Salary", formatCurrency(c?.base_salary)],
            ["STI Target", formatCurrency(c?.sti_target)],
            ["LTI Target", formatCurrency(c?.lti_target)],
            ["Other Bonus", formatCurrency(c?.other_bonus)],
            ["Medical", formatCurrency(c?.allowance_private_medical)],
        ];
        const p1 = panel(ds, MARGIN, 1.45, 6.05, 3.7, "Personal & Employment");
        ds.addTable(left.map(([k, v], i) => [
            { text: k, options: { color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
            { text: v, options: { bold: true, align: "right", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
        ]), { x: p1.innerX, y: p1.innerY, w: p1.innerW, fontSize: 11, border: { type: "none" } });

        const p2 = panel(ds, 6.85, 1.45, 6.05, 3.7, "Compensation & Benefits");
        ds.addTable(right.map(([k, v], i) => [
            { text: k, options: { color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
            { text: v, options: { bold: true, align: "right", color: k === "Total Compensation" ? ACCENT : "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
        ]), { x: p2.innerX, y: p2.innerY, w: p2.innerW, fontSize: 11, border: { type: "none" } });

        // performance
        const fys = [2021, 2022, 2023, 2024, 2025];
        const p3 = panel(ds, MARGIN, 5.35, 12.5, 1.55, "Performance — Last 5 Years");
        const perfRow = fys.map((fy) => ({ text: d.performance.find((p) => p.fiscal_year === fy)?.grade || "-", options: { align: "center" as const, bold: true, fontSize: 14, color: NAVY } }));
        ds.addTable([
            fys.map((fy) => ({ text: `FY${fy}`, options: { align: "center" as const, color: GREY, fill: { color: "EEF2F7" } } })),
            perfRow,
        ], { x: p3.innerX, y: p3.innerY, w: p3.innerW, fontSize: 11, border: { type: "solid", color: LIGHT, pt: 0.5 } });

        // ---- Organization slide — same "snap org" snippet as the Proposal export ----
        const os = pptx.addSlide();
        chrome(os, "Compensation Review", `${d.name} — Organization`, `${d.position_title || ""}${d.banner_name ? " · " + d.banner_name : ""}`, "");
        const op = panel(os, MARGIN, 1.45, PAGE_W - MARGIN * 2, 5.4, "Organization");
        drawOrgSnapshot(os, op.innerX, op.innerY + 0.1, op.innerW, d, photoOf);
    }

    await pptx.writeFile({ fileName: `employee-comparison-${Date.now()}.pptx` });
}

// ---------------- APPOINTMENT & COMPENSATION REVIEW PROPOSAL ----------------
export interface ProposalExportInput {
    employee: EmployeeDetail;
    newPositionTitle: string | null;
    newManagerName: string | null;
    approvalNewRole: boolean;
    approvalCompAdjustment: boolean;
    approvalOtherLabel: string;
    effectiveDate: string;
    justification: string;
    roleDescription: string;
    historyColumns: SalaryReviewColumn[]; // history + current + propose (last item)
    comparisonPeople?: EmployeeDetail[]; // subject + pinned benchmark peers (for the Peer Benchmarking slide)
    assessment?: { headline: string | null; fitBullets: string[]; marketBullets: string[] } | null; // AI Assessment tab result
    // No form field collects this yet — the new "Other Considerations" slide
    // (matching the CGE template's final page) renders "— none —" until one exists.
    otherConsiderations?: string;
}

export async function exportProposalPptx(input: ProposalExportInput) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";
    const { employee: e, historyColumns } = input;
    const peers = input.comparisonPeople ?? [];
    const hasPeers = peers.length >= 2; // subject + at least one benchmark peer
    const assessment = input.assessment;
    const hasAssessment = !!(assessment && (assessment.headline || assessment.fitBullets.length || assessment.marketBullets.length));
    // Numbering matches the CGE template's own absolute page count: the cover
    // carries no visible page number there, so "2" starts at the Agenda.
    const total = 5 + (hasPeers ? 1 : 0) + (hasAssessment ? 1 : 0);
    const agendaNum = 2, summaryNum = 3, orgNum = 4, salaryNum = 5;
    const peerNum = hasPeers ? 6 : null;
    const assessNum = hasAssessment ? (hasPeers ? 7 : 6) : null;
    const otherNum = total;

    // Load every headshot we'll draw (subject, manager, function manager, reports, peers) once.
    const photos = await loadPhotos([
        e.photo, e.manager?.photo, e.functionManager?.photo,
        ...(e.reports || []).map((r) => r.photo),
        ...peers.map((p) => p.photo),
    ]);
    const photoOf = (url: string | null | undefined) => (url ? photos.get(url) || null : null);

    // ---- Cover (template page 1): title page, no running page number ----
    const cover = pptx.addSlide();
    applyBrandFont(cover);
    cover.background = { color: "FFFFFF" };
    const coverLogoW = 3.4, coverLogoH = coverLogoW / LOGO_AR;
    cover.addImage({ path: LOGO, x: (PAGE_W - coverLogoW) / 2, y: 1.5, w: coverLogoW, h: coverLogoH });
    cover.addShape("rect", { x: (PAGE_W - 1.2) / 2, y: 2.75, w: 1.2, h: 0.045, fill: { color: ACCENT } });
    cover.addText("APPOINTMENT & COMPENSATION REVIEW", { x: MARGIN, y: 3.05, w: PAGE_W - MARGIN * 2, h: 0.6, align: "center", fontSize: 26, bold: true, color: NAVY });
    cover.addText("PROPOSAL TO CGE REMCO", { x: MARGIN, y: 3.68, w: PAGE_W - MARGIN * 2, h: 0.4, align: "center", fontSize: 14, bold: true, color: ACCENT, charSpacing: 1.5 });
    cover.addText(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }), { x: MARGIN, y: 4.15, w: PAGE_W - MARGIN * 2, h: 0.3, align: "center", fontSize: 11, color: GREY });

    // ---- Agenda (template page 2): the deck's real, fixed section order —
    // numbering here reflects actual document structure, not decoration. ----
    const agenda = pptx.addSlide();
    chrome(agenda, "Appointment & Compensation Review", "Content", `${e.name}${e.position_title ? " · " + e.position_title : ""}`, `${agendaNum} / ${total}`);
    const agendaItems = [
        "Proposal Summary",
        "Organization and Role Descriptions",
        "Compensation Proposal",
        "Market & Peer Comparison",
        "Other considerations (if any)",
    ];
    const rowH = 0.85, agendaTop = 1.7;
    agendaItems.forEach((label, i) => {
        const y = agendaTop + i * rowH;
        agenda.addText(String(i + 1).padStart(2, "0"), { x: MARGIN + 0.3, y, w: 1.1, h: rowH, fontSize: 26, bold: true, color: ACCENT, valign: "middle" });
        agenda.addText(label, { x: MARGIN + 1.6, y, w: PAGE_W - MARGIN * 2 - 1.6, h: rowH, fontSize: 15, bold: true, color: NAVY, valign: "middle" });
        if (i < agendaItems.length - 1) agenda.addShape("line", { x: MARGIN + 0.3, y: y + rowH, w: PAGE_W - MARGIN * 2 - 0.6, h: 0, line: { color: LIGHT, width: 0.75 } });
    });

    // ---- Slide 1 (template page 3): profile + justification ----
    const s1 = pptx.addSlide();
    chrome(s1, "Appointment & Compensation Review", e.name, `${e.position_title || ""}${e.banner_name ? " · " + e.banner_name : ""}${e.country ? " · " + e.country : ""}`, `${summaryNum} / ${total}`);

    // Large profile portrait, body-left
    drawAvatar(s1, 1.9, 2.35, 1.8, photoOf(e.photo), e.name);
    s1.addText(e.name, { x: 0.5, y: 3.35, w: 2.8, h: 0.3, align: "center", fontSize: 13, bold: true, color: NAVY });
    s1.addText(e.position_title || "", { x: 0.5, y: 3.62, w: 2.8, h: 0.25, align: "center", fontSize: 9.5, color: GREY });

    const p0 = panel(s1, 3.5, 1.45, PAGE_W - MARGIN - 3.5, 1.75, "Proposal Details");
    const headerRows = [
        ["Name", e.name, "YOS", `${formatYears(e.hire_date)} · ${formatYears(e.position_effective_date)} in position`],
        ["Current Position", e.position_title || "—", "Report to", e.manager?.name || "—"],
        ["New Position", input.newPositionTitle || "— unchanged —", "Report to", input.newManagerName || "— unchanged —"],
        ["Approval For", [input.approvalNewRole && "New role", input.approvalCompAdjustment && "Compensation adjustment", input.approvalOtherLabel].filter(Boolean).join("  ·  ") || "—", "Effective", input.effectiveDate ? formatDate(input.effectiveDate) : "—"],
    ];
    s1.addTable(headerRows.map((r) => [
        { text: r[0], options: { bold: true, fill: { color: "DCE9F5" }, fontSize: 10, color: NAVY } },
        { text: r[1], options: { fontSize: 10 } },
        { text: r[2], options: { bold: true, fill: { color: "DCE9F5" }, fontSize: 10, color: NAVY } },
        { text: r[3], options: { fontSize: 10 } },
    ]), { x: p0.innerX, y: p0.innerY, w: p0.innerW, colW: [1.9, p0.innerW / 2 - 1.9, 1.9, p0.innerW / 2 - 1.9], border: { type: "solid", color: LIGHT, pt: 0.5 }, autoPage: false });

    const p1 = panel(s1, MARGIN, 3.95, 6.05, 2.9, "Past Roles");
    const pastRows = (e.employment_history || []).map((h: any, i: number) => [
        { text: `${formatDate(h.start_date)} – ${h.end_date ? formatDate(h.end_date) : "Current"}`, options: { fontSize: 9, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
        { text: [h.position, h.banner].filter(Boolean).join(" · "), options: { fontSize: 9, bold: true, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
    ]);
    if (pastRows.length) {
        s1.addTable(pastRows, { x: p1.innerX, y: p1.innerY, w: p1.innerW, border: { type: "none" }, autoPage: false });
    } else {
        s1.addText("No history recorded", { x: p1.innerX, y: p1.innerY, w: p1.innerW, h: 0.3, fontSize: 10, color: GREY, italic: true });
    }

    const p2 = panel(s1, 6.85, 3.95, 6.05, 2.9, "Proposal Justification");
    const bullets = input.justification.split("\n").map((l) => l.trim()).filter(Boolean);
    s1.addText(
        bullets.length ? bullets.map((b) => ({ text: b, options: { bullet: { code: "25CF" }, breakLine: true, fontSize: 10.5, color: "1F2937", paraSpaceAfter: 8 } })) : [{ text: "— to be completed —", options: { fontSize: 10.5, color: GREY, italic: true } }],
        { x: p2.innerX, y: p2.innerY, w: p2.innerW, h: p2.innerH, valign: "top", fit: "shrink" }
    );

    // ---- Slide 2 (template page 4): org snippet + role description ----
    const s2 = pptx.addSlide();
    chrome(s2, "Appointment & Compensation Review", "Organization and Role", `${e.name} — ${e.position_title || ""}`, `${orgNum} / ${total}`);

    const p3 = panel(s2, MARGIN, 1.45, 6.05, 5.4, "Organization");
    drawOrgSnapshot(s2, p3.innerX, p3.innerY + 0.1, p3.innerW, e, photoOf);

    const p4 = panel(s2, 6.85, 1.45, 6.05, 5.4, "Role Description");
    const roleLines = input.roleDescription.split("\n").map((l) => l.trim()).filter(Boolean);
    s2.addText(
        roleLines.length ? roleLines.map((l) => ({ text: l, options: { bullet: { code: "25CF" }, breakLine: true, fontSize: 10.5, color: "1F2937", paraSpaceAfter: 8 } })) : [{ text: "— to be completed —", options: { fontSize: 10.5, color: GREY, italic: true } }],
        { x: p4.innerX, y: p4.innerY, w: p4.innerW, h: p4.innerH, valign: "top", fit: "shrink" }
    );

    // ---- Slide 3 (template page 5): salary review table ----
    const s3 = pptx.addSlide();
    chrome(s3, "Appointment & Compensation Review", "Salary Review Proposal", `${e.name}${e.position_title ? " · " + e.position_title : ""}${input.effectiveDate ? " · Effective " + formatDate(input.effectiveDate) : ""}`, `${salaryNum} / ${total}`);

    const proposeCol = historyColumns[historyColumns.length - 1];
    const priorCols = historyColumns.slice(0, -1);
    const currentCol = priorCols[priorCols.length - 1];
    const pctChange = (proposed: number | null | undefined, current: number | null | undefined) =>
        current ? ((proposed ?? 0) - current) / current * 100 : null;
    const change = pctChange(proposeCol.total_comp, currentCol?.total_comp);
    const baseChange = pctChange(proposeCol.base_salary, currentCol?.base_salary);

    const p5 = panel(s3, MARGIN, 1.45, PAGE_W - MARGIN * 2, 5.4, "Salary Review");
    // STIP/LTIP cell, Mariella-style "(%) | €amount". Historical columns carry
    // an actual line on top + eligible (target) line beneath; current/proposed
    // columns only have a target, so a single line is returned.
    const bonusCell = (c: SalaryReviewColumn, actPct: number | null | undefined, amt: number | null | undefined, eligPct: number | null | undefined) => {
        const line = (pct: number | null | undefined, a: number | null | undefined) => `(${pct ?? "—"}%) | ${formatCurrency(a)}`;
        if (actPct != null) {
            const eligAmt = eligPct != null && c.base_salary != null ? Math.round((eligPct * c.base_salary) / 100) : null;
            return [
                { text: line(actPct, amt), options: { breakLine: true } },
                { text: eligPct != null ? line(eligPct, eligAmt) : " ", options: { fontSize: 7.5, color: GREY } },
            ];
        }
        return line(eligPct, amt);
    };
    const salaryRows: [string, (c: SalaryReviewColumn) => any, boolean?][] = [
        ["Banner/Unit", (c) => c.banner || "—"],
        ["Role", (c) => c.role || "—"],
        ["Effective", (c) => c.effective ? formatDate(c.effective) : "—"],
        ["Base Salary", (c) => formatCurrency(c.base_salary), true],
        ["Cash Allowance", (c) => formatCurrency(c.cash_allowance)],
        ["Guaranteed Cash", (c) => formatCurrency(c.guaranteed_cash), true],
        ["STIP", (c) => bonusCell(c, c.sti_actual_pct, c.sti_amount, c.sti_eligible_pct)],
        ["LTIP", (c) => bonusCell(c, c.lti_actual_pct, c.lti_amount, c.lti_eligible_pct)],
        ["Total Comp", (c) => formatCurrency(c.total_comp), true],
        ["Pension Contribution", (c) => formatCurrency(c.pension_contribution)],
        ["Other items", (c) => c.other_items || "—"],
        ["Other remarks", (c) => c.other_remarks || "—"],
    ];
    const header = [
        { text: "Unit: EUR", options: { bold: true, fill: { color: NAVY }, color: "FFFFFF", fontSize: 9 } },
        ...priorCols.map((c) => ({ text: c.label, options: { bold: true, fill: { color: "DCE4EC" }, fontSize: 9, align: "center" as const, color: NAVY } })),
        { text: proposeCol.label, options: { bold: true, fill: { color: ACCENT }, color: "FFFFFF", fontSize: 9, align: "center" as const } },
        { text: "Change", options: { bold: true, italic: true, fill: { color: "DCE4EC" }, fontSize: 9, align: "center" as const, color: NAVY } },
    ];
    const body = salaryRows.map(([label, get, bold], ri) => {
        const isTotal = label === "Total Comp";
        const isBonus = label === "STIP" || label === "LTIP";
        const zebra = isTotal ? ACCENT_LIGHT : (ri % 2 ? "FFFFFF" : "F1F5F9");
        const changeVal = label === "Base Salary" ? baseChange : label === "Total Comp" ? change : null;
        // STIP/LTIP labels mirror the two figure lines: "(Actual)" on top, "Eligible" beneath.
        const labelCell = isBonus
            ? { text: [
                { text: `${label} (Actual)`, options: { bold: true, breakLine: true } },
                { text: "Eligible", options: { fontSize: 7.5, color: GREY } },
              ], options: { fontSize: 9, color: NAVY, fill: { color: zebra } } }
            : { text: label, options: { bold: true, fontSize: 9, color: NAVY, fill: { color: zebra } } };
        return [
            labelCell,
            ...priorCols.map((c) => ({ text: get(c), options: { fontSize: 9, align: "center" as const, bold: !!bold, fill: { color: zebra } } })),
            { text: get(proposeCol), options: { fontSize: 9, align: "center" as const, bold: !!bold, fill: { color: isTotal ? ACCENT_LIGHT : "EFF6FC" } } },
            { text: changeVal == null ? "" : `${changeVal >= 0 ? "+" : ""}${changeVal.toFixed(1)}%`, options: { fontSize: 9, align: "center" as const, bold: true, color: changeVal == null ? GREY : changeVal > 0 ? "047857" : changeVal < 0 ? "B91C1C" : GREY, fill: { color: zebra } } },
        ];
    });
    s3.addTable([header, ...body], { x: p5.innerX, y: p5.innerY, w: p5.innerW, border: { type: "solid", color: LIGHT, pt: 0.5 }, autoPage: false });

    // ---- Slide 4 (template page 6): peer benchmarking (from the proposal's comparison set) ----
    if (hasPeers) {
        const s4 = pptx.addSlide();
        chrome(s4, "Appointment & Compensation Review", "Peer Benchmarking", `${e.name} vs ${peers.length - 1} peer${peers.length - 1 === 1 ? "" : "s"} · current compensation at target`, `${peerNum} / ${total}`);
        const p6 = panel(s4, MARGIN, 1.45, PAGE_W - MARGIN * 2, 5.4, "Peer Benchmarking — CEOs / MDs / CFOs");

        const allowOf = (d: EmployeeDetail) => (d.compensation?.allowance_company_car ?? 0) + (d.compensation?.allowance_mobility ?? 0) + (d.compensation?.allowance_home_office ?? 0);
        const baseOf = (d: EmployeeDetail) => d.compensation?.base_salary ?? 0;
        const stiOf = (d: EmployeeDetail) => d.compensation?.sti_target ?? 0;
        const ltiOf = (d: EmployeeDetail) => d.compensation?.lti_target ?? 0;
        const pctOf = (amt: number, base: number) => (base > 0 ? Math.round((amt / base) * 100) : null);
        const tgtCell = (amt: number, base: number) => `(${pctOf(amt, base) ?? "—"}%) | ${formatCurrency(amt)}`;

        const benchRows: [string, (d: EmployeeDetail) => string, boolean?][] = [
            ["Base Salary", (d) => formatCurrency(baseOf(d)), true],
            ["Cash Allowance", (d) => formatCurrency(allowOf(d))],
            ["Guaranteed Cash", (d) => formatCurrency(baseOf(d) + allowOf(d)), true],
            ["STIP @ Target", (d) => tgtCell(stiOf(d), baseOf(d))],
            ["LTIP @ Target", (d) => tgtCell(ltiOf(d), baseOf(d))],
            ["Total Comp", (d) => formatCurrency(baseOf(d) + stiOf(d) + ltiOf(d)), true],
        ];

        const labelW = 1.7;
        const peerW = (p6.innerW - labelW) / peers.length;
        const colW = [labelW, ...peers.map(() => peerW)];

        const headerRow = [
            { text: "Unit: EUR", options: { bold: true, fill: { color: NAVY }, color: "FFFFFF", fontSize: 8, valign: "middle" as const } },
            ...peers.map((d, i) => ({
                text: [
                    { text: d.name, options: { bold: true, fontSize: 8.5, breakLine: true } },
                    { text: d.position_title || "", options: { fontSize: 7, color: i === 0 ? "C7D2E0" : GREY, breakLine: true } },
                    { text: i === 0 ? "Subject · Current" : d.employee_id < 0 ? "What-if scenario" : `Peer ${i}`, options: { fontSize: 6.5, italic: true, color: i === 0 ? ACCENT_LIGHT : d.employee_id < 0 ? ACCENT : "94A3B8" } },
                ],
                options: { align: "center" as const, fill: { color: i === 0 ? NAVY : "DCE4EC" }, color: i === 0 ? "FFFFFF" : NAVY, valign: "middle" as const },
            })),
        ];

        const benchBody = benchRows.map(([label, get, bold], ri) => {
            const isTotal = label === "Total Comp";
            const zebra = isTotal ? ACCENT_LIGHT : (ri % 2 ? "FFFFFF" : "F1F5F9");
            return [
                { text: label, options: { bold: true, fontSize: 8.5, color: NAVY, fill: { color: zebra } } },
                ...peers.map((d, i) => ({
                    text: get(d),
                    options: { fontSize: 8.5, align: "center" as const, valign: "middle" as const, bold: !!bold || i === 0, color: isTotal ? ACCENT : "1F2937", fill: { color: i === 0 ? (isTotal ? ACCENT_LIGHT : "EFF6FC") : zebra } },
                })),
            ];
        });

        // headshot strip aligned to each peer column, above the table
        const avSize = Math.min(0.72, peerW - 0.25);
        peers.forEach((d, i) => {
            const cxp = p6.innerX + labelW + i * peerW + peerW / 2;
            drawAvatar(s4, cxp, p6.innerY + 0.42, avSize, photoOf(d.photo), d.name);
        });

        s4.addTable([headerRow, ...benchBody], { x: p6.innerX, y: p6.innerY + 0.95, w: p6.innerW, colW, border: { type: "solid", color: LIGHT, pt: 0.5 }, autoPage: false, valign: "middle" });
        s4.addText("Current compensation at target (STIP/LTIP shown at eligibility). Total Comp = Base + STIP + LTIP.", { x: p6.innerX, y: 6.55, w: p6.innerW, h: 0.3, fontSize: 8, italic: true, color: GREY });
    }

    // ---- Slide 5: AI Talent Assessment ----
    if (hasAssessment && assessment) {
        const s5 = pptx.addSlide();
        chrome(s5, "Appointment & Compensation Review", "AI Talent Assessment", `${e.name}${e.position_title ? " · " + e.position_title : ""}`, `${assessNum} / ${total}`);

        if (assessment.headline) {
            s5.addShape("roundRect", { x: MARGIN, y: 1.4, w: PAGE_W - MARGIN * 2, h: 0.55, rectRadius: 0.06, fill: { color: "F1F5F9" }, line: { color: LIGHT, width: 0.75 } });
            s5.addText(assessment.headline, { x: MARGIN + 0.2, y: 1.4, w: PAGE_W - MARGIN * 2 - 0.4, h: 0.55, fontSize: 13, bold: true, color: NAVY, valign: "middle" });
        }

        const bodyTop = assessment.headline ? 2.15 : 1.45;
        const bodyH = 5.75 - (bodyTop - 1.45);
        const halfW = (PAGE_W - MARGIN * 2 - 0.3) / 2;

        const p7 = panel(s5, MARGIN, bodyTop, halfW, bodyH, "Fit vs Peers & Job Description");
        s5.addText(
            assessment.fitBullets.length
                ? assessment.fitBullets.map((b) => ({ text: b, options: { bullet: { code: "25CF" }, breakLine: true, fontSize: 10.5, color: "1F2937", paraSpaceAfter: 8 } }))
                : [{ text: "— no assessment generated —", options: { fontSize: 10.5, color: GREY, italic: true } }],
            { x: p7.innerX, y: p7.innerY, w: p7.innerW, h: p7.innerH, valign: "top", fit: "shrink" }
        );

        const p8 = panel(s5, MARGIN + halfW + 0.3, bodyTop, halfW, bodyH, "Market Context");
        s5.addText(
            [
                ...(assessment.marketBullets.length
                    ? assessment.marketBullets.map((b) => ({ text: b, options: { bullet: { code: "25CF" }, breakLine: true, fontSize: 10.5, color: "1F2937", paraSpaceAfter: 8 } }))
                    : [{ text: "— no market context available —", options: { breakLine: true, fontSize: 10.5, color: GREY, italic: true } }]),
                { text: "Qualitative, general-knowledge context only — not verified against live compensation survey data.", options: { fontSize: 8, italic: true, color: GREY, breakLine: false } },
            ],
            { x: p8.innerX, y: p8.innerY, w: p8.innerW, h: p8.innerH, valign: "top", fit: "shrink" }
        );
    }

    // ---- Other Considerations (template's final page): always last ----
    const s6 = pptx.addSlide();
    chrome(s6, "Appointment & Compensation Review", "Other Considerations (if any)", `${e.name}${e.position_title ? " · " + e.position_title : ""}`, `${otherNum} / ${total}`);
    const otherNotes = (input.otherConsiderations || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const p9 = panel(s6, MARGIN, 1.45, PAGE_W - MARGIN * 2, 5.4, "Other Considerations");
    s6.addText(
        otherNotes.length
            ? otherNotes.map((b) => ({ text: b, options: { bullet: { code: "25CF" }, breakLine: true, fontSize: 11, color: "1F2937", paraSpaceAfter: 10 } }))
            : [{ text: "— none —", options: { fontSize: 11, color: GREY, italic: true } }],
        { x: p9.innerX, y: p9.innerY, w: p9.innerW, h: p9.innerH, valign: "top", fit: "shrink" }
    );

    await pptx.writeFile({ fileName: `proposal-${e.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pptx` });
}

// ---------------- ICPD PROFILE ----------------
// Two-slide layout modeled on the sample "Royal Flush Profile" deck (Name/
// Position/Level/YOS/Age/Function/Report-to header, Performance Grade box,
// Top Strength/Development Areas, Education, Leadership Competencies, Work
// Experiences, Action Plan, Achievements, Periodical Assessment on slide 1;
// Succession Positions, Career Planning, Preparation to Support Next Roles,
// Mentor & Mobility on slide 2) — redrawn in this app's own Central Group
// brand system (chrome/panel) rather than cloned pixel-for-pixel, so it reads
// as one family with every other export here. Fields already shown on the
// Profile tab (career history, performance grade) are repeated only where
// the sample itself repeats them (the header strip); nothing is duplicated
// beyond that.
function wholeYears(date: string | null | undefined): string {
    const y = yearsBetween(date);
    return y == null ? "—" : `${Math.floor(y)}Y`;
}

function drawIcpdHeader(slide: any, x: number, y: number, w: number, h: number, e: EmployeeDetail) {
    const p = panel(slide, x, y, w, h, "Profile");
    const rows: [string, string][] = [
        ["Name", e.name],
        ["Position", e.position_title || "—"],
        ["Level", e.job_grade || "—"],
        ["YOS / YIP", `${wholeYears(e.hire_date)} / ${wholeYears(e.position_effective_date)}`],
        ["Age", e.date_of_birth ? `${calcAge(e.date_of_birth)}Y` : "—"],
        ["Function", e.function_name || "—"],
        ["Report to", e.manager?.name || "—"],
    ];
    slide.addTable(
        rows.map(([k, v], i) => [
            { text: k, options: { bold: true, fontSize: 8.5, color: NAVY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
            { text: v, options: { fontSize: 8.5, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
        ]),
        { x: p.innerX, y: p.innerY, w: p.innerW, colW: [p.innerW * 0.4, p.innerW * 0.6], border: { type: "none" }, autoPage: false, valign: "middle" }
    );
}

function drawPerformanceGradeBox(slide: any, x: number, y: number, w: number, h: number, performance: PerformanceGradeLike[]) {
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color: "DCE9F5" }, line: { color: LIGHT, width: 0.75 } });
    const years = [...performance].sort((a, b) => b.fiscal_year - a.fiscal_year).slice(0, 3);
    slide.addText(
        [
            { text: "Performance Grade", options: { bold: true, fontSize: 9.5, color: NAVY, breakLine: true, paraSpaceAfter: 4 } },
            ...(years.length
                ? years.map((y) => ({ text: `FY${y.fiscal_year}: ${y.grade || "—"}`, options: { fontSize: 9, color: "1F2937", breakLine: true } }))
                : [{ text: "No grades recorded", options: { fontSize: 9, italic: true, color: GREY } }]),
        ],
        { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: h - 0.2, valign: "top" }
    );
}

interface PerformanceGradeLike { fiscal_year: number; grade: string | null }

// Mirrors READY_COLOR's labels in succession-seat-dialog.tsx.
const READINESS_LABEL: Record<string, string> = { ready_now: "Ready Now", ready_1_3: "Ready 1-3Y", ready_3_5: "Ready 3-5Y" };

function bulletsOrPlaceholder(items: string[], placeholder: string, fontSize = 9) {
    return items.length
        ? items.map((t) => ({ text: t, options: { bullet: { code: "25CF" }, breakLine: true, fontSize, color: "1F2937", paraSpaceAfter: 3 } }))
        : [{ text: placeholder, options: { fontSize, italic: true, color: GREY } }];
}

export async function exportIcpdProfilePptx(input: { employee: EmployeeDetail; icpd: IcpdData }) {
    const Pptx = (await import("pptxgenjs")).default;
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";
    const { employee: e, icpd } = input;
    const photo = e.photo ? await fetchImageAsDataUri(e.photo) : null;
    const subtitle = [e.position_title, e.banner_name, e.country].filter(Boolean).join(" · ");

    const leftX = MARGIN, leftW = 3.9;
    const rightX = MARGIN + leftW + 0.25, rightW = PAGE_W - MARGIN - rightX;

    // ── Slide 1: Current Role ──────────────────────────────────────────────
    const s1 = pptx.addSlide();
    chrome(s1, "ICPD Profile", e.name, subtitle, "1", photo);

    drawIcpdHeader(s1, leftX, 1.45, leftW, 2.3, e);
    drawPerformanceGradeBox(s1, leftX, 3.85, leftW, 0.85, e.performance);

    const strengths = (e.background || []).filter((b: any) => b.type === "strength");
    const devAreas = (e.background || []).filter((b: any) => b.type === "development_area");
    const sd = panel(s1, leftX, 4.8, leftW, 1.95, "Strengths & Development Areas");
    const halfW = (sd.innerW - 0.15) / 2;
    s1.addText([
        { text: "Top Strength", options: { bold: true, fontSize: 8.5, color: NAVY, breakLine: true, paraSpaceAfter: 3 } },
        ...bulletsOrPlaceholder(strengths.map((b: any) => b.title || b.detail || "—"), "—", 8),
    ], { x: sd.innerX, y: sd.innerY, w: halfW, h: sd.innerH, valign: "top", fit: "shrink" });
    s1.addText([
        { text: "Development Areas", options: { bold: true, fontSize: 8.5, color: NAVY, breakLine: true, paraSpaceAfter: 3 } },
        ...bulletsOrPlaceholder(devAreas.map((b: any) => b.title || b.detail || "—"), "—", 8),
    ], { x: sd.innerX + halfW + 0.15, y: sd.innerY, w: halfW, h: sd.innerH, valign: "top", fit: "shrink" });

    const lc = panel(s1, rightX, 1.45, rightW, 1.1, "Leadership Competencies");
    s1.addText(
        bulletsOrPlaceholder(icpd.competencies.map((c) => c.rating ? `${c.competency_name} — ${c.rating}` : c.competency_name), "No competencies recorded yet", 9),
        { x: lc.innerX, y: lc.innerY, w: lc.innerW, h: lc.innerH, valign: "top", fit: "shrink" }
    );

    const we = panel(s1, rightX, 2.65, rightW, 1.35, "Work Experiences (Internal & External)");
    const workRows = (e.employment_history || []).slice(0, 4);
    if (workRows.length) {
        s1.addTable(
            [
                ["Date", "Position", "Company"].map((h) => ({ text: h, options: { bold: true, fontSize: 8, color: "FFFFFF", fill: { color: NAVY } } })),
                ...workRows.map((h: any, i: number) => [
                    { text: `${formatDate(h.start_date)} – ${h.end_date ? formatDate(h.end_date) : "Current"}`, options: { fontSize: 8, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: h.position || "—", options: { fontSize: 8, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: h.banner || "—", options: { fontSize: 8, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                ]),
            ],
            { x: we.innerX, y: we.innerY, w: we.innerW, colW: [we.innerW * 0.32, we.innerW * 0.4, we.innerW * 0.28], border: { type: "none" }, autoPage: false }
        );
    } else {
        s1.addText("No work experience recorded yet", { x: we.innerX, y: we.innerY, w: we.innerW, h: 0.3, fontSize: 9, italic: true, color: GREY });
    }

    const ap = panel(s1, rightX, 4.1, rightW, 0.95, "Action Plan");
    const actionPlans = icpd.developmentPlans.filter((p) => p.category === "action_plan").slice(0, 2);
    if (actionPlans.length) {
        s1.addTable(
            [
                ["Development Plan", "Next Steps", "By When", "Status"].map((h) => ({ text: h, options: { bold: true, fontSize: 7.5, color: "FFFFFF", fill: { color: NAVY } } })),
                ...actionPlans.map((p, i) => [
                    { text: p.plan, options: { fontSize: 8, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.next_steps || "—", options: { fontSize: 8, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.by_when || "—", options: { fontSize: 8, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.status || "—", options: { fontSize: 8, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                ]),
            ],
            { x: ap.innerX, y: ap.innerY, w: ap.innerW, colW: [ap.innerW * 0.34, ap.innerW * 0.34, ap.innerW * 0.16, ap.innerW * 0.16], border: { type: "none" }, autoPage: false }
        );
    } else {
        s1.addText("No action plan recorded yet", { x: ap.innerX, y: ap.innerY, w: ap.innerW, h: 0.3, fontSize: 9, italic: true, color: GREY });
    }

    const ach = panel(s1, rightX, 5.15, rightW, 0.95, "Achievements");
    s1.addText(
        bulletsOrPlaceholder(icpd.achievements.map((a) => a.description), "No achievements recorded yet", 8.5),
        { x: ach.innerX, y: ach.innerY, w: ach.innerW, h: ach.innerH, valign: "top", fit: "shrink" }
    );

    const pa = panel(s1, rightX, 6.2, rightW, 0.85, "Periodical Assessment");
    const latestAssessment = [...icpd.periodicAssessments].sort((a, b) => b.fiscal_year - a.fiscal_year)[0];
    const paCells = [
        ["Performance", latestAssessment?.performance],
        ["Commitment & Engagement", latestAssessment?.commitment_engagement],
        ["Promotion Readiness", latestAssessment?.promotion_readiness],
        ["Risk of Losing", latestAssessment?.risk_of_losing],
    ];
    const paColW = pa.innerW / 4;
    paCells.forEach(([label, value], i) => {
        s1.addText(
            [
                { text: label as string, options: { fontSize: 6.5, color: GREY, breakLine: true } },
                { text: value || "—", options: { fontSize: 9, bold: true, color: NAVY } },
            ],
            { x: pa.innerX + i * paColW, y: pa.innerY, w: paColW, h: pa.innerH, align: "center" }
        );
    });

    // ── Slide 2: Career Planning & Succession ───────────────────────────────
    const s2 = pptx.addSlide();
    chrome(s2, "ICPD Profile", e.name, subtitle, "2", photo);

    drawIcpdHeader(s2, leftX, 1.45, leftW, 2.3, e);
    drawPerformanceGradeBox(s2, leftX, 3.85, leftW, 0.85, e.performance);

    const mm = panel(s2, leftX, 4.8, leftW, 1.95, "Mentor & Mobility");
    s2.addText(
        [
            { text: "Mentor", options: { bold: true, fontSize: 8.5, color: NAVY, breakLine: true, paraSpaceAfter: 2 } },
            { text: icpd.mentor?.name || "n/a", options: { fontSize: 9.5, color: "1F2937", breakLine: true, paraSpaceAfter: 10 } },
            { text: "Potential Career Movement Across CRC", options: { bold: true, fontSize: 8.5, color: NAVY, breakLine: true, paraSpaceAfter: 2 } },
            { text: icpd.crossGroupMobility == null ? "Not yet assessed" : icpd.crossGroupMobility ? "Yes" : "No", options: { fontSize: 9.5, color: "1F2937" } },
        ],
        { x: mm.innerX, y: mm.innerY, w: mm.innerW, h: mm.innerH, valign: "top" }
    );

    const sp = panel(s2, rightX, 1.45, rightW, 1.75, "Succession Positions");
    if (icpd.successionPositions.length) {
        const first = icpd.successionPositions[0];
        s2.addTable(
            [
                ["Position", "Company", "Current Incumbent", "Readiness"].map((h) => ({ text: h, options: { bold: true, fontSize: 8, color: "FFFFFF", fill: { color: NAVY } } })),
                ...icpd.successionPositions.slice(0, 3).map((p, i) => [
                    { text: p.seat_label || "—", options: { fontSize: 8.5, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.banner_name || "—", options: { fontSize: 8.5, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.incumbent_name || "—", options: { fontSize: 8.5, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: (p.readiness && READINESS_LABEL[p.readiness]) || p.readiness || "—", options: { fontSize: 8.5, bold: true, color: NAVY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                ]),
            ],
            { x: sp.innerX, y: sp.innerY, w: sp.innerW, border: { type: "none" }, autoPage: false }
        );
        if (first.attributes.length) {
            s2.addText(
                `Key Attributes Required: ${first.attributes.map((a) => a.potential ? `${a.attribute_name} (${a.potential})` : a.attribute_name).join(" · ")}`,
                { x: sp.innerX, y: sp.innerY + sp.innerH - 0.3, w: sp.innerW, h: 0.3, fontSize: 7.5, italic: true, color: GREY }
            );
        }
    } else {
        s2.addText("Not currently a candidate for any succession seat", { x: sp.innerX, y: sp.innerY, w: sp.innerW, h: 0.3, fontSize: 9, italic: true, color: GREY });
    }

    const cp = panel(s2, rightX, 3.3, rightW, 1.9, "Career Planning");
    if (icpd.careerSteps.length) {
        const csColW = [cp.innerW * 0.08, cp.innerW * 0.32, cp.innerW * 0.14, cp.innerW * 0.18, cp.innerW * 0.14, cp.innerW * 0.14];
        s2.addTable(
            [
                ["Step", "Destination Role", "Level", "Type", "By Year", "By Age"].map((h) => ({ text: h, options: { bold: true, fontSize: 7.5, color: "FFFFFF", fill: { color: NAVY } } })),
                ...[...icpd.careerSteps].sort((a, b) => (a.step_order || 0) - (b.step_order || 0)).slice(0, 5).map((s, i) => [
                    { text: String(s.step_order ?? "—"), options: { fontSize: 8, color: GREY, align: "center" as const, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: s.destination_role || "—", options: { fontSize: 8, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: s.level || "—", options: { fontSize: 8, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: s.type || "—", options: { fontSize: 8, color: GREY, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: s.by_year ? String(s.by_year) : "—", options: { fontSize: 8, color: GREY, align: "center" as const, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: s.by_age ? String(s.by_age) : "—", options: { fontSize: 8, color: GREY, align: "center" as const, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                ]),
            ],
            { x: cp.innerX, y: cp.innerY, w: cp.innerW, colW: csColW, border: { type: "none" }, autoPage: false }
        );
    } else {
        s2.addText("No career steps recorded yet", { x: cp.innerX, y: cp.innerY, w: cp.innerW, h: 0.3, fontSize: 9, italic: true, color: GREY });
    }

    const nr = panel(s2, rightX, 5.3, rightW, 1.7, "Preparation to Support Next Roles");
    const nextRolePlans = icpd.developmentPlans.filter((p) => p.category === "next_role_prep").slice(0, 3);
    if (nextRolePlans.length) {
        s2.addTable(
            [
                ["Year", "Key Action Plans"].map((h) => ({ text: h, options: { bold: true, fontSize: 8, color: "FFFFFF", fill: { color: NAVY } } })),
                ...nextRolePlans.map((p, i) => [
                    { text: p.by_when || "—", options: { fontSize: 8.5, color: NAVY, bold: true, fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                    { text: p.next_steps || p.plan, options: { fontSize: 8.5, color: "1F2937", fill: { color: i % 2 ? "FFFFFF" : "EEF2F7" } } },
                ]),
            ],
            { x: nr.innerX, y: nr.innerY, w: nr.innerW, colW: [nr.innerW * 0.15, nr.innerW * 0.85], border: { type: "none" }, autoPage: false }
        );
    } else {
        s2.addText("No preparation plan recorded yet", { x: nr.innerX, y: nr.innerY, w: nr.innerW, h: 0.3, fontSize: 9, italic: true, color: GREY });
    }

    await pptx.writeFile({ fileName: `icpd-profile-${e.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.pptx` });
}

// dashedBorder marks a box as a Head of Function relationship rather than the
// real management chain (matches the dashed connector into it). teamSize, when
// greater than 0, renders as a small "N FTE" corner badge — a sense of team
// size without needing to expand the chart any further.
function drawPersonBox(slide: any, x: number, y: number, w: number, h: number, name: string, title: string | null | undefined, isSubject: boolean, photoDataUri?: string | null, dashedBorder = false, banner?: string | null, teamSize?: number) {
    slide.addShape("roundRect", { x: x + 0.03, y: y + 0.03, w, h, rectRadius: 0.08, fill: { color: "D8DEE7" }, line: { type: "none" } }); // drop shadow
    slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: isSubject ? NAVY : "FFFFFF" }, line: { color: LINE, width: 1, dashType: dashedBorder ? "dash" : "solid" } });
    if (!isSubject) slide.addShape("rect", { x, y, w, h: 0.055, fill: { color: ACCENT } });
    // headshot centered near the top, name + title (+ company, when known) beneath
    const av = 0.42;
    drawAvatar(slide, x + w / 2, y + 0.31, av, photoDataUri, name, isSubject);
    slide.addText(
        [
            { text: name || "—", options: { bold: true, fontSize: 10, color: isSubject ? "FFFFFF" : NAVY, breakLine: true } },
            { text: title || "", options: { fontSize: 7.5, color: isSubject ? "C7D2E0" : GREY, breakLine: !!banner } },
            ...(banner ? [{ text: banner, options: { fontSize: 6.5, italic: true, color: isSubject ? "9FB3C8" : "94A3B8" } }] : []),
        ],
        { x: x + 0.05, y: y + 0.55, w: w - 0.1, h: h - 0.6, align: "center", valign: "top" }
    );
    if (teamSize && teamSize > 0) {
        const bw = 0.55, bh = 0.16;
        const bx = x + w - bw - 0.05, by = y + 0.05;
        slide.addShape("roundRect", { x: bx, y: by, w: bw, h: bh, rectRadius: 0.04, fill: { color: isSubject ? "1E3A5F" : "EEF2F7" }, line: { type: "none" } });
        slide.addText(`${teamSize} FTE`, { x: bx, y: by, w: bw, h: bh, fontSize: 6, bold: true, color: isSubject ? "FFFFFF" : NAVY, align: "center", valign: "middle" });
    }
}

// Shared "snap org" snippet — manager above, subject in the middle, direct
// reports below — used by both the Proposal's Organization slide and the
// Comparison export's per-employee Organization slide, so the two agree on
// layout instead of drifting apart. A distinct functionManager (a Head of
// Function relationship, possibly cross-company) renders as its own dashed
// box only when it differs from the real manager; reports from either
// dimension are already merged and cross_banner-tagged by getEmployee.
function drawOrgSnapshot(slide: any, x: number, y: number, w: number, subject: EmployeeDetail, photoOf: (u?: string | null) => string | null) {
    const boxW = 2.15, boxH = 1.0, cx = x + w / 2;
    let cursorY = y;
    if (subject.manager) {
        drawPersonBox(slide, cx - boxW / 2, cursorY, boxW, boxH, subject.manager.name, subject.manager.position_title, false, photoOf(subject.manager.photo), false, subject.manager.banner_name, subject.manager.team_size);
        drawElbow(slide, cx, cursorY + boxH, cursorY + boxH + 0.28, [cx], cursorY + boxH + 0.28);
        cursorY += boxH + 0.28;
    }
    if (subject.functionManager) {
        const fmH = boxH * 0.85;
        drawPersonBox(slide, cx - boxW / 2, cursorY, boxW, fmH, subject.functionManager.name, "Head of Function", false, photoOf(subject.functionManager.photo), true, subject.functionManager.banner_name, subject.functionManager.team_size);
        drawElbow(slide, cx, cursorY + fmH, cursorY + fmH + 0.22, [cx], cursorY + fmH + 0.22, [subject.functionManager.cross_banner]);
        cursorY += fmH + 0.22;
    }
    drawPersonBox(slide, cx - boxW / 2, cursorY, boxW, boxH, subject.name, subject.position_title, true, photoOf(subject.photo), false, subject.banner_name, subject.team_size);
    const subjBottom = cursorY + boxH;
    cursorY += boxH;
    if (subject.reports?.length) {
        // Every report renders — nobody gets silently dropped. Once they no
        // longer fit shrunk down to a readable minimum width on one row,
        // wrap onto additional rows below a single shared trunk line instead.
        const minBoxW = 1.05;
        const maxPerRow = Math.max(1, Math.floor(w / (minBoxW + 0.15)));
        const rows: (typeof subject.reports)[] = [];
        for (let i = 0; i < subject.reports.length; i += maxPerRow) rows.push(subject.reports.slice(i, i + maxPerRow));

        let rowTop = subjBottom;
        const rowGeoms = rows.map((rowReports) => {
            const busY = rowTop + 0.28;
            const spacing = Math.min(1.9, w / rowReports.length);
            const reportBoxW = Math.min(boxW, spacing - 0.12);
            const totalW = spacing * rowReports.length;
            const startX = cx - totalW / 2;
            const childY = busY + 0.28;
            const childCenters = rowReports.map((_, i) => startX + i * spacing + spacing / 2);
            rowTop = childY + boxH + 0.22;
            return { rowReports, busY, childY, childCenters, startX, spacing, reportBoxW };
        });

        slide.addShape("line", { x: cx, y: subjBottom, w: 0, h: rowGeoms[rowGeoms.length - 1].busY - subjBottom, line: { color: LINE, width: 1.25 } });
        rowGeoms.forEach(({ rowReports, busY, childY, childCenters, startX, spacing, reportBoxW }) => {
            if (childCenters.length > 1) {
                const minX = Math.min(...childCenters), maxX = Math.max(...childCenters);
                slide.addShape("line", { x: minX, y: busY, w: maxX - minX, h: 0, line: { color: LINE, width: 1.25 } });
            }
            childCenters.forEach((ccx, i) => {
                slide.addShape("line", { x: ccx, y: busY, w: 0, h: childY - busY, line: { color: LINE, width: 1.25, dashType: (rowReports[i] as any).cross_banner ? "dash" : "solid" } });
            });
            rowReports.forEach((r: any, i: number) => {
                const rx = startX + i * spacing + (spacing - reportBoxW) / 2;
                drawPersonBox(slide, rx, childY, reportBoxW, boxH, r.name, r.position_title, false, photoOf(r.photo), false, r.banner_name, r.team_size);
            });
        });
    }
}

// Initials from a name, e.g. "Robert King" → "RK".
function initials(name: string): string {
    const parts = (name || "").replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("")) || "—";
}

// Circular headshot with a accent-colored ring; falls back to an initials disc when no
// photo is available (so every seat still reads as a person).
function drawAvatar(slide: any, cx: number, cy: number, size: number, dataUri: string | null | undefined, name: string, onDark = false) {
    const x = cx - size / 2, y = cy - size / 2;
    slide.addShape("ellipse", { x: x - 0.035, y: y - 0.035, w: size + 0.07, h: size + 0.07, fill: { color: ACCENT }, line: { type: "none" } });
    if (dataUri) {
        slide.addImage({ data: dataUri, x, y, w: size, h: size, rounding: true });
    } else {
        slide.addShape("ellipse", { x, y, w: size, h: size, fill: { color: onDark ? "1E3A5F" : NAVY }, line: { type: "none" } });
        slide.addText(initials(name), { x, y, w: size, h: size, align: "center", valign: "middle", fontSize: Math.max(7, size * 22), bold: true, color: "FFFFFF" });
    }
}

// Fetch every needed photo URL → data URI once, in parallel (CSP-safe server action).
async function loadPhotos(urls: (string | null | undefined)[]): Promise<Map<string, string>> {
    const uniq = Array.from(new Set(urls.filter((u): u is string => !!u)));
    const map = new Map<string, string>();
    await Promise.all(uniq.map(async (u) => {
        const d = await fetchImageAsDataUri(u);
        if (d) map.set(u, d);
    }));
    return map;
}
