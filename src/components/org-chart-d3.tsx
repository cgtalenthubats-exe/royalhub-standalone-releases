"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OrgChart } from "d3-org-chart";
import type { OrgFlatNode, Dimension } from "@/app/actions/org";
import { moveEmployee, moveEmployeeAlone, replaceVacant, promoteToReplace, createVacantSeat } from "@/app/actions/employees";
import { exportOrgPptx } from "@/lib/pptx-export";
import { tagColorHex } from "@/lib/tag-colors";
import { PERF_STATUS } from "@/lib/performance";
import type { PerfSummary } from "@/app/actions/performance";
import { TagColorPicker } from "@/components/tag-color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Focus, FileDown, Loader2, Check, X, ExternalLink, Save, Undo2, AlertTriangle, UserPlus, ArrowUpRight, Plus, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

const CATS = [
    { key: "leadership", label: "Leadership" },
    { key: "experiences", label: "Experiences" },
    { key: "skill", label: "Skill" },
    { key: "market", label: "Market" },
] as const;

function esc(s: any) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

// A queued, not-yet-saved org edit. Nothing hits the server until "Save all"
// is clicked — lets the user drag several people around to sketch a plan,
// discuss it, and back out cleanly instead of committing on every drop.
type PendingMove =
    | { kind: "move"; mode: "team" | "alone"; employeeId: number; employeeName: string; targetId: number; targetName: string }
    | { kind: "replace"; vacantId: number; vacantTitle: string | null; newOccupantId: number; newOccupantName: string }
    | { kind: "promote"; promotedId: number; promotedName: string; incumbentId: number; incumbentName: string };

// Re-parent nodes in a plain client-side copy of the tree to preview queued
// moves before they're saved. "replace" and "promote" are fully accurate
// (only reassign existing real ids). "alone" mode can't be fully previewed —
// the vacant placeholder it will create doesn't exist yet — so reports stay
// visually attached to the dragged person until the real save + refresh
// happens; a note in the pending-changes bar calls this out.
function applyPending(nodes: OrgFlatNode[], pending: PendingMove[]): OrgFlatNode[] {
    if (!pending.length) return nodes;
    const byId = new Map(nodes.map((n) => [n.id, { ...n }]));
    for (const p of pending) {
        if (p.kind === "move") {
            const n = byId.get(String(p.employeeId));
            if (n) n.parentId = String(p.targetId);
        } else if (p.kind === "replace") {
            const occ = byId.get(String(p.newOccupantId));
            const vac = byId.get(String(p.vacantId));
            if (occ && vac) occ.parentId = vac.parentId;
            byId.forEach((n) => { if (n.parentId === String(p.vacantId)) n.parentId = String(p.newOccupantId); });
            byId.delete(String(p.vacantId));
        } else {
            const promoted = byId.get(String(p.promotedId));
            const incumbent = byId.get(String(p.incumbentId));
            if (promoted && incumbent) {
                const incumbentOldParent = incumbent.parentId;
                byId.forEach((n) => { if (n.parentId === String(p.incumbentId) && n.id !== String(p.promotedId)) n.parentId = String(p.promotedId); });
                promoted.parentId = incumbentOldParent;
                incumbent.parentId = String(p.promotedId);
            }
        }
    }
    return Array.from(byId.values());
}

