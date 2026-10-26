import { listSettings } from "@/app/actions/settings";
import { SettingsClient } from "./settings-client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBannersAdmin } from "@/app/actions/banners";
import { getCompanySummary } from "@/app/actions/org";
import { BannersAdmin } from "./banners-admin";
import { UserGuide } from "./user-guide";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    const user = await getCurrentUser();
    const isSuper = user?.role === "super";
    // The API key and company/office admin actions are requireSuper()-gated
    // server-side (see permissions.ts audit finding) — hiding the sections
    // for non-super users too, so the page doesn't show controls that would
    // just throw on click.
    const [settings, banners, companySummary] = isSuper
        ? await Promise.all([listSettings(), listBannersAdmin(), getCompanySummary()])
        : [[], [], []];
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <div className="mb-4 shrink-0">
                <h1 className="text-[22px] sm:text-[26px] font-extrabold text-[#0b1f3a] tracking-tight">Settings</h1>
                <p className="text-[13.5px] text-slate-500 mt-0.5">API keys and integrations · more settings coming soon</p>
            </div>
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto space-y-8">
                <div className="max-w-4xl">
                    <UserGuide />
                </div>
                {isSuper ? (
                    <>
                        <div className="max-w-2xl">
                            <SettingsClient settings={settings} />
                        </div>
                        <div className="max-w-4xl">
                            <BannersAdmin banners={banners} companySummary={companySummary} />
                        </div>
                    </>
                ) : (
                    <p className="text-[13.5px] text-slate-400">The sections below (API key, company management) are super-user only.</p>
                )}
            </div>
        </div>
    );
}
