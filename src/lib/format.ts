// Derived-value + formatting helpers shared across pages.

export function yearsBetween(from: string | null | undefined, to: Date = new Date()): number | null {
    if (!from) return null;
    const start = new Date(from);
    if (isNaN(start.getTime())) return null;
    const ms = to.getTime() - start.getTime();
    return Math.max(0, ms / (1000 * 60 * 60 * 24 * 365.25));
}

export function formatYears(from: string | null | undefined): string {
    if (!from) return "-";
    const start = new Date(from);
    if (isNaN(start.getTime())) return "-";
    const now = new Date();
    // Calendar-based whole months so "11 Years 4 months" reads exactly.
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    if (months < 0) months = 0;
    const y = Math.floor(months / 12);
    const m = months % 12;
    const yPart = `${y} ${y === 1 ? "Year" : "Years"}`;
    const mPart = `${m} ${m === 1 ? "month" : "months"}`;
    if (y === 0) return mPart;
    if (m === 0) return yPart;
    return `${yPart} ${mPart}`;
}

// Whole years elapsed since a birthdate — plain "age", not the decimal
// tenure used by yearsBetween.
export function calcAge(dob: string | null | undefined): number | null {
    if (!dob) return null;
    const b = new Date(dob);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
    if (beforeBirthday) age -= 1;
    return Math.max(0, age);
}

// Retirement age is entered per employee (varies by country) rather than
// assumed — so this is null until that's set.
export function estimatedRetirementDate(dob: string | null | undefined, retirementAge: number | null | undefined): Date | null {
    if (!dob || retirementAge == null) return null;
    const b = new Date(dob);
    if (isNaN(b.getTime())) return null;
    const d = new Date(b);
    d.setFullYear(d.getFullYear() + retirementAge);
    return d;
}

// Whole years remaining until a future date — the mirror of calcAge (which
// counts elapsed years since a past date). Floors like calcAge does, so
// "9 years from now" means the anniversary hasn't happened yet this year.
export function yearsUntil(target: Date): number {
    const now = new Date();
    let years = target.getFullYear() - now.getFullYear();
    const beforeAnniversary = now.getMonth() > target.getMonth() || (now.getMonth() === target.getMonth() && now.getDate() > target.getDate());
    if (beforeAnniversary) years -= 1;
    return Math.max(0, years);
}

export function formatCurrency(value: number | null | undefined, currency = "EUR"): string {
    if (value === null || value === undefined) return "-";
    const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "THB" ? "฿" : "";
    return `${symbol}${Math.round(value).toLocaleString("en-US")}`;
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Compensation-only (D8): base + STI target + LTI target + other bonus. Excludes all allowances/benefits.
export function compensationOnly(c: {
    base_salary?: number | null;
    sti_target?: number | null;
    lti_target?: number | null;
    other_bonus?: number | null;
} | null | undefined): number {
    if (!c) return 0;
    return (c.base_salary || 0) + (c.sti_target || 0) + (c.lti_target || 0) + (c.other_bonus || 0);
}

// Grade → color class for performance badges
export function gradeColor(grade: string | null | undefined): string {
    const g = (grade || "").trim();
    if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (g.startsWith("B+")) return "bg-sky-100 text-sky-700 border-sky-200";
    if (g.startsWith("B")) return "bg-amber-100 text-amber-700 border-amber-200";
    return "bg-slate-100 text-slate-600 border-slate-200";
}
