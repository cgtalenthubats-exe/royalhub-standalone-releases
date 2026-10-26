"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateInsights } from "@/app/actions/insights";
import { Sparkles, Loader2, Trophy, TrendingUp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const ICON: Record<string, any> = {
    "Top Performer": Trophy,
    "Leadership Potential": TrendingUp,
    "Talent Status": ShieldCheck,
};

interface Insight { id: number; category: string; content: string; source: string }

export function InsightsCard({ employeeId, initial }: { employeeId: number; initial: Insight[] }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleGenerate() {
        setLoading(true);
        const res = await generateInsights(employeeId);
        setLoading(false);
        if (res.ok) {
            toast.success("Key Insights generated");
            router.refresh();
        } else {
            toast.error(res.error || "Generation failed");
        }
    }

    return (
        <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2 text-sm font-semibold text-white">
                <span>Key Insights</span>
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={handleGenerate} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {loading ? "Generating..." : "Generate with AI"}
                </Button>
            </div>
            <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
                {initial.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No insights yet. Click <strong>Generate with AI</strong> or add manually.
                    </div>
                )}
                {initial.map((ins) => {
                    const Icon = ICON[ins.category] || Sparkles;
                    return (
                        <div key={ins.id} className="flex gap-3 rounded-lg border p-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0b1f3a]/5 text-[#0b1f3a]">
                                <Icon className="h-4 w-4" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-[#0b1f3a]">{ins.category}</span>
                                    <Badge variant="secondary" className="text-[9px] uppercase">{ins.source}</Badge>
                                </div>
                                <p className="text-sm text-slate-600">{ins.content}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
