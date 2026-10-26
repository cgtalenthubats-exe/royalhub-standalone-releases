// Performance target maths — one module the server actions, the org-chart node
// renderer, the /performance page and the profile card all import, so progress
// is never computed two slightly different ways in two places (same reasoning
// as src/lib/format.ts and src/lib/tag-colors.ts).

// The minimal shape both `banner_goals` and `employee_targets` satisfy, so one
// set of functions covers company goals and individual targets alike.
export interface Measurable {
    target_value: number | null;
    actual_value: number | null;
    progress_pct: number | null;
    weight?: number | null;
    metric_unit?: string | null;
}

// Progress as a percentage of target, or null when it can't be computed yet.
//
// A manually-entered `progress_pct` always wins — that's the escape hatch for
// goals that aren't naturally numeric ("launch the loyalty programme"), and
// also for "lower is better" metrics like turnover, where actual/target would
// be upside down. Phase 1 has no direction flag; entering the % by hand is the
// supported way to express those.
export function progressPct(row: Measurable): number | null {
    if (row.progress_pct != null) return row.progress_pct;
    if (row.target_value == null || row.actual_value == null) return null;
    if (row.target_value === 0) return null; // no meaningful ratio against a zero target
    return (row.actual_value / row.target_value) * 100;
}

// Progress for a company goal, which has a second source individual targets
// don't: the people working on it. An explicitly entered actual/progress wins
// (a goal like "total group revenue" isn't the sum of anyone's individual
// targets), otherwise it falls back to the weighted rollup of every target
// aligned to it, so achievement doesn't have to be re-typed at company level.
export function goalProgress(goal: Measurable & { aligned_rollup?: number | null }): number | null {
    return progressPct(goal) ?? goal.aligned_rollup ?? null;
}

// True when the figure shown came from the aligned targets rather than being
// typed in — the UI labels it so nobody mistakes a derived number for an entry.
export function goalProgressIsDerived(goal: Measurable & { aligned_rollup?: number | null }): boolean {
    return progressPct(goal) == null && goal.aligned_rollup != null;
}

// Sum of weights — the UI warns (without blocking) when this isn't 100.
export function weightSum(rows: Measurable[]): number {
    return rows.reduce((s, r) => s + (r.weight ?? 0), 0);
}

// Weighted overall achievement across a set of targets, or null if not one of
// them has measurable progress yet.
//
// Rows with no computable progress are skipped entirely rather than counted as
// zero — a target nobody has reported on yet shouldn't drag the score down as
// if it had failed.
//
// Weighting: when no row carries a weight at all, every row counts equally.
// Once ANY row is weighted, an unweighted row contributes nothing — it's
// treated as a gap for the user to fix, which `weightSum` surfaces as the
// "weights don't add up to 100%" warning rather than being silently absorbed.
export function rollup(rows: Measurable[]): number | null {
    const scored = rows
        .map((r) => ({ pct: progressPct(r), weight: r.weight ?? 0 }))
        .filter((r): r is { pct: number; weight: number } => r.pct != null);
    if (!scored.length) return null;

    const totalWeight = scored.reduce((s, r) => s + r.weight, 0);
    if (totalWeight <= 0) {
        return scored.reduce((s, r) => s + r.pct, 0) / scored.length;
    }
    return scored.reduce((s, r) => s + r.pct * r.weight, 0) / totalWeight;
}

// ── Status ────────────────────────────────────────────────────────────────
// Every surface that shows a status must also show text/numbers next to it —
// the colour alone never carries the meaning (both an accessibility
// requirement and what keeps this readable alongside the per-employee planning
// tag in src/lib/tag-colors.ts, which owns the org-chart card's own tint).

export type PerfStatus = "none" | "pending" | "below" | "near" | "met";

export interface PerfStatusMeta { key: PerfStatus; label: string; hex: string }

export const PERF_STATUS: Record<PerfStatus, PerfStatusMeta> = {
    none:    { key: "none",    label: "No targets",       hex: "#94a3b8" }, // slate-400 — nothing recorded
    pending: { key: "pending", label: "Awaiting results", hex: "#0ea5e9" }, // sky-500 — set up, no data yet
    below:   { key: "below",   label: "Below target",     hex: "#dc2626" }, // red-600
    near:    { key: "near",    label: "Near target",      hex: "#f59e0b" }, // amber-500
    met:     { key: "met",     label: "On target",        hex: "#059669" }, // emerald-600
};

export function perfStatus(pct: number | null, targetCount: number): PerfStatus {
    if (targetCount === 0) return "none";
    if (pct == null) return "pending"; // targets exist, but nobody has reported an actual yet
    if (pct < 80) return "below";
    if (pct < 100) return "near";
    return "met";
}

export function statusHex(status: PerfStatus): string {
    return PERF_STATUS[status].hex;
}

// Display helper: "82 / 100 €M" — the numbers that must always accompany a bar.
export function formatMeasure(row: Measurable): string | null {
    if (row.target_value == null) return null;
    // An em dash, not 0, when nothing has been entered — "0 / 100" reads as a
    // reported failure, which is the opposite of "nobody has said yet".
    const actual = row.actual_value == null ? "—" : trimNum(row.actual_value);
    return `${actual} / ${trimNum(row.target_value)}${row.metric_unit ? ` ${row.metric_unit}` : ""}`;
}

function trimNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
