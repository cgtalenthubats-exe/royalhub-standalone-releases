"use client";

import { useState } from "react";
import { createFunction, type FunctionOption } from "@/app/actions/positions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Client feedback: Add Department had a Function dropdown with no way to
// add a missing one (e.g. "Legal") - this "+ New" quick-add is reused
// everywhere a Function is picked (Add Department, Add/Edit Position), so
// there's exactly one way to create a function, not a different ad-hoc form
// per screen that could drift out of sync with the Settings > Functions page.
export function FunctionSelect({ functions, value, onChange, onCreated, label = "Function" }: {
    functions: FunctionOption[];
    value: number | null;
    onChange: (functionId: number | null) => void;
    onCreated?: (f: FunctionOption) => void; // lets the caller append to its own local list immediately
    label?: string;
}) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const [creating, setCreating] = useState(false);

    async function submit() {
        if (!draft.trim()) return;
        setCreating(true);
        const res = await createFunction(draft.trim());
        setCreating(false);
        if (!res.ok || !res.function) { toast.error(res.error || "Could not create function"); return; }
        onCreated?.(res.function);
        onChange(res.function.function_id);
        setDraft("");
        setAdding(false);
    }

    return (
        <div>
            <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">{label}</label>
                <button type="button" onClick={() => setAdding((v) => !v)} className="text-[11px] font-medium text-[#0b1f3a] hover:underline">
                    {adding ? "Cancel" : "+ New"}
                </button>
            </div>
            {adding ? (
                <div className="flex items-center gap-1.5">
                    <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                        placeholder="New function name"
                        className="h-9"
                        autoFocus
                    />
                    <Button type="button" size="sm" className="h-9 gap-1 shrink-0" style={{ backgroundColor: "#0b1f3a" }} disabled={creating || !draft.trim()} onClick={submit}>
                        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    </Button>
                </div>
            ) : (
                <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
                >
                    <option value="">— none —</option>
                    {functions.map((f) => <option key={f.function_id} value={f.function_id}>{f.name}</option>)}
                </select>
            )}
        </div>
    );
}
