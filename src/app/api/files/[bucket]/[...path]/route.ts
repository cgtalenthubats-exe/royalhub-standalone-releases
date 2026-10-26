import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { resolvePath } from "@/lib/local/storage";

// Streams a file back from local disk — the standalone edition's replacement
// for Azure Blob Storage's public HTTPS blob URLs (which src/lib/local/storage.ts's
// getPublicUrl() points at this route instead of a direct blob URL).

const MIME_TYPES: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ bucket: string; path: string[] }> }
) {
    const { bucket, path: pathSegments } = await params;
    const filePath = pathSegments.join("/");

    // Guard against path traversal — resolvePath joins under UPLOAD_ROOT, but
    // reject anything containing ".." before it ever reaches the filesystem.
    if (bucket.includes("..") || pathSegments.some((seg) => seg.includes(".."))) {
        return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const target = resolvePath(bucket, filePath);
    if (!existsSync(target)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = path.extname(target).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const buffer = readFileSync(target);

    return new NextResponse(buffer, {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    });
}
