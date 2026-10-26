"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OrgChart } from "d3-org-chart";
import type { SuccessionSeatNode } from "@/app/actions/succession";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Focus } from "lucide-react";
import { SeatDialog, READY_COLOR, type Opt, type OfficeOpt } from "@/components/succession-seat-dialog";

function esc(s: any) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

export function SuccessionChartD3({ nodes, bannerId, employees, positions, offices }: {
    nodes: SuccessionSeatNode[];
    bannerId: number;
    employees: Opt[];
    positions: Opt[];
    offices: OfficeOpt[];
}) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const [selected, setSelected] = useState<SuccessionSeatNode | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        // d3-org-chart can't build a tree (and .fit() has no root to measure)
        // from an empty array — a company with no succession seats yet.
        if (!containerRef.current || nodes.length === 0) return;
        if (!chartRef.current) chartRef.current = new OrgChart();
        chartRef.current
            .container(containerRef.current as any)
            .data(nodes as any)
            .svgHeight(containerRef.current.clientHeight || 600)
            .compact(false) // standard org-chart convention: every sibling in a generation sits in one straight row, never packed into a 2-column grid
            .nodeWidth(() => 240)
            .nodeHeight((d: any) => 92 + Math.min(d.data.candidates.length, 4) * 18)
            .childrenMargin(() => 60)
            .siblingsMargin(() => 26)
            .linkUpdate(function (this: SVGPathElement) {
                this.setAttribute("stroke", "#000000");
                this.setAttribute("stroke-width", "1");
            })
            .nodeContent((d: any) => nodeHtml(d.data))
            .render()
            .fit(); // auto-scale to the visible viewport on load — most noticeable on mobile
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes]);

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

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onClick = (e: MouseEvent) => {
            const card = (e.target as HTMLElement)?.closest("[data-seat-id]") as HTMLElement | null;
            if (!card) return;
            const seatId = Number(card.getAttribute("data-seat-id"));
            const node = nodes.find((n) => n.seat_id === seatId);
            if (node) setSelected(node);
        };
        el.addEventListener("click", onClick);
        return () => el.removeEventListener("click", onClick);
    }, [nodes]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2 shrink-0">
                <span className="mr-auto text-xs text-muted-foreground">Click a seat to view / manage successors</span>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => chartRef.current?.expandAll().fit()}><Maximize2 className="h-3.5 w-3.5" /> Expand</Button>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => chartRef.current?.collapseAll().fit()}><Minimize2 className="h-3.5 w-3.5" /> Collapse</Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.zoomIn()}><ZoomIn className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.zoomOut()}><ZoomOut className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => chartRef.current?.fit()}><Focus className="h-3.5 w-3.5" /></Button>
            </div>
            {nodes.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-400">No succession plan seats configured for this company yet</div>
            ) : (
                <div ref={containerRef} style={{ flex: 1, minHeight: 0, width: "100%", background: "#f8fafc" }} />
            )}

            <SeatDialog
                seat={selected}
                open={!!selected}
                onClose={() => setSelected(null)}
                bannerId={bannerId}
                employees={employees}
                positions={positions}
                offices={offices}
                onChanged={() => router.refresh()}
            />
        </div>
    );
}

function nodeHtml(d: SuccessionSeatNode): string {
    const isVacant = !d.employee_id;
    const candidateRows = d.candidates.slice(0, 4).map((c) => {
        const color = READY_COLOR[c.readiness];
        return `<div style="display:flex;align-items:center;gap:5px;font-size:10px;padding:1.5px 0;">
      <span style="width:7px;height:7px;border-radius:50%;background:${color.fg};flex-shrink:0;"></span>
      <span style="color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">${esc(c.candidate_name)}</span>
      ${c.candidate_employee_id ? `<span style="color:#A16207;font-size:9px;" title="Internal">&#9733;</span>` : ""}
    </div>`;
    }).join("");

    const header = isVacant
        ? `<div style="font-weight:700;font-size:12px;color:#94a3b8;letter-spacing:.03em;">VACANT</div>`
        : `<div style="display:flex;align-items:center;gap:8px;">
        ${d.employee_photo
            ? `<img src="${esc(d.employee_photo)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" />`
            : `<div style="width:32px;height:32px;border-radius:50%;background:#0b1f3a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;">${esc((d.employee_name || "").split(" ").map((p) => p[0]).slice(0, 2).join(""))}</div>`}
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:12.5px;color:#0b1f3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(d.employee_name)}</div>
          <div style="font-size:9.5px;color:#94a3b8;">Age ${d.age ?? "-"} · ${esc(d.job_grade || "-")}</div>
        </div>
      </div>`;

    return `
    <div data-seat-id="${d.seat_id}"
      style="box-sizing:border-box;width:240px;height:100%;border:1px solid #000;border-radius:12px;background:#fff;
             box-shadow:0 1px 3px rgba(0,0,0,.06);padding:10px 12px;font-family:system-ui;cursor:pointer;${isVacant ? "border-style:dashed;" : ""}">
      <div style="font-size:9.5px;font-weight:700;color:#0b1f3a;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(d.position_title || "")}</div>
      ${header}
      <div style="margin-top:6px;border-top:1px solid #f1f5f9;padding-top:4px;">
        ${candidateRows || `<div style="font-size:10px;color:#cbd5e1;">No successors yet</div>`}
      </div>
    </div>`;
}
