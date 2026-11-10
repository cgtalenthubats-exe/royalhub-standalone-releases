"use server";

import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireSuper } from "@/lib/auth/current-user";

export interface CurrencyRate {
    currency_code: string;
    rate_to_eur: number;
    updated_at: string;
    updated_by: string | null;
}

export async function listCurrencyRates(): Promise<CurrencyRate[]> {
    return query<CurrencyRate>(
        `select currency_code, rate_to_eur, updated_at, updated_by from currency_rates
         order by case currency_code when 'EUR' then 0 else 1 end, currency_code`
    );
}

// EUR is the fixed anchor currency - every other rate is quoted as "1 unit =
// ? EUR" (see schema.sql), so EUR itself is never edited or removed.
export async function updateCurrencyRate(currencyCode: string, rateToEur: number): Promise<{ ok: boolean; error?: string }> {
    const user = await requireSuper();
    if (currencyCode === "EUR") return { ok: false, error: "EUR is the base currency and can't be changed." };
    if (!Number.isFinite(rateToEur) || rateToEur <= 0) return { ok: false, error: "Enter a positive rate." };
    try {
        await query(
            `update currency_rates set rate_to_eur = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 where currency_code = $3`,
            [rateToEur, user.display_name, currencyCode]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/settings");
    return { ok: true };
}

// Client feedback: start with EUR/GBP/CHF/DKK, but let a Super user add more
// currencies later without a code change.
export async function addCurrency(currencyCode: string, rateToEur: number): Promise<{ ok: boolean; error?: string }> {
    const user = await requireSuper();
    const code = currencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: "Enter a 3-letter currency code, e.g. SEK." };
    if (!Number.isFinite(rateToEur) || rateToEur <= 0) return { ok: false, error: "Enter a positive rate." };
    try {
        await query(
            `insert into currency_rates (currency_code, rate_to_eur, updated_by) values ($1, $2, $3)
             on conflict (currency_code) do update set
                rate_to_eur = excluded.rate_to_eur, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`,
            [code, rateToEur, user.display_name]
        );
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/settings");
    return { ok: true };
}

// Refuses rather than orphaning a comp record's currency context - same
// guard pattern as deleteFunction/deleteBannerOffice.
export async function deleteCurrency(currencyCode: string): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    if (currencyCode === "EUR") return { ok: false, error: "EUR is the base currency and can't be removed." };
    const [compCount, histCount] = await Promise.all([
        queryOne<{ count: string }>(`select count(*) as count from employee_compensation where currency = $1`, [currencyCode]),
        queryOne<{ count: string }>(`select count(*) as count from compensation_history where currency = $1`, [currencyCode]),
    ]);
    const used = Number(compCount?.count ?? 0) + Number(histCount?.count ?? 0);
    if (used > 0) return { ok: false, error: `${used} record${used === 1 ? "" : "s"} were entered in this currency — can't remove it.` };
    try {
        await query(`delete from currency_rates where currency_code = $1`, [currencyCode]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidatePath("/settings");
    return { ok: true };
}

// Server-side conversion helper used by compensation save actions - the
// single source of truth for "what's today's rate", so the client never has
// to be trusted with doing this math itself (it only needs the rate for a
// live on-screen preview, never for what actually gets stored).
export async function getCurrentRate(currencyCode: string): Promise<number | null> {
    if (currencyCode === "EUR") return 1;
    const row = await queryOne<{ rate_to_eur: number }>(`select rate_to_eur from currency_rates where currency_code = $1`, [currencyCode]);
    return row ? row.rate_to_eur : null;
}
