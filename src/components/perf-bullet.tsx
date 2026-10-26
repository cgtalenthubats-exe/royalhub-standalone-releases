import { PERF_STATUS, perfStatus, type PerfStatus } from "@/lib/performance";

// React twin of the bullet bar the org-chart node draws as inline HTML
// (bulletBar() in org-chart-d3.tsx) — same geometry and semantics, used
// everywhere that's ordinary DOM: the goals list, the target drawer, the
// profile card.
//
// Bullet, not a plain progress bar: the track spans 0–120% with a tick at
// 100% (the target), so over-achievement is visible instead of clipping at a
// full bar. The number always sits beside it — colour never carries the
// meaning alone.

const SCALE_MAX = 120;
const TICK = (100 / SCALE_MAX) * 100;

export function PerfBullet({ pct, status, className = "" }: { pct: number | null; status: PerfStatus; className?: string }) {
    const meta = PERF_STATUS[status];
    const fill = pct == null ? 0 : (Math.min(Math.max(pct, 0), SCALE_MAX) / SCALE_MAX) * 100;
    const over = pct != null && pct > 100;

    return (
        <div
            className={`relative h-1.5 min-w-0 flex-1 rounded-full bg-slate-200 ${className}`}
            role="img"
            aria-label={pct == null ? meta.label : `${Math.round(pct)}% of target`}
        >
            {fill > 0 && (
                <div
                    className="absolute inset-y-0 left-0 rounded-l-full"
                    style={{ width: `${Math.min(fill, TICK)}%`, background: meta.hex }}
                />
            )}
            {over && (
                <div
                    className="absolute inset-y-0 opacity-45"
                    style={{ left: `${TICK}%`, width: `${fill - TICK}%`, background: meta.hex }}
                />
            )}
            {/* the target marker */}
            <div className="absolute -top-0.5 -bottom-0.5 w-[1.5px] bg-[#0b1f3a]" style={{ left: `${TICK}%` }} />
        </div>
    );
}

// Bar + its number, the pairing that should be used by default — a bare bar
// with no figure beside it is exactly what the accessibility rule forbids.
export function PerfBulletRow({ pct, targetCount, measure, className = "" }: {
    pct: number | null;
    targetCount: number;
    measure?: string | null; // "82 / 100 €M"
    className?: string;
}) {
    const status = perfStatus(pct, targetCount);
    const meta = PERF_STATUS[status];
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <PerfBullet pct={pct} status={status} />
            {measure && <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">{measure}</span>}
            <span
                className="shrink-0 text-[11.5px] font-extrabold tabular-nums"
                style={{ color: pct == null ? "#94a3b8" : meta.hex }}
            >
                {pct == null ? meta.label : `${Math.round(pct)}%`}
            </span>
        </div>
    );
}

// Small status chip for headers/legends — icon-free but always text-labelled.
export function PerfStatusChip({ status }: { status: PerfStatus }) {
    const meta = PERF_STATUS[status];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{ background: `${meta.hex}1f`, color: meta.hex }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.hex }} />
            {meta.label}
        </span>
    );
}
