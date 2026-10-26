"use client";

import Link from "next/link";
import type { SeatTargets } from "@/app/actions/performance";
import { progressPct, rollup, formatMeasure, perfStatus, PERF_STATUS } from "@/lib/performance";
import { PerfBulletRow } from "@/components/perf-bullet";
import { Card } from "@/components/ui/card";
import { Target, ExternalLink } from "lucide-react";

// The targets behind the grade. Sits directly under PerformanceCard (which
// holds the A/A-/B+ outcome) so the year's result and the work it came from
// read together.
//
// Grouped by seat, because targets key on employee_position_id — someone with
// a concurrent position at another company genuinely has two separate sets
// (see migration 027 / the seat model in 026). Read-only here by design: the
// editor lives on /performance, where the org context makes it obvious whose
// targets you're changing.
export function PerformanceTargetsCard({ seats, cycleName }: { seats: SeatTargets[]; cycleName: string }) {
    const withTargets = seats.filter((s) => s.targets.length > 0);
    const multiSeat = seats.length > 1;

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span className="flex items-center gap-2"><Target className="h-4 w-4" /> Targets · {cycleName}</span>
                <Link href="/performance" className="flex items-center gap-1 text-[11.5px] font-semibold text-gold-light hover:underline">
                    Manage <ExternalLink className="h-3 w-3" />
                </Link>
            </div>

            {withTargets.length === 0 ? (
                <div className="px-4 py-6 text-center">
                    <p className="text-[12.5px] text-slate-500">No targets recorded for {cycleName}.</p>
                    <Link href="/performance" className="mt-1.5 inline-block text-[12px] font-semibold text-[#0b1f3a] hover:underline">
                        Set them on the Performance page ›
                    </Link>
                </div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {withTargets.map((seat) => {
                        const pct = rollup(seat.targets);
                        const meta = PERF_STATUS[perfStatus(pct, seat.targets.length)];
                        return (
                            <div key={seat.employee_position_id} className="px-4 py-3">
                                {/* Only label the seat when there's more than one — otherwise it's noise */}
                                {multiSeat && (
                                    <div className="mb-2 flex items-center gap-2">
                                        <span
                                            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                            style={seat.is_primary
                                                ? { background: "#e6f4f1", color: "#0f766e" }
                                                : { background: "#f1eafc", color: "#7c3aed" }}
                                        >
                                            {seat.is_primary ? "Primary" : "Concurrent"}
                                        </span>
                                        <span className="truncate text-[11.5px] text-slate-500">
                                            {seat.position_title}{seat.banner_name ? ` · ${seat.banner_name}` : ""}
                                        </span>
                                    </div>
                                )}

                                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Overall</span>
                                    <span className="text-[13px] font-extrabold tabular-nums" style={{ color: pct == null ? "#94a3b8" : meta.hex }}>
                                        {pct == null ? meta.label : `${Math.round(pct)}%`}
                                    </span>
                                </div>

                                <div className="space-y-2.5">
                                    {seat.targets.map((t) => (
                                        <div key={t.target_id}>
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="truncate text-[12.5px] font-semibold text-[#0f172a]">{t.title}</span>
                                                {t.weight != null && <span className="shrink-0 text-[10px] font-semibold text-slate-400">w. {t.weight}%</span>}
                                            </div>
                                            <PerfBulletRow className="mt-1" pct={progressPct(t)} targetCount={1} measure={formatMeasure(t)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
