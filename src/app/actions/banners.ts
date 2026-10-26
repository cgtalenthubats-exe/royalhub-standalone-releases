"use server";

import { localStorage as db } from "@/lib/local/storage";
import { query, queryOne } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { requireSuper } from "@/lib/auth/current-user";

const BUCKET = "banner-logos";
const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export interface BannerAdminItem {
    banner_id: number;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    employee_count: number;
}

export async function listBannersAdmin(): Promise<BannerAdminItem[]> {
    return query<BannerAdminItem>(`
        select
            b.banner_id, b.name, b.short_name, b.logo_url,
            coalesce(ec.employee_count, 0) as employee_count
        from banners b
        left join (
            select banner_id, count(*) as employee_count
            from employees
            where status in ('Active', 'Vacant')
            group by banner_id
        ) ec on ec.banner_id = b.banner_id
        order by b.name
    `);
}

export async function createBanner(input: { name: string; short_name: string | null }): Promise<{ ok: boolean; banner_id?: number; error?: string }> {
    await requireSuper();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Company name is required" };
    const existing = await queryOne<{ banner_id: number }>(`select banner_id from banners where name like $1 collate nocase`, [name]);
    if (existing) return { ok: false, error: `"${name}" already exists` };
    let bannerId: number | undefined;
    try {
        const created = await queryOne<{ banner_id: number }>(
            `insert into banners (name, short_name) values ($1, $2) returning banner_id`,
            [name, input.short_name?.trim() || null]
        );
        bannerId = created?.banner_id;
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateOrgViews();
    return { ok: true, banner_id: bannerId };
}

export async function updateBanner(bannerId: number, input: { name: string; short_name: string | null }): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Company name is required" };
    try {
        await query(`update banners set name = $1, short_name = $2 where banner_id = $3`, [name, input.short_name?.trim() || null, bannerId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    revalidateOrgViews();
    return { ok: true };
}

export async function uploadBannerLogo(bannerId: number, formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
    await requireSuper();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > MAX_SIZE) return { ok: false, error: "Logo too large (max 2MB)" };
    if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "Logo must be a PNG, JPG, SVG or WebP image" };

    const existing = await queryOne<{ logo_url: string | null }>(`select logo_url from banners where banner_id = $1`, [bannerId]);

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `banner-${bannerId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    try {
        await query(`update banners set logo_url = $1 where banner_id = $2`, [url, bannerId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }

    // Drop the previous file so replacing a logo repeatedly doesn't accumulate
    // orphans in the bucket.
    const oldPath = storagePathFromUrl(existing?.logo_url);
    if (oldPath) await db.storage.from(BUCKET).remove([oldPath]);

    revalidateOrgViews();
    return { ok: true, url };
}

export async function removeBannerLogo(bannerId: number): Promise<{ ok: boolean; error?: string }> {
    await requireSuper();
    const existing = await queryOne<{ logo_url: string | null }>(`select logo_url from banners where banner_id = $1`, [bannerId]);
    try {
        await query(`update banners set logo_url = null where banner_id = $1`, [bannerId]);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
    const oldPath = storagePathFromUrl(existing?.logo_url);
    if (oldPath) await db.storage.from(BUCKET).remove([oldPath]);
    revalidateOrgViews();
    return { ok: true };
}

// Public URLs look like /api/files/banner-logos/<path>
function storagePathFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const marker = `/api/files/${BUCKET}/`;
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length);
}

function revalidateOrgViews() {
    revalidatePath("/settings");
    revalidatePath("/org/banner");
    revalidatePath("/org/function");
    revalidatePath("/org/headcount");
}
