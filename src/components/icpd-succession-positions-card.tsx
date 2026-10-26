import type { SuccessionPositionForEmployee } from "@/app/actions/icpd";
import { Card } from "@/components/ui/card";

// Mirrors READY_COLOR's labels in succession-seat-dialog.tsx (kept separate
// since that file is a client component and this one isn't).
const READINESS_LABEL: Record<string, string> = { ready_now: "Ready Now", ready_1_3: "Ready 1-3Y", ready_3_5: "Ready 3-5Y" };

// Read-only — this is the reverse view of the succession board (which seats
// this person is a candidate for), so it's edited from /org/succession, not here.
export function SuccessionPositionsCard({ positions }: { positions: SuccessionPositionForEmployee[] }) {
    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center justify-between border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span>Succession Positions</span>
            </div>
            <div className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto">
                {positions.map((p) => (
                    <div key={p.candidate_id} className="px-3.5 py-2.5 text-[12.5px]">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-semibold text-[#0f172a]">{p.seat_label}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">
                                    {[p.banner_name, p.incumbent_name ? `currently ${p.incumbent_name}` : null].filter(Boolean).join(" · ")}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {p.rank && <span className="rounded bg-[#0b1f3a]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0b1f3a]">#{p.rank}</span>}
                                {p.readiness && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">{READINESS_LABEL[p.readiness] || p.readiness}</span>}
                            </div>
                        </div>
                        {p.attributes.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {p.attributes.map((a, i) => (
                                    <span key={i} className="rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-500">
                                        {a.attribute_name}{a.potential ? ` — ${a.potential}` : ""}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {positions.length === 0 && <div className="px-3.5 py-4 text-[12px] text-slate-400">Not currently a candidate for any succession seat.</div>}
            </div>
        </Card>
    );
}
