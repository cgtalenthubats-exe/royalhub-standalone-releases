"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadEmployeePhoto } from "@/app/actions/photo";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function PhotoUpload({ employeeId, name, photo, size = 80 }: {
    employeeId: number; name: string; photo?: string | null; size?: number;
}) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);

    async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadEmployeePhoto(employeeId, fd);
        setLoading(false);
        if (res.ok) { toast.success("Photo updated"); router.refresh(); }
        else toast.error(res.error || "Upload failed");
    }

    return (
        <div className="group relative" style={{ width: size, height: size }}>
            <EmployeeAvatar name={name} photo={photo} size={size} />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={loading}
                title="Change photo"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            </button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onChange} />
        </div>
    );
}