export function OrgChartD3({ nodes: serverNodes, dimension, title, perf, readOnly, onNodeClick, highlightId }: {
    nodes: OrgFlatNode[];
    dimension: Dimension;
    title: string;
    // Performance overlay (/performance page only). Keyed by OrgFlatNode.id
    // (= employee_position_id). When absent every existing caller renders
    // exactly as before — this is purely additive.
    perf?: Record<string, PerfSummary>;
    // Disables drag-to-reassign. Moving someone's manager from the performance
    // page would be the wrong action to have one drag away.
    readOnly?: boolean;
    // Overrides the default click-opens-the-info-dialog behaviour, so
    // /performance can open its own bottom drawer instead.
    onNodeClick?: (node: OrgFlatNode) => void;
    // Node id (OrgFlatNode.id) to draw with an accent ring — e.g. "Full Org"
    // no longer roots the chart at the subject (it now also shows who they
    // report to), so without this there'd be nothing marking which card is
    // actually them once the tree has more than one node.
    highlightId?: string;
}) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const [exporting, setExporting] = useState(false);
    const [info, setInfo] = useState<OrgFlatNode | null>(null);
    const [move, setMove] = useState<{ dragged: OrgFlatNode; target: OrgFlatNode; reportCount: number } | null>(null);
    const [replaceConfirm, setReplaceConfirm] = useState<{ dragged: OrgFlatNode; vacant: OrgFlatNode } | null>(null);
    const [pending, setPending] = useState<PendingMove[]>([]);
    const [saving, setSaving] = useState(false);
    const [addingSeat, setAddingSeat] = useState(false);
    const [seatTitle, setSeatTitle] = useState("");
    const [creatingSeat, setCreatingSeat] = useState(false);
    // Three peer layouts, always exactly one active — no separate "spread out,
    // uncompacted" state anymore. "compact" packs siblings 2-per-row (the
    // default). "stackV1" keeps N and N-1 as real, draggable chart nodes;
    // everything from N-2 down is embedded as a static vertical list inside
    // its N-1 ancestor's own box. "stackV2" flips the whole chart to
    // d3-org-chart's built-in left-to-right direction (children as a vertical
    // column) — far less custom code, but N and N-1 switch to that style too,
    // not just N-2+. V1/V2 exist side by side so they can be compared before
    // picking one.
    const [layoutMode, setLayoutMode] = useState<"compact" | "stackV1" | "stackV2">("compact");

    const nodes = useMemo(() => applyPending(serverNodes, pending), [serverNodes, pending]);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map<string, string[]>();
    nodes.forEach((n) => { if (n.parentId) { const a = childrenOf.get(n.parentId) || []; a.push(n.id); childrenOf.set(n.parentId, a); } });
    function isDescendant(ancestor: string, maybe: string): boolean {
        const stack = [...(childrenOf.get(ancestor) || [])];
        while (stack.length) { const x = stack.pop()!; if (x === maybe) return true; stack.push(...(childrenOf.get(x) || [])); }
        return false;
    }

    // Depth relative to the real roots (employee_id > 0) — a synthetic
    // multi-root anchor (employee_id < 0, invisible — see nodeHtml) doesn't
    // count, so "N" (depth 0) always means an actual person, whether or not
    // one of these anchors sits above them.
    const trueRoots = nodes.filter((n) => n.employee_id > 0 && (!n.parentId || (byId.get(n.parentId)?.employee_id ?? -1) < 0));
    const depthOf = new Map<string, number>();
    {
        const queue: [string, number][] = trueRoots.map((r) => [r.id, 0]);
        while (queue.length) {
            const [id, d] = queue.shift()!;
            if (depthOf.has(id)) continue;
            depthOf.set(id, d);
            for (const childId of childrenOf.get(id) || []) queue.push([childId, d + 1]);
        }
    }
    function subtreeRowCount(id: string): number {
        const kids = childrenOf.get(id) || [];
        return kids.length + kids.reduce((s, k) => s + subtreeRowCount(k), 0);
    }
    // Stack V1's embedded N-2+ list — each row still carries data-node-id, so
    // the existing pointer-based click/drag handlers work on it exactly like
    // a real chart node (open info, or drag onto another card to reassign).
    function renderStackList(id: string): string {
        const kids = childrenOf.get(id) || [];
        if (!kids.length) return "";
        return `<div style="margin-left:11px;">${kids.map((kidId) => {
            const k = byId.get(kidId);
            if (!k) return "";
            return `<div style="border-left:1px solid #cbd5e1;padding-left:9px;">
                <div data-node-id="${esc(k.id)}" style="cursor:grab;user-select:none;padding:2.5px 4px;border-radius:5px;display:flex;align-items:baseline;gap:5px;${k.status !== "Active" ? "opacity:.55;" : ""}">
                    <span style="font-size:10.5px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${esc(k.name)}</span>
                    <span style="font-size:9px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(k.position_title || "")}</span>
                </div>
                ${renderStackList(k.id)}
            </div>`;
        }).join("")}</div>`;
    }

    // Warn on tab close/refresh with unsaved drags — not on in-app nav (kept
    // deliberately small in scope; the always-visible bar below is the guard
    // for in-app navigation).
    useEffect(() => {
        if (!pending.length) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [pending.length]);

    // render chart
    useEffect(() => {
        if (!containerRef.current) return;
        if (!chartRef.current) {
            chartRef.current = new OrgChart();
            // d3-org-chart's built-in "compact" mode hardcodes exactly 2
            // columns and only pairs siblings that are CURRENTLY collapsed
            // (look like leaves to it) — with real fallout:
            //  - an odd sibling out (or one that doesn't neatly fill 2
            //    columns) gets left dangling alone instead of just reading
            //    as one clean row;
            //  - the synthetic multi-company anchor's direct children
            //    (unrelated top-level people, no connecting line between
            //    them) always looked like a pairable set to it, producing a
            //    2x2 grid instead of one row;
            //  - the moment ONE sibling is expanded, it drops out of the
            //    pairing set entirely, so the library re-pairs everyone
            //    ELSE from scratch on every single toggle — the visible
            //    symptom is siblings visually reordering (1,2,3,4 →
            //    1,3,4,2) and the trunk/branch line landing off-center,
            //    since the newly-expanded node keeps its OLD
            //    (pre-re-pairing) standard-layout position while its
            //    former pair-mates get a brand new block position.
            // Replaced wholesale below with a small custom grid layout:
            // fixed N columns (adaptive, up to 4 — so 2-4 siblings sit in
            // one clean row and larger teams wrap into a tight grid rather
            // than an always-exactly-2-wide one), positions assigned by
            // each sibling's ORIGINAL index so nothing reflows when a
            // sibling elsewhere in the group is expanded or collapsed, and
            // a matching set of link-routing overrides (below) so the
            // trunk/branch lines stay correctly centered under the block
            // regardless of column count. A sibling group with ANY
            // currently-expanded member falls back to the library's
            // ordinary (non-compact) tree layout entirely — that's the
            // same layout Stack V1/V2 already use everywhere and it
            // provably keeps order + centering correct, so a "mixed"
            // group (some expanded, some not) is deliberately never
            // grid-packed rather than trying to grid-pack around a
            // subtree hanging off one of its members.
            const chart = chartRef.current;
            const GRID_MAX_COLS = 4;
            const GRID_COL_GAP = 0; // siblings sharing one manager tile edge-to-edge, like a table
            const GRID_ROW_GAP = 10;
            const GRID_BLOCK_MARGIN = 24; // space around the whole block, same order as siblingsMargin elsewhere
            chart.calculateCompactFlexDimensions = function (root: any) {
                root.eachBefore((node: any) => {
                    node.firstCompact = null; node.compactEven = null; node.flexCompactDim = null;
                    node.firstCompactNode = null; node._gridCol = null; node._gridRow = null;
                    node._gridCols = null; node._colWidths = null; node._rowHeights = null; node._blockLeftEdge = null;
                });
                root.eachBefore((node: any) => {
                    if (node.data?.employee_id < 0) return; // the synthetic anchor's own children never grid-pack — see above
                    if (!node.children || node.children.length < 2) return;
                    const leafChildren = node.children.filter((d: any) => !d.children);
                    if (leafChildren.length < 2 || leafChildren.length !== node.children.length) return; // mixed (some expanded) or too-few → bail to standard layout
                    // In the Function view, a sibling from a DIFFERENT company than
                    // the parent is a real cross-company report, not a same-team
                    // seat — it keeps its own individual spacing and dashed
                    // connector (see linkUpdate's crossCompany check below) rather
                    // than being tiled edge-to-edge into the shared block. Leaving
                    // it out of compactChildren here means it never gets a
                    // flexCompactDim, so the untouched standard flextree path
                    // positions and links it exactly like a "mixed" bail-out case.
                    const compactChildren = dimension === "function"
                        ? leafChildren.filter((d: any) => d.data?.banner_id == null || node.data?.banner_id == null || d.data.banner_id === node.data.banner_id)
                        : leafChildren;
                    if (compactChildren.length < 2) return;
                    const n = compactChildren.length;
                    const cols = Math.min(GRID_MAX_COLS, n);
                    compactChildren.forEach((child: any, i: number) => {
                        if (!i) child.firstCompact = true;
                        child._gridCol = i % cols;
                        child._gridRow = Math.floor(i / cols);
                        child.row = child._gridRow;
                    });
                    const colWidths: number[] = [];
                    for (let c = 0; c < cols; c++) {
                        const inCol = compactChildren.filter((d: any) => d._gridCol === c);
                        colWidths.push(Math.max(...inCol.map((d: any) => d.width)));
                    }
                    const rows = Math.ceil(n / cols);
                    const rowHeights: number[] = [];
                    for (let r = 0; r < rows; r++) {
                        const inRow = compactChildren.filter((d: any) => d._gridRow === r);
                        rowHeights.push(Math.max(...inRow.map((d: any) => d.height)));
                    }
                    const totalWidth = colWidths.reduce((s: number, w: number) => s + w, 0) + (cols - 1) * GRID_COL_GAP;
                    const totalHeight = rowHeights.reduce((s: number, h: number) => s + h, 0) + (rows - 1) * GRID_ROW_GAP;
                    compactChildren.forEach((child: any) => {
                        child.firstCompactNode = compactChildren[0];
                        child._gridCols = cols;
                        child._colWidths = colWidths;
                        child._rowHeights = rowHeights;
                        child.flexCompactDim = child.firstCompact ? [totalWidth + GRID_BLOCK_MARGIN, totalHeight] : [0, 0];
                    });
                    node.flexCompactDim = null;
                });
            };
            chart.calculateCompactFlexPositions = function (root: any) {
                root.eachBefore((node: any) => {
                    if (!node.children) return;
                    const compactChildren = node.children.filter((d: any) => d.flexCompactDim);
                    const fch = compactChildren[0];
                    if (!fch) return;
                    const cols: number = fch._gridCols;
                    const colWidths: number[] = fch._colWidths;
                    const rowHeights: number[] = fch._rowHeights;
                    const totalWidth = colWidths.reduce((s: number, w: number) => s + w, 0) + (cols - 1) * GRID_COL_GAP;
                    // fch.x currently holds the CENTER the outer flex-tree layout
                    // assigned this whole block (flexCompactDim was its declared
                    // footprint) — save the block's left edge before fch.x gets
                    // overwritten below by fch's own column position, since the
                    // link routing needs it to find the shared drop point.
                    const leftEdge = fch.x - totalWidth / 2;
                    fch._blockLeftEdge = leftEdge;
                    const colOffsets: number[] = [];
                    let cum = 0;
                    for (let c = 0; c < cols; c++) { colOffsets.push(cum); cum += colWidths[c] + GRID_COL_GAP; }
                    const rowOffsets: number[] = [];
                    cum = 0;
                    for (let r = 0; r < rowHeights.length; r++) { rowOffsets.push(cum); cum += rowHeights[r] + GRID_ROW_GAP; }
                    // Row-major fill: a short last row occupies columns 0..k-1,
                    // left-aligned under the same columns as the row(s) above —
                    // matches a plain table/grid, not centered under the block.
                    compactChildren.forEach((child: any) => {
                        child.x = leftEdge + colOffsets[child._gridCol] + colWidths[child._gridCol] / 2;
                        child.y = fch.y + rowOffsets[child._gridRow];
                    });
                });
            };
            // Default link paths have rounded elbow corners (a fixed-radius curve
            // baked into the library's own "diagonal"/"hdiagonal" generators) —
            // swap in plain right-angle versions instead, one per direction
            // (top-down for normal/Stack V1, left-right for Stack V2), keeping
            // the same lead-in/offset handling so compact-mode routing still
            // lines up correctly.
            const layout = chartRef.current.layoutBindings();
            layout.top.diagonal = (s: any, t: any, m: any, offsets: any = { sy: 0 }) => {
                const x = s.x, y = s.y + (offsets?.sy || 0);
                const ex = t.x, ey = t.y;
                const mx = m && m.x != null ? m.x : x;
                const my = m && m.y != null ? m.y : y;
                // Use s.y (the real child-row anchor), not the offset-shifted y —
                // linkYOffset nudges y toward the child row for an unrelated Safari
                // rendering fix, which otherwise biases this "midpoint" well below
                // the true center of the gap between the parent and child rows.
                const midY = (s.y + ey) / 2;
                return `M ${mx} ${my} L ${x} ${my} L ${x} ${midY} L ${ex} ${midY} L ${ex} ${ey}`;
            };
            // Matching link-routing overrides for the N-column grid above.
            // With siblings now touching edge-to-edge (zero column gap), a
            // fanned-out bus line to every individual card is unnecessary —
            // one line dropping to the shared border between the two middle
            // columns already reads as "everyone below this point reports
            // here." Every child in the group is given the exact same drop
            // point, so their otherwise-separate link paths fully overlap
            // into that single line (an even column count lands exactly on
            // the block's true center; odd counts land on the nearest column
            // border instead of bisecting the middle card).
            const gridDropPoint = (node: any) => {
                const fcn = node.firstCompactNode;
                const cols: number = fcn._gridCols;
                const colWidths: number[] = fcn._colWidths;
                const dropCol = Math.floor(cols / 2);
                let x = fcn._blockLeftEdge;
                for (let c = 0; c < dropCol; c++) x += colWidths[c];
                return { x, y: fcn.y };
            };
            layout.top.linkCompactXStart = (node: any) => gridDropPoint(node).x;
            layout.top.linkCompactYStart = (node: any) => gridDropPoint(node).y;
            layout.top.compactLinkMidX = (node: any) => gridDropPoint(node).x;
            layout.top.compactLinkMidY = (node: any) => gridDropPoint(node).y;
            // Pull the expand/collapse control inside the card's bottom-right
            // corner (it defaults to bottom-centre, floating outside the node)
            // so it reads as part of the card rather than a box hanging off it.
            layout.top.buttonX = (node: any) => node.width - 34;
            layout.top.buttonY = (node: any) => node.height - 17;
            layout.left.diagonal = (s: any, t: any, m: any) => {
                const x = s.x, y = s.y;
                const ex = t.x, ey = t.y;
                const mx = m && m.x != null ? m.x : x;
                const my = m && m.y != null ? m.y : y;
                const midX = (x + ex) / 2;
                return `M ${mx} ${my} L ${mx} ${y} L ${x} ${y} L ${midX} ${y} L ${midX} ${ey} L ${ex} ${ey}`;
            };
            chartRef.current.layoutBindings(layout);
        }

        // Stack V1: only N (real roots) and N-1 (their direct reports) stay as
        // real, individually draggable chart nodes. Everything from N-2 down is
        // embedded as a static list inside its N-1 ancestor's box instead (see
        // renderStackList) — d3-org-chart has no notion of mixing a top-down
        // layout for the first two levels with a different one below that, so
        // this is done by simply not handing it that data at all.
        const chartData = layoutMode === "stackV1" ? nodes.filter((n) => n.employee_id < 0 || (depthOf.get(n.id) ?? 0) <= 1) : nodes;
        const ROW_H = 20;

        chartRef.current
            .container(containerRef.current as any)
            .data(chartData as any)
            .layout(layoutMode === "stackV2" ? "left" : "top")
            .svgHeight(containerRef.current.clientHeight || 600)
            .compact(layoutMode === "compact") // packs siblings into an N-column grid (see the calculateCompactFlex* overrides above); off for either Stack mode
            // The company node /performance injects takes up the first level,
            // pushing its people to the second — expand one deeper there so the
            // default view still opens on people, not just company cards.
            .initialExpandLevel(perf ? 2 : 1)
            .nodeWidth((d: any) => (d.data.node_kind === "banner" ? 236 : d.data.employee_id < 0 ? 10 : 264))
            .nodeHeight((d: any) => {
                if (d.data.node_kind === "banner") return 92;
                if (d.data.employee_id < 0) return 1;
                // One fixed height for every card regardless of dimension or whether
                // it has a logo/chip — the photo bleeds the card's full left edge, so
                // it (and everything else) stretches to fit this box rather than the
                // box growing to fit a logo row the way it used to. The performance
                // overlay adds one more row, so those cards get their own single
                // fixed height — still uniform across that page.
                const base = perf ? 112 : 90;
                // Grow an N-1 node's own box to fit its embedded N-2+ list beneath it.
                if (layoutMode === "stackV1" && depthOf.get(d.data.id) === 1) return base + subtreeRowCount(d.data.id) * ROW_H;
                return base;
            })
            .childrenMargin(() => 50)
            .siblingsMargin(() => 24)
            // Expand/collapse affordance — just the chevron, no filled pill
            // behind it (a boxed background read as visual clutter against
            // the card). Sized up a little (18px) so it's still easy to spot
            // and click without the box doing the work.
            .buttonContent(({ node }: any) => {
                const n = node.data._directSubordinatesPaging;
                if (!n) return `<div></div>`;
                return `<div style="display:flex;align-items:center;justify-content:center;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="transform:rotate(${node.children ? 180 : 0}deg);">
                      <path d="M5 9l7 7 7-7" stroke="#0b1f3a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>`;
            })
            .nodeUpdate(function (this: SVGGElement, d: any) {
                // The synthetic anchor's own expand/collapse badge would float
                // next to an otherwise-invisible node — hide it along with the box.
                // In Stack V1 an N-1 node's real children were deliberately left
                // out of chartData (they're embedded instead), so its badge would
                // misleadingly read "+0" — hide it there too.
                const hideBadge = d?.data?.employee_id < 0 || (layoutMode === "stackV1" && depthOf.get(d?.data?.id) === 1);
                const btn = this.querySelector(".node-button-g") as SVGElement | null;
                if (btn) btn.style.display = hideBadge ? "none" : "";
                // The library paints a white rounded rect behind the button —
                // drop it so the chevron sits directly on the card.
                const rect = this.querySelector(".node-button-rect") as SVGElement | null;
                if (rect) rect.setAttribute("fill", "transparent");
            })
            .linkUpdate(function (this: SVGPathElement, d: any) {
                this.setAttribute("stroke", "#000000");
                this.setAttribute("stroke-width", "1");
                // A link into the synthetic multi-root anchor doesn't represent a
                // real relationship any more than the anchor itself does — hidden
                // the same way as the three cases below it:
                //   reports_to_parent === false → a company with no reporting edge to
                //     anyone, placed here for rank only (see getOrgTree) — draw nothing.
                //   different company → a real cross-company report: dashed.
                //   same company → an ordinary reporting line: solid.
                // A company node IS a real parent (its people genuinely sit
                // under it), unlike the synthetic anchor — so its links draw.
                const parentIsAnchor = d?.parent?.data?.employee_id < 0 && d?.parent?.data?.node_kind !== "banner";
                if (parentIsAnchor || d?.data?.reports_to_parent === false) {
                    this.setAttribute("stroke", "none");
                    this.removeAttribute("stroke-dasharray");
                    return;
                }
                const crossCompany = dimension === "function" && d?.data?.banner_id != null && d?.parent?.data?.banner_id != null && d.data.banner_id !== d.parent.data.banner_id;
                if (crossCompany) this.setAttribute("stroke-dasharray", "6,4");
                else this.removeAttribute("stroke-dasharray");
            })
            .nodeContent((d: any) => {
                const stackList = layoutMode === "stackV1" && depthOf.get(d.data.id) === 1 ? renderStackList(d.data.id) : undefined;
                // Seat count of this node's subtree, including the node itself —
                // computed here rather than server-side because Stack V1 hides part
                // of the tree from d3 but the count should still reflect everyone.
                return nodeHtml(d.data, dimension, stackList, subtreeRowCount(d.data.id) + 1, perf?.[d.data.id], d.data.id === highlightId);
            })
            .render()
            .fit(); // auto-scale to the visible viewport on load — most noticeable on mobile
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // perf feeds both nodeHeight and nodeContent, so a change to the
        // overlay has to re-run the whole render, not just repaint.
    }, [nodes, layoutMode, perf, highlightId]);

    // Keep the chart fitted to the viewport as the container resizes (browser
    // resize, sidebar toggle, orientation change). d3-org-chart's own resize
    // listener only widens the SVG element — it never refreshes `svgHeight`
    // (which .fit()'s zoom-scale math depends on) or re-fits the zoom/pan
    // transform, so a plain `.fit()` call here would still compute against a
    // stale height. Re-supplying the live height and calling `.render()`
    // (which does refresh svgWidth from the container) before `.fit()` fixes it.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                if (!chartRef.current) return;
                chartRef.current.svgHeight(el.clientHeight || 600).render().fit({ animate: false });
            });
        });
        ro.observe(el);
        return () => { ro.disconnect(); cancelAnimationFrame(raf); };
    }, []);

    // pointer-based drag (works inside d3 foreignObject; click = open info, drag = reassign)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        let dragId: string | null = null, sx = 0, sy = 0, moved = false;
        let ghost: HTMLDivElement | null = null, lastTarget: Element | null = null;

        const cardFrom = (t: EventTarget | null) => (t as HTMLElement)?.closest?.("[data-node-id]") as HTMLElement | null;
        const clearHi = () => { if (lastTarget) { (lastTarget as HTMLElement).style.outline = ""; lastTarget = null; } };

        const onCancel = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
            dragId = null;
            if (ghost) { ghost.remove(); ghost = null; }
            clearHi();
        };

        const onDown = (e: PointerEvent) => {
            const card = cardFrom(e.target);
            if (!card) return; // empty space → let d3 pan/zoom
            const id = card.getAttribute("data-node-id");
            if (!id) return;
            const node = byId.get(id);
            // Neither the synthetic anchor nor a company node is draggable, but
            // a company node still needs to receive clicks (that's how its
            // objectives are opened), so it isn't filtered out here.
            if (!node || (node.employee_id < 0 && node.node_kind !== "banner")) return;
            e.stopPropagation(); // block d3 zoom-pan while interacting with a node
            e.preventDefault(); // prevent browser native drag/select and stop simulated mouse events
            dragId = id; sx = e.clientX; sy = e.clientY; moved = false;
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, { once: true });
            window.addEventListener("pointercancel", onCancel, { once: true });
        };
        const onMove = (e: PointerEvent) => {
            if (!dragId) return;
            if (readOnly || byId.get(dragId)?.node_kind === "banner") return; // click-only
            const dist = Math.hypot(e.clientX - sx, e.clientY - sy);
            if (!moved && dist > 6) {
                moved = true;
                ghost = document.createElement("div");
                ghost.style.cssText = "position:fixed;z-index:9999;pointer-events:none;background:#0b1f3a;color:#fff;padding:6px 10px;border-radius:8px;font:600 12px system-ui;box-shadow:0 4px 12px rgba(0,0,0,.3);";
                ghost.textContent = byId.get(dragId)?.name || "";
                document.body.appendChild(ghost);
            }
            if (moved && ghost) {
                ghost.style.left = e.clientX + 12 + "px"; ghost.style.top = e.clientY + 12 + "px";
                const tEl = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
                if (tEl !== lastTarget) {
                    clearHi();
                    const tid = tEl?.getAttribute("data-node-id");
                    if (tEl && tid && tid !== dragId && byId.get(tid)?.employee_id! > 0) { (tEl as HTMLElement).style.outline = "3px solid #A16207"; lastTarget = tEl; }
                }
            }
        };
        const onUp = (e: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointercancel", onCancel);
            const id = dragId; dragId = null;
            if (ghost) { ghost.remove(); ghost = null; }
            clearHi();
            if (!id) return;
            // click → the caller's own handler if it supplied one, else the info dialog
            if (!moved) { const n = byId.get(id); if (n) { if (onNodeClick) onNodeClick(n); else setInfo(n); } return; }
            if (readOnly) return; // drag never resolves to a reassignment here
            const tEl = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
            const tid = tEl?.getAttribute("data-node-id");
            if (!tid || tid === id) return;
            const dn = byId.get(id), tn = byId.get(tid);
            if (!dn || !tn || tn.employee_id < 0) return;
            if (isDescendant(id, tid)) { toast.error("Can't move under your own report"); return; }
            if (tn.status === "Vacant" && dn.status !== "Vacant") { setReplaceConfirm({ dragged: dn, vacant: tn }); return; }
            const reportCount = dn.status === "Vacant" ? 0 : (childrenOf.get(id) || []).length;
            setMove({ dragged: dn, target: tn, reportCount });
        };

        el.addEventListener("pointerdown", onDown, true); // capture so it beats d3 zoom
        return () => { el.removeEventListener("pointerdown", onDown, true); window.removeEventListener("pointermove", onMove); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, readOnly, onNodeClick]);

    function queueMove(mode: "team" | "alone") {
        if (!move) return;
        setPending((prev) => [...prev, {
            kind: "move", mode,
            // .id is the org-chart node id, i.e. employee_position_id now (a
            // person can be two nodes) — .employee_id is still "who is this
            // person" for display, not what org_edges is keyed on.
            employeeId: Number(move.dragged.id), employeeName: move.dragged.name,
            targetId: Number(move.target.id), targetName: move.target.name,
        }]);
        setMove(null);
    }
    function queueReplace() {
        if (!replaceConfirm) return;
        setPending((prev) => [...prev, {
            kind: "replace",
            vacantId: Number(replaceConfirm.vacant.id), vacantTitle: replaceConfirm.vacant.position_title,
            newOccupantId: Number(replaceConfirm.dragged.id), newOccupantName: replaceConfirm.dragged.name,
        }]);
        setReplaceConfirm(null);
    }
    function queuePromote() {
        if (!move) return;
        setPending((prev) => [...prev, {
            kind: "promote",
            promotedId: Number(move.dragged.id), promotedName: move.dragged.name,
            incumbentId: Number(move.target.id), incumbentName: move.target.name,
        }]);
        setMove(null);
    }

    async function saveAll() {
        setSaving(true);
        for (const p of pending) {
            const res = p.kind === "move"
                ? p.mode === "team"
                    ? await moveEmployee(p.employeeId, p.targetId, dimension)
                    : await moveEmployeeAlone(p.employeeId, p.targetId, dimension)
                : p.kind === "replace"
                    ? await replaceVacant(p.vacantId, p.newOccupantId, dimension)
                    : await promoteToReplace(p.promotedId, p.incumbentId, dimension);
            if (!res.ok) {
                setSaving(false);
                toast.error(res.error || "Save failed — later changes in the queue were not applied");
                return;
            }
        }
        setSaving(false);
        setPending([]);
        toast.success(`Saved ${pending.length} change${pending.length === 1 ? "" : "s"}`);
        router.refresh();
    }

    async function addVacantSeat() {
        if (!info) return;
        setCreatingSeat(true);
        const res = await createVacantSeat(Number(info.id), seatTitle.trim() || null, dimension);
        setCreatingSeat(false);
        if (res.ok) {
            toast.success("Vacant seat added");
            setAddingSeat(false); setSeatTitle(""); setInfo(null);
            router.refresh();
        } else {
            toast.error(res.error || "Could not add seat");
        }
    }

    async function exportPptx() {
        setExporting(true);
        try { await exportOrgPptx(serverNodes, title); toast.success("Exported PPTX 🎉"); }
        catch (e: any) { toast.error("Export failed: " + (e?.message || "")); }
        finally { setExporting(false); }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 shrink-0">
                <span className="mr-auto text-xs text-muted-foreground">
                    {readOnly
                        ? "Click a card to view and record its targets"
                        : "Click a card for details · drag a card onto another to evaluate fit & reassign"}
                </span>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => chartRef.current?.expandAll().fit()}><Maximize2 className="h-3.5 w-3.5" /> Expand</Button>
                <Button
                    size="sm" variant="outline" className="h-8 gap-1"
                    title="Collapse down to the top-level people — not the invisible multi-company anchor above them"
                    onClick={() => {
                        const chart = chartRef.current;
                        if (!chart) return;
                        // The library's own collapseAll() collapses the root itself too
                        // (initialExpandLevel 0) — when the root is our invisible
                        // synthetic multi-company anchor, that leaves nothing at all
                        // visible. Collapse everyone below the true top-level people
                        // instead, always leaving at least them on screen.
                        // On /performance the company node occupies that first
                        // level, so its people sit one deeper — collapse to 2
                        // there so "collapse" still leaves the top people up.
                        const { allNodes } = chart.getChartState();
                        allNodes.forEach((d: any) => { d.data._expanded = false; });
                        chart.initialExpandLevel(perf ? 2 : 1).render().fit();
                    }}
                >
                    <Minimize2 className="h-3.5 w-3.5" /> Collapse
                </Button>
                <div className="flex items-center rounded-md border overflow-hidden">
                    <Button
                        size="sm" variant={layoutMode === "compact" ? "default" : "ghost"} className="h-8 gap-1 rounded-none"
                        title="Packs siblings 2-per-row once a level gets too wide for one straight row"
                        onClick={() => setLayoutMode("compact")}
                    >
                        <LayoutGrid className="h-3.5 w-3.5" /> Compact
                    </Button>
                    <Button
                        size="sm" variant={layoutMode === "stackV1" ? "default" : "ghost"} className="h-8 gap-1 rounded-none border-l"
                        title="N and N-1 stay as real chart nodes; N-2 and below embed as a static list inside their N-1 ancestor's box"
                        onClick={() => setLayoutMode("stackV1")}
                    >
                        Stack V1
                    </Button>
                    <Button
                        size="sm" variant={layoutMode === "stackV2" ? "default" : "ghost"} className="h-8 gap-1 rounded-none border-l"
                        title="Whole chart flips to the library's native left-to-right direction"
                        onClick={() => setLayoutMode("stackV2")}
                    >
                        Stack V2
                    </Button>
                </div>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.zoomIn()}><ZoomIn className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.zoomOut()}><ZoomOut className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.fit()}><Focus className="h-3.5 w-3.5" /></Button>
                {/* Hidden under the performance overlay: this button exports a
                    plain reporting tree, which on that page would carry none of
                    the objectives or achievement it exists to show (and would
                    render its company nodes as nameless person boxes). That
                    page offers its own Export PPTX instead. */}
                {!perf && (
                    <Button size="sm" className="h-8 gap-1" disabled={exporting} onClick={exportPptx}>{exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PPTX</Button>
                )}
            </div>
            <div ref={containerRef} style={{ flex: 1, minHeight: 0, width: "100%", background: "#f8fafc", touchAction: "none" }} />

            {/* Unsaved-changes bar */}
            {pending.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-t bg-amber-50 px-4 py-2.5 shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-[12.5px] font-medium text-amber-800">
                        {pending.length} unsaved change{pending.length === 1 ? "" : "s"}
                        {pending.some((p) => p.kind === "move" && p.mode === "alone") && " — reports of an \"alone\" move will land on a new Vacant seat once saved"}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={saving} onClick={() => setPending([])}><Undo2 className="h-3.5 w-3.5" /> Discard all</Button>
                        <Button size="sm" className="h-8 gap-1.5 bg-[#0b1f3a] hover:bg-[#0b1f3a]/90" disabled={saving} onClick={saveAll}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save all</Button>
                    </div>
                </div>
            )}

            {/* Node info dialog (click) */}
            <Dialog open={!!info} onOpenChange={(o) => { if (!o) { setInfo(null); setAddingSeat(false); setSeatTitle(""); } }}>
                <DialogContent className="sm:max-w-[460px]">
                    {info && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    {info.name}
                                    <TagColorPicker employeeId={info.employee_id} tagColor={info.tag_color} />
                                </DialogTitle>
                            </DialogHeader>
                            <div className="text-sm text-muted-foreground">{info.position_title} · {info.banner_name} · {info.country}</div>

                            {dimension === "headcount" ? (
                                <>
                                    <div className="flex gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                                        <div><span className="font-bold text-[#0b1f3a]">{info.total_headcount ?? 0}</span> <span className="text-slate-500">total FTE</span></div>
                                        <div><span className="font-bold text-[#0b1f3a]">{info.country_count ?? 0}</span> <span className="text-slate-500">countries</span></div>
                                    </div>
                                    {info.own_departments && info.own_departments.length > 0 ? (
                                        <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[360px]">
                                            <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Department (direct)</th><th className="py-1.5 text-center">Country</th><th className="py-1.5 text-right">FTE</th></tr></thead>
                                            <tbody className="divide-y">
                                                {info.own_departments.map((dep) => (
                                                    <tr key={dep.department_id}><td className="py-1.5">{dep.name}</td><td className="py-1.5 text-center text-slate-500">{dep.country ?? "-"}</td><td className="py-1.5 text-right font-semibold tabular-nums">{dep.headcount}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        </div>
                                    ) : (
                                        <div className="py-3 text-center text-sm text-muted-foreground">No departments owned directly — FTE is rolled up from reports</div>
                                    )}
                                </>
                            ) : info.status === "Vacant" ? (
                                <div className="py-3 text-center text-sm text-muted-foreground">Vacant seat — drag someone onto this card to fill it.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[360px]">
                                    <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Competency</th><th className="py-1.5 text-center">Score</th><th className="py-1.5 text-center">Required</th><th className="py-1.5 text-center">Fit</th></tr></thead>
                                    <tbody className="divide-y">
                                        {CATS.map((c) => {
                                            const v = info.scores ? (info.scores as any)[c.key] as number | null : null;
                                            const need = info.position_req ? (info.position_req as any)[c.key] as number | null : null;
                                            const pass = v != null && need != null ? v >= need : null;
                                            return (<tr key={c.key}><td className="py-1.5">{c.label}</td><td className="py-1.5 text-center font-semibold">{v ?? "-"}</td><td className="py-1.5 text-center text-slate-500">{need ?? "-"}</td>
                                                <td className="py-1.5 text-center">{pass === null ? "-" : pass ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-red-500" />}</td></tr>);
                                        })}
                                    </tbody>
                                </table>
                                </div>
                            )}
                            {info.status !== "Vacant" && (
                                addingSeat ? (
                                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-gold/50 bg-gold/5 p-3">
                                        <Input autoFocus placeholder="Title for the new seat (optional)" value={seatTitle} onChange={(e) => setSeatTitle(e.target.value)} className="h-8 text-sm" />
                                        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => { setAddingSeat(false); setSeatTitle(""); }}>Cancel</Button>
                                        <Button size="sm" className="h-8 shrink-0 gap-1.5" disabled={creatingSeat} onClick={addVacantSeat}>{creatingSeat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add</Button>
                                    </div>
                                ) : (
                                    <button onClick={() => setAddingSeat(true)} className="flex items-center gap-1.5 self-start text-xs font-medium text-gold hover:text-gold/80 transition-colors">
                                        <Plus className="h-3.5 w-3.5" /> Add a vacant seat under {info.name.split(" ")[0]}
                                    </button>
                                )
                            )}
                            <DialogFooter>
                                {info.status !== "Vacant" && info.banner_id && (
                                    <Link href={`/org/succession?company=${info.banner_id}`}><Button variant="outline" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Succession Plan</Button></Link>
                                )}
                                {info.status !== "Vacant" && (
                                    <Link href={`/employees/${info.employee_id}`}><Button variant="outline" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Open full profile</Button></Link>
                                )}
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Move / fit-check dialog (drag onto a real, occupied card) */}
            <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
                <DialogContent className="sm:max-w-[520px]">
                    {move && (
                        <>
                            <DialogHeader><DialogTitle>Fit check — {move.dragged.name} → {move.target.position_title}</DialogTitle></DialogHeader>
                            <p className="text-sm text-muted-foreground"><strong>{move.dragged.name}</strong>'s scores vs the requirements of <strong>{move.target.position_title}</strong> (currently {move.target.name}).</p>
                            <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[380px]">
                                <thead><tr className="border-b text-left text-slate-500"><th className="py-1.5">Category</th><th className="py-1.5 text-center">Score</th><th className="py-1.5 text-center">Required</th><th className="py-1.5 text-center">Result</th></tr></thead>
                                <tbody className="divide-y">
                                    {CATS.map((c) => {
                                        const v = move.dragged.scores ? (move.dragged.scores as any)[c.key] as number | null : null;
                                        const need = move.target.position_req ? (move.target.position_req as any)[c.key] as number | null : null;
                                        const pass = v != null && need != null ? v >= need : null;
                                        return (<tr key={c.key}><td className="py-1.5">{c.label}</td><td className="py-1.5 text-center font-semibold">{v ?? "-"}</td><td className="py-1.5 text-center text-slate-500">{need ?? "-"}</td>
                                            <td className="py-1.5 text-center">{pass === null ? "-" : pass ? <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700"><Check className="h-3 w-3" /> Pass</span> : <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700"><X className="h-3 w-3" /> Gap</span>}</td></tr>);
                                    })}
                                </tbody>
                            </table>
                            </div>
                            {move.reportCount > 0 && (
                                <p className="text-xs text-slate-500">{move.dragged.name.split(" ")[0]} has {move.reportCount} direct report{move.reportCount === 1 ? "" : "s"} in this view.</p>
                            )}
                            <DialogFooter className="flex-wrap gap-2">
                                <Button variant="outline" onClick={() => setMove(null)}>Cancel</Button>
                                <Button variant="outline" className="gap-1.5" onClick={queuePromote} title={`${move.dragged.name} takes ${move.target.name}'s spot; ${move.target.name.split(" ")[0]} becomes their direct report`}>
                                    <ArrowUpRight className="h-3.5 w-3.5" /> Promote to replace {move.target.name.split(" ")[0]}
                                </Button>
                                {move.reportCount > 0 && (
                                    <Button variant="outline" className="gap-1.5" onClick={() => queueMove("alone")}>
                                        Move {move.dragged.name.split(" ")[0]} only
                                    </Button>
                                )}
                                <Button onClick={() => queueMove("team")} className="gap-1.5">
                                    {move.reportCount > 0 ? `Move with team (${move.reportCount})` : `Confirm move under ${move.target.name.split(" ")[0]}`}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Replace dialog (drag a real person onto a Vacant card) */}
            <Dialog open={!!replaceConfirm} onOpenChange={(o) => !o && setReplaceConfirm(null)}>
                <DialogContent className="sm:max-w-[440px]">
                    {replaceConfirm && (
                        <>
                            <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-gold" /> Fill vacant seat</DialogTitle></DialogHeader>
                            <p className="text-sm text-muted-foreground">
                                Replace the vacant <strong>{replaceConfirm.vacant.position_title || "seat"}</strong> with <strong>{replaceConfirm.dragged.name}</strong>?
                                Their existing reports (if any) will move with them.
                            </p>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setReplaceConfirm(null)}>Cancel</Button>
                                <Button onClick={queueReplace} className="gap-1.5">Fill seat</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Bullet bar — the "performance vs target" treatment, not a plain progress bar:
// a plain bar clips at 100% and so can't show over-achievement, which is
// exactly what a target view has to show. The track spans 0–120% with a navy
// tick marking 100% (the target), the fill runs to the actual figure, and
// anything past the tick renders as a lighter over-run.
//
// The status colour never carries the meaning on its own — a number or label
// always sits beside it. That's both the accessibility rule and what keeps
// this legible next to the planning tag (src/lib/tag-colors.ts), which already
// owns the card's background/border tint.
const BULLET_SCALE_MAX = 120;
function bulletBar(perf: PerfSummary): string {
    const meta = PERF_STATUS[perf.status];
    const tickPos = (100 / BULLET_SCALE_MAX) * 100; // 100% of target, as a % of track width
    const pct = perf.pct;
    const fillPct = pct == null ? 0 : (Math.min(Math.max(pct, 0), BULLET_SCALE_MAX) / BULLET_SCALE_MAX) * 100;
    const over = pct != null && pct > 100;

    const label =
        perf.status === "none" ? "No targets"
            : pct == null ? `${perf.targetCount} set · awaiting`
                : `${Math.round(pct)}%`;

    return `<div style="display:flex;align-items:center;gap:6px;margin-top:5px;pointer-events:none;">
        <div style="position:relative;flex:1;min-width:0;height:6px;border-radius:3px;background:#e2e8f0;">
          ${fillPct > 0 ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(fillPct, tickPos)}%;background:${meta.hex};border-radius:3px 0 0 3px;"></div>` : ""}
          ${over ? `<div style="position:absolute;left:${tickPos}%;top:0;bottom:0;width:${fillPct - tickPos}%;background:${meta.hex};opacity:.45;"></div>` : ""}
          <div style="position:absolute;left:${tickPos}%;top:-2px;bottom:-2px;width:1.5px;background:#0b1f3a;"></div>
        </div>
        <span style="flex-shrink:0;font-size:9.5px;font-weight:800;color:${pct == null ? "#94a3b8" : meta.hex};white-space:nowrap;">${esc(label)}</span>
      </div>`;
}

function nodeHtml(d: OrgFlatNode, dimension: Dimension, stackList?: string, fte?: number, perf?: PerfSummary, highlighted?: boolean): string {
    // A company node (/performance only) — the one node that isn't a person.
    // Clicking it is how a company's objectives get set, so unlike the
    // synthetic anchor below it renders as a real, visible card.
    if (d.node_kind === "banner") {
        const logo = d.banner_logo_url
            ? `<img src="${esc(d.banner_logo_url)}" draggable="false" style="height:26px;max-width:120px;object-fit:contain;object-position:left;pointer-events:none;display:block;" />`
            : `<div style="font-weight:800;font-size:15px;color:#fff;">${esc(d.name)}</div>`;
        return `
        <div data-node-id="${esc(d.id)}"
          style="box-sizing:border-box;width:100%;height:100%;border-radius:12px;background:#0b1f3a;
                 box-shadow:0 2px 6px rgba(0,0,0,.18);padding:12px 14px;font-family:system-ui;cursor:pointer;user-select:none;overflow:hidden;
                 display:flex;flex-direction:column;justify-content:center;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;pointer-events:none;background:#fff;border-radius:6px;padding:4px 7px;width:fit-content;max-width:100%;">
            ${logo}
          </div>
          <div style="font-size:11px;font-weight:700;color:#cbd5e1;pointer-events:none;">${esc(d.banner_name ?? d.name)}</div>
          ${perf ? `<div style="font-size:10.5px;font-weight:700;color:${perf.targetCount ? "#fff" : "#94a3b8"};pointer-events:none;">
              ${perf.targetCount === 0 ? "No objectives set" : `${perf.targetCount} objective${perf.targetCount === 1 ? "" : "s"}${perf.pct == null ? "" : ` · ${Math.round(perf.pct)}%`}`}
            </div>` : ""}
        </div>`;
    }
    if (d.employee_id < 0) {
        // The synthetic root exists only so d3-hierarchy's single-root
        // requirement is satisfied when there are several real, unrelated
        // roots (e.g. one CEO per company) — it doesn't represent anything
        // real, so it renders invisible rather than as a labeled box; its
        // links are hidden the same way (see linkUpdate below).
        return `<div style="height:100%"></div>`;
    }
    if (d.status === "Vacant") {
        return `<div data-node-id="${esc(d.id)}"
          style="box-sizing:border-box;width:100%;height:100%;border:2px dashed #A16207;border-radius:12px;background:#fdf6e3;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:system-ui;cursor:grab;user-select:none;">
          <div style="width:34px;height:34px;border-radius:50%;border:2px dashed #A16207;display:flex;align-items:center;justify-content:center;color:#A16207;pointer-events:none;">+</div>
          <div style="font-weight:700;font-size:12px;color:#A16207;pointer-events:none;">Vacant</div>
          <div style="font-size:10.5px;color:#a16207cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90%;pointer-events:none;">${esc(d.position_title || "")}</div>
        </div>`;
    }
    // Photo bleeds the card's full left edge/height (not a small circle
    // floating in padding) — rounded only on its own left corners so it reads
    // as part of the card, matching CARD_HEIGHT below exactly since it
    // stretches with its flex row rather than carrying a fixed height itself.
    const photo = d.photo
        ? `<img src="${esc(d.photo)}" draggable="false" style="width:78px;align-self:stretch;object-fit:cover;pointer-events:none;flex-shrink:0;border-radius:11px 0 0 11px;" />`
        : `<div style="width:78px;align-self:stretch;background:#0b1f3a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;border-radius:11px 0 0 11px;">${esc(d.name.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</div>`;

    // Company logo — a corner badge (was previously its own full-width row
    // above the position/name) sized to still read at a glance rather than a
    // decorative smudge. No logo uploaded means no badge on that node (rather
    // than a text fallback), so it's worth keeping every real banner's logo
    // current.
    const bannerLogo = d.banner_logo_url
        ? `<img src="${esc(d.banner_logo_url)}" draggable="false" style="position:absolute;top:9px;right:10px;height:22px;max-width:64px;object-fit:contain;object-position:right;pointer-events:none;" />`
        : "";

    // Primary/Concurrent chip — only for someone who actually holds more than
    // one position (an ordinary single-job person never gets one), so
    // whichever of their cards you land on it's obvious there's another.
    const chipStyle = (bg: string, fg: string) =>
        `display:inline-flex;align-items:center;width:fit-content;margin-top:3px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:2px 7px;border-radius:999px;white-space:nowrap;background:${bg};color:${fg};`;

    // A resigned person keeps their seat, so they stay on the chart with their
    // targets — the dimming alone is easy to miss, so say it outright. Takes
    // precedence over Primary/Concurrent: "they've left" is the more urgent
    // fact when you're reading a performance cycle.
    const chip = d.status === "Resigned"
        ? `<span style="${chipStyle("#fee2e2", "#b91c1c")}">Resigned</span>`
        : d.has_concurrent
            ? `<span style="${chipStyle(d.is_primary ? "#e6f4f1" : "#f1eafc", d.is_primary ? "#0f766e" : "#7c3aed")}">${d.is_primary ? "Primary" : "Concurrent"}</span>`
            : "";

    // FTE gets its own labelled line rather than a pill tucked in a corner.
    // The headcount dimension has a real rollup (people + department buckets);
    // elsewhere it's the seat count of this node's subtree, passed in by the
    // caller since nodeHtml has no view of the tree.
    const fteValue = dimension === "headcount" ? (d.total_headcount ?? 0) : (fte ?? 0);
    const fteLine = `<div style="display:flex;align-items:baseline;gap:5px;pointer-events:none;">
        <span style="font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;">FTE</span>
        <span style="font-size:11px;font-weight:800;color:#0b1f3a;">${fteValue}</span>
        ${dimension === "headcount" ? `<span style="font-size:9px;color:#94a3b8;margin-left:2px;">· ${d.country_count ?? 0} countries</span>` : ""}
      </div>`;

    // Planning tag (src/lib/tag-colors.ts): a soft full-card tint, no HR
    // meaning — just a marker for whoever's using the chart to plan with.
    // Low-alpha fill (via an 8-digit hex suffix) keeps the card's own text
    // fully readable; the border picks up a stronger tint of the same color
    // instead of the default black so the whole card reads as one tagged unit.
    const tagHex = tagColorHex(d.tag_color);

    // Fixed content-row height (matches CARD_HEIGHT in the chart's
    // .nodeHeight() config) — every card is the same height regardless of
    // whether it has a chip; a card with fewer rows just centers its content
    // in the same box instead of shrinking. Stack V1's embedded list (if any)
    // is a separate section below this row, not counted in it.
    return `
    <div data-node-id="${esc(d.id)}"
      style="box-sizing:border-box;width:100%;height:100%;border:${highlighted ? "2px solid #2563EB" : `1px solid ${tagHex ? `${tagHex}80` : "#000000"}`};border-radius:12px;background:${tagHex ? `${tagHex}1f` : "#fff"};
             box-shadow:${highlighted ? "0 0 0 3px #2563EB33, 0 1px 3px rgba(0,0,0,.06)" : "0 1px 3px rgba(0,0,0,.06)"};font-family:system-ui;cursor:grab;user-select:none;overflow:hidden;
             display:flex;flex-direction:column;${d.status !== "Active" ? "opacity:.55;" : ""}">
      <div style="height:${perf ? 112 : 90}px;flex-shrink:0;display:flex;align-items:stretch;position:relative;pointer-events:none;">
        ${bannerLogo}
        ${photo}
        <div style="min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;padding:10px 13px 10px 12px;padding-right:26px;">
          <div style="font-weight:700;font-size:13.5px;line-height:1.2;color:#0b1f3a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(d.name)}</div>
          ${chip}
          <div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(d.position_title)}</div>
          <div style="margin-top:4px;">${fteLine}</div>
          ${perf ? bulletBar(perf) : ""}
        </div>
      </div>
      ${stackList ? `<div style="padding:0 12px 8px;border-top:1px solid #e2e8f0;padding-top:6px;">${stackList}</div>` : ""}
    </div>`;
}
