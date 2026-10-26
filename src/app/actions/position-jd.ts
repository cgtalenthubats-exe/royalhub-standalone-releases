"use server";

import { localStorage as db } from "@/lib/local/storage";
import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

const BUCKET = "position-jds";

// Upload a position's job-description PDF to Supabase Storage — mirrors
// resume.ts's pattern. View-only: no parsing/extraction, just storage + a link.
export async function uploadPositionJdPdf(positionId: number, formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File too large (max 10MB)" };
    if (file.type !== "application/pdf") return { ok: false, error: "Only PDF files are accepted" };

    const path = `position-${positionId}-${Date.now()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: "application/pdf",
        upsert: true,
    });
    if (upErr) return { ok: false, error: upErr.message };

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;
    await query(`update positions set jd_pdf_url = $1 where position_id = $2`, [url, positionId]);

    revalidatePath("/positions");
    revalidatePath("/proposals");
    return { ok: true, url };
}
