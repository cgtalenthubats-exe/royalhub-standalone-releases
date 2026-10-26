import type { TextBudget } from "@/lib/pptx-text-budget";
import { cn } from "@/lib/utils";

// Shown under a field that feeds the ICPD PPTX export — `count` is this
// field's own length, or (for fields sharing one PPTX box across several
// entries, e.g. Background Strengths) the combined length across all of them.
export function CharBudgetHint({ count, budget }: { count: number; budget: TextBudget }) {
    const over = count > budget.max;
    return (
        <div className={cn("mt-1 text-[10.5px]", over ? "text-amber-600" : "text-slate-400")}>
            {count} / {budget.max} — {budget.note}
        </div>
    );
}
