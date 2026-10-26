"use client";

import { useState } from "react";
import { OrgChartOcrDialog } from "./orgchart-ocr-dialog";
import { Upload } from "lucide-react";

interface OfficeOpt { office_id: number; banner_id: number; banner_name: string; country: string; city: string | null }
interface FunctionOpt { function_id: number; name: string }
interface PositionOpt { position_id: number; title: string; banner_id: number | null }
interface BannerOpt { banner_id: number; name: string }

export function OrgChartOcrButton({ offices, positions, functions, banners }: { offices: OfficeOpt[]; positions: PositionOpt[]; functions: FunctionOpt[]; banners: BannerOpt[] }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 bg-white border border-slate-200 rounded-[9px] px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
                <Upload className="h-3.5 w-3.5" /> Upload Org Chart
            </button>
            <OrgChartOcrDialog open={open} onOpenChange={setOpen} offices={offices} positions={positions} functions={functions} banners={banners} />
        </>
    );
}
