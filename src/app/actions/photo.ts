"use server";

import { localStorage as db, resolvePath } from "@/lib/local/storage";
import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";
import { readFile } from "fs/promises";
import path from "path";

const BUCKET = "profile-photos";

// Upload a profile photo to Supabase Storage and update employees.photo.
export async function uploadEmployeePhoto(employeeId: number, formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File too large (max 5MB)" };

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `employee-${employeeId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || "image/png",
        upsert: true,
    });
    if (upErr) return { ok: false, error: upErr.message };

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;
    await query(`update employees set photo = $1 where employee_id = $2`, [url, employeeId]);

    revalidatePath(`/employees/${employeeId}`);
    return { ok: true, url };
}

const MIME_BY_EXT: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
};

// Fetch a (possibly cross-origin) image server-side and return it as a data
// URI — pptxgenjs's addImage() fetches remote URLs from the browser, and
// third-party hosts like i.pravatar.cc don't send CORS headers, so that fetch
// fails silently there. Fetching here avoids CORS entirely (no browser involved).
export async function fetchImageAsDataUri(url: string): Promise<string | null> {
    // Local uploads (banner logos, profile photos) are served from
    // /api/files/<bucket>/<path>, a relative URL — this function is a "use
    // server" action, so it runs on the server even when called from the
    // client-side pptxgenjs export, and a relative URL has no page origin to
    // resolve against there. Read the file straight off disk instead of
    // looping a fetch() back through HTTP to this same server.
    const localMatch = url.match(/^\/api\/files\/([^/]+)\/(.+)$/);
    if (localMatch) {
        const [, bucket, filePath] = localMatch;
        try {
            const buffer = await readFile(resolvePath(bucket, filePath));
            const contentType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "image/png";
            return `data:${contentType};base64,${buffer.toString("base64")}`;
        } catch {
            return null;
        }
    }
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await res.arrayBuffer());
        return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch {
        return null;
    }
}
