"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFunctionHead, type FunctionHeadCandidate } from "@/app/actions/org";
import { Loader2, Crown } from "lucide-react";
import { toast } from "sonner";

// Designates the overall "Head of Function" — the person other companies'
// (or other functions') leads can be pointed at as a real reporting line
// (drag-and-drop, or the profile's Org Snapshot editor) to show up here.
// This control itself only sets who the anchor is; it doesn't create any
// reporting lines by itself. Only shown when viewing a function across every
// company, where more than one candidate exists.
export function FunctionHeadPicker({ functionId, functionName, headEmployeeId, candidates }: {
    functionId: number; functionName: string; headEmployeeId: number | null; candidates: FunctionHeadCandidate[];
}) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    async function changeHead(value: string) {
        setSaving(true);
        const res = await setFunctionHead(functionId, value ? Number(value) : null);
        setSaving(false);
        if (res.ok) { toast.success(value ? "Head of Function updated" : "Head of Function cleared"); router.refresh(); }
        else toast.error(res.error || "Failed to update");
    }

    if (candidates.length <= 1) return null;

    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 py-2.5 shrink-0">
            <Crown className="h-4 w-4 text-gold shrink-0" />
            <span className="text-[12.5px] font-medium text-slate-600 shrink-0">Head of {functionName}:</span>
            <select
                className="h-8 min-w-[220px] flex-1 rounded-md border bg-background px-2 text-[12.5px]"
                value={headEmployeeId ?? ""}
                disabled={saving}
                onChange={(e) => changeHead(e.target.value)}
            >
                <option value="">— not assigned —</option>
                {candidates.map((c) => (
                    <option key={c.employee_id} value={c.employee_id}>{c.name}{c.banner_name ? ` · ${c.banner_name}` : ""}</option>
                ))}
            </select>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />}
            <span className="w-full text-[11px] text-slate-400">
                To link another company's lead to them, drag it under {candidates.find((c) => c.employee_id === headEmployeeId)?.name || "the head"} on the chart, or use that person's own Org Snapshot editor.
            </span>
        </div>
    );
}
