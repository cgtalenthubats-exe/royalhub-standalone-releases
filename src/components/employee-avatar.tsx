import { cn } from "@/lib/utils";

function initials(name: string) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// Renders the profile photo if present, else a branded initials circle.
export function EmployeeAvatar({ name, photo, size = 40, className }: {
    name: string; photo?: string | null; size?: number; className?: string;
}) {
    const style = { width: size, height: size, minWidth: size };
    if (photo) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={photo}
                alt={name}
                style={style}
                className={cn("rounded-full object-cover", className)}
            />
        );
    }
    return (
        <div
            style={{ ...style, fontSize: size * 0.36 }}
            className={cn("flex items-center justify-center rounded-full bg-[#0b1f3a] font-bold text-white", className)}
        >
            {initials(name)}
        </div>
    );
}
