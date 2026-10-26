// Preset planning-tag colors for org chart nodes — one per employee, purely
// visual (no HR meaning attached), shared by the picker UI and the chart
// renderer so both always agree on what a given key looks like.
export interface TagColor { key: string; label: string; hex: string }

export const TAG_COLORS: TagColor[] = [
    { key: "red", label: "Red", hex: "#dc2626" },
    { key: "amber", label: "Amber", hex: "#d97706" },
    { key: "emerald", label: "Green", hex: "#059669" },
    { key: "sky", label: "Blue", hex: "#0284c7" },
    { key: "violet", label: "Purple", hex: "#7c3aed" },
    { key: "pink", label: "Pink", hex: "#db2777" },
    { key: "slate", label: "Grey", hex: "#475569" },
];

export function tagColorHex(key: string | null | undefined): string | null {
    if (!key) return null;
    return TAG_COLORS.find((c) => c.key === key)?.hex ?? null;
}
