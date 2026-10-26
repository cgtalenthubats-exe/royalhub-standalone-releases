import { listPositions } from "@/app/actions/positions";
import { getFunctionSummary, listBanners } from "@/app/actions/org";
import { PositionsClient } from "./positions-client";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
    const [positions, functions, banners] = await Promise.all([listPositions(), getFunctionSummary(), listBanners()]);
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <PositionsClient
                positions={positions}
                functions={functions.map((f) => ({ function_id: f.function_id, name: f.name }))}
                banners={banners}
            />
        </div>
    );
}
