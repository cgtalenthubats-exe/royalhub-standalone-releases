"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFunctionHead } from "@/app/actions/org";
import { Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Same action as the dropdown on /org/function, offered here too since
// designating a Head of Function is naturally a decision made from the
// person's own profile just as often as from the org chart.
export function FunctionHeadToggle({ functionId, functionName, employeeId, isHead }: {
    functionId: number; functionName: string; employeeId: number; isHead: boolean;
}) {
    const router = useRouter();
    const [saving, setSaving] = useState(false);

    async function toggle(checked: boolean) {
        setSaving(true);
        const res = await setFunctionHead(functionId, checked ? employeeId : null);
        setSaving(false);
        if (res.ok) { toast.success(checked ? `Set as Head of ${functionName}` : `Cleared as Head of ${functionName}`); router.refresh(); }
        else toast.error(res.error || "Failed to update");
    }

    return (
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#0b1f3a]" checked={isHead} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
            <Crown className="h-3 w-3 text-gold" />
            Head of {functionName}
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        </label>
    );
}
