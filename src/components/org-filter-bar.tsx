"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface Opt { id: number; name: string }

export function OrgFilterBar({ companies, functions }: { companies: Opt[]; functions?: Opt[] }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    function setParam(key: string, value: string) {
        const params = new URLSearchParams(searchParams.toString());
        if (value) params.set(key, value); else params.delete(key);
        router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    }

    return (
        <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
            <FilterSelect
                value={searchParams.get("company") || ""}
                onChange={(v) => setParam("company", v)}
                placeholder="All Companies"
                options={companies}
            />
            {functions && (
                <FilterSelect
                    value={searchParams.get("function") || ""}
                    onChange={(v) => setParam("function", v)}
                    placeholder="All Functions"
                    options={functions}
                />
            )}
        </div>
    );
}

function FilterSelect({ value, onChange, placeholder, options }: {
    value: string; onChange: (v: string) => void; placeholder: string; options: Opt[];
}) {
    return (
        <div className="relative flex items-center">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="appearance-none h-9 bg-white border border-slate-200 rounded-[9px] pl-3 pr-8 text-[13px] font-semibold text-slate-700 cursor-pointer outline-none"
            >
                <option value="">{placeholder}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" />
        </div>
    );
}
