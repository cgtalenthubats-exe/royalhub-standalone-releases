import Link from "next/link";
import { cn } from "@/lib/utils";

const DIMENSIONS = [
    { key: "banner", href: "/org/banner", label: "By Company" },
    { key: "function", href: "/org/function", label: "By Function" },
    { key: "headcount", href: "/org/headcount", label: "FTE" },
] as const;

// Replaces the old "Switch to Function ›" / "Switch to FTE ›" button row —
// now that the sidebar's Org accordion covers that navigation, the three
// pages only need to show which dimension is active.
export function OrgDimensionSwitch({ active }: { active: "banner" | "function" | "headcount" }) {
    return (
        <div className="inline-flex items-center gap-0.5 rounded-[9px] bg-slate-200 p-[3px]">
            {DIMENSIONS.map((d) => (
                <Link
                    key={d.key}
                    href={d.href}
                    className={cn(
                        "rounded-[7px] px-3.5 py-[7px] text-[12.5px] transition-colors",
                        d.key === active ? "bg-[#0b1f3a] text-white font-bold" : "text-slate-500 font-semibold hover:text-slate-700"
                    )}
                >
                    {d.label}
                </Link>
            ))}
        </div>
    );
}
