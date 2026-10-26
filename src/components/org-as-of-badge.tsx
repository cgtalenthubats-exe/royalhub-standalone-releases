// "As of" is derived automatically from the last saved org-structure change
// (getOrgAsOf) — not a manually-typed field, so there's nothing to edit here.
export function OrgAsOfBadge({ asOf }: { asOf: string | null }) {
    const label = asOf
        ? new Date(asOf).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
        : "not yet set";
    return (
        <div className="flex items-center gap-2 rounded-[9px] border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-500">
            As of <span className="text-[#0b1f3a]">{label}</span>
        </div>
    );
}
