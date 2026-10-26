"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireSuper } from "@/lib/auth/current-user";

// Registry of known settings — add new entries here as more get exposed on
// the Settings page ("อนาคตค่อยว่ากัน" — more will follow, keep this extensible).
const REGISTRY: Record<string, { label: string; description: string; envFallback?: string }> = {
    gemini_api_key: {
        label: "Gemini API Key",
        description: "Used to generate Key Insights and Proposal AI Assessments (model: gemini-3.1-flash-lite).",
        envFallback: "GEMINI_API_KEY",
    },
};

export interface SettingItem {
    key: string;
    label: string;
    description: string;
    hasValue: boolean;
    maskedValue: string | null; // last 4 chars only, never the full secret
    source: "database" | "environment" | "none";
    updatedAt: string | null;
}

function mask(value: string): string {
    return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

export async function listSettings(): Promise<SettingItem[]> {
    const keys = Object.keys(REGISTRY);
    const rows = await query<any>(`select key, value, updated_at from app_settings where key = any($1)`, [keys]);
    const byKey = new Map(rows.map((r) => [r.key, r]));

    return keys.map((key) => {
        const meta = REGISTRY[key];
        const row = byKey.get(key);
        const dbValue = row?.value?.trim();
        if (dbValue) {
            return { key, label: meta.label, description: meta.description, hasValue: true, maskedValue: mask(dbValue), source: "database", updatedAt: row.updated_at };
        }
        const envValue = meta.envFallback ? process.env[meta.envFallback] : undefined;
        if (envValue) {
            return { key, label: meta.label, description: meta.description, hasValue: true, maskedValue: mask(envValue), source: "environment", updatedAt: null };
        }
        return { key, label: meta.label, description: meta.description, hasValue: false, maskedValue: null, source: "none", updatedAt: null };
    });
}

export async function saveSetting(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    if (!(key in REGISTRY)) return { ok: false, error: "Unknown setting" };
    const trimmed = value.trim();
    try {
        if (trimmed) {
            await query(
                `insert into app_settings (key, value, updated_at) values ($1, $2, CURRENT_TIMESTAMP)
                 on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
                [key, trimmed]
            );
        } else {
            // empty save = clear the stored override, fall back to env
            await query(`delete from app_settings where key = $1`, [key]);
        }
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/settings");
    return { ok: true };
}

// Server-side resolver used by AI actions — DB override first, env var fallback.
export async function getSettingValue(key: string): Promise<string | null> {
    const row = await queryOne<any>(`select value from app_settings where key = $1`, [key]);
    const dbValue = row?.value?.trim();
    if (dbValue) return dbValue;
    const envFallback = REGISTRY[key]?.envFallback;
    return (envFallback && process.env[envFallback]) || null;
}
