"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProposalAssessment } from "@/app/actions/ai-assessment";
import { generateProposalAssessment } from "@/app/actions/ai-assessment";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Loader2, Users, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const NAVY = "#0b1f3a";

export function AiAssessmentTab({
    proposalId,
    subjectName,
    targetPosition,
    peerCount,
    assessment,
}: {
    proposalId: number;
    subjectName: string;
    targetPosition: string | null;
    peerCount: number;
    assessment: ProposalAssessment | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [jd, setJd] = useState(assessment?.job_description || "");
    const [context, setContext] = useState(assessment?.additional_context || "");
    const [generating, setGenerating] = useState(false);

    function openDialog() {
        setJd(assessment?.job_description || "");
        setContext(assessment?.additional_context || "");
        setOpen(true);
    }

    async function generate() {
        setGenerating(true);
        const res = await generateProposalAssessment(proposalId, jd, context);
        setGenerating(false);
        if (res.ok) {
            toast.success("Assessment generated");
            setOpen(false);
            router.refresh();
        } else {
            toast.error(res.error || "Generation failed");
        }
    }

    return (
        <div className="flex-1 lg:min-h-0 lg:overflow-y-auto space-y-4 pb-2">
            <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
                <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                    <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-gold-light" /> AI Assessment</span>
                    <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={openDialog} disabled={generating}>
                        {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {assessment ? "Regenerate" : "Generate Assessment"}
                    </Button>
                </div>

                {!assessment && (
                    <div className="flex flex-col items-center gap-2 py-14 text-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/10 text-gold"><Sparkles className="h-5 w-5" /></div>
                        <div className="text-sm font-semibold" style={{ color: NAVY }}>No assessment yet</div>
                        <p className="max-w-sm text-[12.5px] text-muted-foreground">
                            Compare {subjectName} against {peerCount > 0 ? `${peerCount} pinned peer${peerCount === 1 ? "" : "s"}` : "the target position"}
                            {targetPosition ? ` and the ${targetPosition} role` : ""} — click <strong>Generate Assessment</strong> to start.
                        </p>
                    </div>
                )}

                {assessment && (
                    <div className="p-4 space-y-4">
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Verdict</div>
                            <div className="text-[14px] font-bold" style={{ color: NAVY }}>{assessment.headline}</div>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                <Users className="h-3.5 w-3.5" /> Fit vs Peers &amp; Job Description
                            </div>
                            <ul className="space-y-1.5">
                                {assessment.fit_bullets.map((b, i) => (
                                    <li key={i} className="flex gap-2 text-[13px] text-slate-700">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                <TrendingUp className="h-3.5 w-3.5" /> Market Context
                            </div>
                            <ul className="space-y-1.5">
                                {assessment.market_bullets.map((b, i) => (
                                    <li key={i} className="flex gap-2 text-[13px] text-slate-700">
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400 italic">
                                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                Qualitative, general-knowledge context only — not verified against live compensation survey data.
                            </div>
                        </div>

                        <div className="text-[10.5px] text-slate-400 pt-1 border-t">
                            Generated {new Date(assessment.generated_at).toLocaleString("en-GB")} · based on {assessment.peer_employee_ids.length} peer{assessment.peer_employee_ids.length === 1 ? "" : "s"}
                            {assessment.job_description ? " · with job description" : ""}
                        </div>
                    </div>
                )}
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Generate AI Assessment</DialogTitle></DialogHeader>
                    <p className="-mt-1 text-[12.5px] text-muted-foreground">
                        Compares {subjectName} against {peerCount > 0 ? `${peerCount} pinned peer${peerCount === 1 ? "" : "s"}` : "no pinned peers yet"}{targetPosition ? ` for the ${targetPosition} role` : ""}.
                    </p>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Job Description (optional)</label>
                        <textarea
                            className="h-32 w-full resize-none rounded-md border bg-background p-2.5 text-[12.5px]"
                            placeholder="Paste the target position's job description, if you have one…"
                            value={jd}
                            onChange={(e) => setJd(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Additional context (optional)</label>
                        <textarea
                            className="h-20 w-full resize-none rounded-md border bg-background p-2.5 text-[12.5px]"
                            placeholder="Anything else the assessment should factor in — e.g. special circumstances, priorities, concerns…"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={generate} disabled={generating} className="gap-1.5">
                            {generating && <Loader2 className="h-4 w-4 animate-spin" />} {generating ? "Generating…" : "Generate"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
