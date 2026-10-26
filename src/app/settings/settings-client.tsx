"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingItem } from "@/app/actions/settings";
import { saveSetting } from "@/app/actions/settings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Loader2, Save, KeyRound } from "lucide-react";
import { toast } from "sonner";

const NAVY = "#0b1f3a";

export function SettingsClient({ settings }: { settings: SettingItem[] }) {
    return (
        <div className="space-y-3.5">
            {settings.map((s) => (
                <SettingRow key={s.key} setting={s} />
            ))}
        </div>
    );
}

function SettingRow({ setting }: { setting: SettingItem }) {
    const router = useRouter();
    const [value, setValue] = useState("");
    const [reveal, setReveal] = useState(false);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        const res = await saveSetting(setting.key, value);
        setSaving(false);
        if (res.ok) {
            toast.success("Saved");
            setValue("");
            router.refresh();
        } else {
            toast.error(res.error || "Save failed");
        }
    }

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex items-center gap-2 border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <KeyRound className="h-3.5 w-3.5 text-gold-light" /> {setting.label}
            </div>
            <div className="p-4 space-y-3">
                <p className="text-[12.5px] text-slate-500">{setting.description}</p>

                <div className="flex items-center gap-2 text-[12px]">
                    <span className="text-slate-400">Current:</span>
                    {setting.hasValue ? (
                        <>
                            <span className="font-mono font-medium text-slate-700">{setting.maskedValue}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${setting.source === "database" ? "bg-gold/10 text-gold" : "bg-slate-100 text-slate-500"}`}>
                                {setting.source === "database" ? "saved here" : "from .env"}
                            </span>
                            {setting.updatedAt && <span className="text-slate-400">· updated {new Date(setting.updatedAt).toLocaleDateString("en-GB")}</span>}
                        </>
                    ) : (
                        <span className="text-slate-400 italic">not set</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={reveal ? "text" : "password"}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={setting.hasValue ? "Enter a new key to replace it…" : "Paste your key here…"}
                            className="pr-9"
                            autoComplete="off"
                        />
                        <button
                            type="button"
                            onClick={() => setReveal((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            tabIndex={-1}
                        >
                            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    <Button size="sm" className="gap-1.5 shrink-0" style={{ backgroundColor: NAVY }} disabled={saving || !value.trim()} onClick={save}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                    </Button>
                </div>
            </div>
        </Card>
    );
}
