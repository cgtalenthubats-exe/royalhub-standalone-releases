"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download } from "lucide-react";

export interface PreviewTarget {
    filename: string;
    url: string;
    mime_type: string | null;
}

function isOfficeMime(mime: string): boolean {
    return mime.includes("presentationml") || mime.includes("wordprocessing") || mime.includes("msword")
        || mime.includes("ms-powerpoint") || mime.includes("spreadsheet") || mime.includes("ms-excel");
}

// Inline preview for PDFs and images; Office files go through Google's public
// viewer (works because both storage buckets are public, so the file URL is
// fetchable without auth). Anything else falls back to open/download only.
export function FilePreviewDialog({ target, onOpenChange }: { target: PreviewTarget | null; onOpenChange: (open: boolean) => void }) {
    const mime = target?.mime_type || "";
    const isPdf = mime.includes("pdf");
    const isImage = mime.startsWith("image/");
    const isOffice = isOfficeMime(mime);

    return (
        <Dialog open={!!target} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[88vh] w-[95vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-2.5">
                    <DialogTitle className="truncate pr-2 text-[13.5px]">{target?.filename}</DialogTitle>
                    <div className="flex shrink-0 items-center gap-1.5 pr-7">
                        {target && (
                            <>
                                <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                                    <a href={target.url} download={target.filename}><Download className="h-3 w-3" /> Download</a>
                                </Button>
                                <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
                                    <a href={target.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /> Open</a>
                                </Button>
                            </>
                        )}
                    </div>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
                    {target && isPdf && <iframe src={target.url} className="h-full w-full" title={target.filename} />}
                    {target && isImage && (
                        <div className="flex h-full items-center justify-center p-4">
                            <img src={target.url} alt={target.filename} className="max-h-full max-w-full object-contain" />
                        </div>
                    )}
                    {target && isOffice && (
                        <iframe
                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(target.url)}&embedded=true`}
                            className="h-full w-full"
                            title={target.filename}
                        />
                    )}
                    {target && !isPdf && !isImage && !isOffice && (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-slate-400">
                            <span>No inline preview available for this file type.</span>
                            <span className="text-xs">Use Download or Open above.</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
