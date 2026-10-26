import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import path from "path";

// Thin wrapper matching the shape of Azure Blob Storage's
// `db.storage.from(BUCKET)` (`.upload`, `.getPublicUrl`, `.remove`) so the 6
// action files that used it need only an import swap, not a rewrite — same
// pattern as the Supabase -> Azure storage migration this shape came from.
//
// Files live on the user's own disk under ./data/uploads/<bucket>/<path>.
// getPublicUrl() returns a route (see src/app/api/files/[bucket]/[...path]/route.ts)
// that streams the file back, since a local filesystem path can't be linked
// to directly the way Azure's public HTTPS blob URLs could.

const UPLOAD_ROOT = process.env.ROYALFLUSH_UPLOADS_PATH || path.join(process.cwd(), "data", "uploads");

interface UploadOpts {
    contentType?: string;
    upsert?: boolean;
}

function resolvePath(bucket: string, filePath: string): string {
    return path.join(UPLOAD_ROOT, bucket, filePath);
}

function containerHandle(bucket: string) {
    return {
        async upload(filePath: string, buffer: Buffer, opts: UploadOpts = {}) {
            try {
                const target = resolvePath(bucket, filePath);
                if (!opts.upsert && existsSync(target)) {
                    return { error: { message: "File already exists" } };
                }
                mkdirSync(path.dirname(target), { recursive: true });
                writeFileSync(target, buffer);
                return { error: null };
            } catch (err: any) {
                return { error: { message: err.message as string } };
            }
        },
        getPublicUrl(filePath: string) {
            return { data: { publicUrl: `/api/files/${bucket}/${filePath}` } };
        },
        async remove(paths: string[]) {
            try {
                for (const filePath of paths) {
                    const target = resolvePath(bucket, filePath);
                    if (existsSync(target)) rmSync(target);
                }
                return { error: null };
            } catch (err: any) {
                return { error: { message: err.message as string } };
            }
        },
    };
}

export const localStorage = { storage: { from: containerHandle } };
export { UPLOAD_ROOT, resolvePath };
