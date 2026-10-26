"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setEmployeeTagColor } from "@/app/actions/employee-crud";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TAG_COLORS, tagColorHex } from "@/lib/tag-colors";
import { Tag, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Free-form planning tag shown as a colored stripe on the org-chart node
// (org-chart-d3.tsx's nodeHtml) — no HR meaning, just a marker for whoever's
// using the chart to plan restructuring, hiring, succession moves, etc.
export function TagColorPicker({ employeeId, tagColor }: { employeeId: number; tagColor: string | null }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const hex = tagColorHex(tagColor);

    async function pick(key: string | null) {
        setSaving(true);
        const res = await setEmployeeTagColor(employeeId, key);
        setSaving(false);
        setOpen(false);
        if (res.ok) { toast.success(key ? "Tag set" : "Tag cleared"); router.refresh(); }
        else toast.error(res.error || "Could not set tag");
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    title="Planning tag"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 transition-colors hover:border-slate-300"
                    style={hex ? { backgroundColor: hex, borderColor: hex } : undefined}
                >
                    <Tag className={cn("h-3 w-3", hex ? "text-white" : "text-slate-400")} />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2.5" align="start">
                <div className="mb-2 text-[11px] font-medium text-slate-500">Planning tag</div>
                <div className="flex flex-wrap gap-1.5">
                    <button
                        title="No tag" disabled={saving} onClick={() => pick(null)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400"
                    >
                        {!tagColor && <Check className="h-3 w-3" />}
                    </button>
                    {TAG_COLORS.map((c) => (
                        <button
                            key={c.key} title={c.label} disabled={saving} onClick={() => pick(c.key)}
                            className="flex h-6 w-6 items-center justify-center rounded-full"
                            style={{ backgroundColor: c.hex }}
                        >
                            {tagColor === c.key && <Check className="h-3 w-3 text-white" />}
                        </button>
                    ))}
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
            </PopoverContent>
        </Popover>
    );
}
