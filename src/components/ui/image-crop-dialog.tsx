"use client";

import { useState, useCallback } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn } from "lucide-react";

// Renders the picked file into <canvas> at exactly the selected crop
// rectangle and exports it — the same pixels the user framed in the
// cropper, nothing more.
async function cropToBlob(imageSrc: string, area: Area, mimeType: string): Promise<Blob> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = imageSrc;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.width);
    canvas.height = Math.round(area.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export crop"))), mimeType, 0.92);
    });
}

// Logo cards on the org chart (and this same table) are a wide, short strip
// — object-contain keeps whatever's uploaded from distorting, but a tall or
// square source image ends up tiny inside that strip. Cropping to the same
// aspect ratio up front means what you see here is what shows up there.
export const LOGO_CROP_ASPECT = 150 / 26;

export function ImageCropDialog({ open, imageSrc, mimeType, onCancel, onConfirm, saving }: {
    open: boolean; imageSrc: string | null; mimeType: string;
    onCancel: () => void; onConfirm: (blob: Blob) => void; saving?: boolean;
}) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedArea, setCroppedArea] = useState<Area | null>(null);

    const onCropComplete = useCallback((_area: Area, areaPixels: Area) => setCroppedArea(areaPixels), []);

    async function confirm() {
        if (!imageSrc || !croppedArea) return;
        const blob = await cropToBlob(imageSrc, croppedArea, mimeType);
        onConfirm(blob);
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Crop logo</DialogTitle></DialogHeader>
                <div className="relative h-56 w-full overflow-hidden rounded-lg bg-slate-100">
                    {imageSrc && (
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={LOGO_CROP_ASPECT}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    <ZoomIn className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input
                        type="range" min={1} max={4} step={0.01} value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="h-1.5 w-full cursor-pointer accent-[#0b1f3a]"
                    />
                </div>
                <p className="text-[11px] text-slate-400">Drag to reposition, use the slider to zoom. The framed area is exactly what shows up on the org-chart card.</p>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
                    <Button onClick={confirm} disabled={saving || !croppedArea}>{saving ? "Uploading…" : "Use this crop"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
