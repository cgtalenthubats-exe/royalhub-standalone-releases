"use server";

import { localStorage as db } from "@/lib/local/storage";
import { query } from "@/lib/postgres/client";
import { revalidatePath } from "next/cache";

const BUCKET = "employee-resumes";

// Upload a CV/résumé to Supabase Storage and update employees.resume_url —
// mirrors photo.ts's pattern. No parsing/extraction, just storage + a link.
export async function uploadEmployeeResume(employeeId: number, formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "No file provided" };
    if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File too large (max 10MB)" };

    const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
    const path = `employee-${employeeId}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, {
        contentType: file.type || "application/pdf",
        upsert: true,
    });
    if (upErr) return { ok: false, error: upErr.message };

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    const url = data.publicUrl;
    await query(`update employees set resume_url = $1 where employee_id = $2`, [url, employeeId]);

    revalidatePath(`/employees/${employeeId}`);
    return { ok: true, url };
}
