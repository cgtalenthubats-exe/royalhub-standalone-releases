
/**
 * Utility for robust date handling and dynamic age calculation.
 * Handles inconsistent formats like M/D/YYYY, YYYY-MM-DD, and full dates.
 */

/**
 * Parses a date string in various formats (M/D/YYYY, YYYY-MM-DD).
 */
export function parseAnyDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    // Handle M-YYYY or MM-YYYY (with - or /)
    const shortDateMatch = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);
    if (shortDateMatch) {
        const month = parseInt(shortDateMatch[1]);
        const year = parseInt(shortDateMatch[2]);
        if (month >= 1 && month <= 12) {
            return new Date(year, month - 1, 1);
        }
    }

    // Handle ISO or YYYY-MM-DD
    if (trimmed.includes('-')) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }

    // Handle M/D/YYYY or D/M/YYYY
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
            const d = new Date(trimmed);
            if (!isNaN(d.getTime())) return d;

            const [m, dPart, y] = parts.map(p => parseInt(p));
            if (!isNaN(m) && !isNaN(dPart) && !isNaN(y)) {
                return new Date(y, m - 1, dPart);
            }
        }
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Safely extracts a year from a string that might be a year only or a full date.
 */
export function extractYear(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val !== 'string') return null;

    const trimmed = val.trim();
    if (!trimmed) return null;

    // Is it just a 4-digit year?
    if (/^\d{4}$/.test(trimmed)) {
        return parseInt(trimmed);
    }

    // Try to parse as date and get year
    const d = parseAnyDate(trimmed);
    if (d) return d.getFullYear();

    // Last resort: find any 4-digit number
    const match = trimmed.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : null;
}

/**
 * Calculates current age accurately based on DOB and Fallback Year.
 * Logic: Priority DOB > Bachelor Year (+22)
 */
export function getEffectiveAge(dob: string | null | undefined, gradValue: string | number | null | undefined): string {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    // 1. Try DOB (Accurate calculation)
    const birthDate = parseAnyDate(dob);
    if (birthDate) {
        let age = currentYear - birthDate.getFullYear();
        const m = currentMonth - birthDate.getMonth();
        if (m < 0 || (m === 0 && currentDate < birthDate.getDate())) {
            age--;
        }
        return age.toString();
    }

    // 2. Fallback to Bachelor Year
    const gradYear = extractYear(gradValue);
    if (gradYear) {
        // Standard formula: current_year - grad_year + 22
        const age = (currentYear - gradYear) + 22;
        return age.toString();
    }

    return "";
}

/**
 * Formats a date string or Date object for HTML5 date inputs (YYYY-MM-DD).
 */
export function formatDateForInput(date: string | Date | null | undefined): string {
    if (!date) return "";

    let d: Date | null = null;
    if (date instanceof Date) {
        d = date;
    } else {
        d = parseAnyDate(date);
    }

    if (!d || isNaN(d.getTime())) return "";

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Formats date for display (e.g. Apr-16-2026).
 */
export function formatDateForDisplay(date: string | Date | null | undefined): string {
    const d = date instanceof Date ? date : parseAnyDate(date as string);
    if (!d || isNaN(d.getTime())) return "N/A";

    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = d.getFullYear();

    return `${month}-${day}-${year}`;
}

/**
 * Calculates Bachelor Year from Age (CurrentYear - Age + 22)
 */
export function calculateBachelorYearFromAge(age: number | string): number | null {
    const ageNum = typeof age === 'string' ? parseInt(age) : age;
    if (isNaN(ageNum)) return null;

    const currentYear = new Date().getFullYear();
    // Formula: Current Year - Age + 22
    return currentYear - ageNum + 22;
}

/**
 * Formats a date string or Date object to mm-YYYY.
 */
export function formatMonthYear(date: string | Date | null | undefined): string {
    if (!date) return "";
    let d: Date | null = null;
    if (date instanceof Date) {
        d = date;
    } else {
        d = parseAnyDate(date);
    }
    // If not a valid date, just return the string as is (might already be mm-YYYY)
    if (!d || isNaN(d.getTime())) {
        if (typeof date === 'string') {
            const match = date.match(/^(\d{2})[-/](\d{4})$/);
            if (match) return `${match[1]}-${match[2]}`;
            return date;
        }
        return "";
    }

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}-${year}`;
}

/**
 * Parses mm-YYYY (or mm/YYYY) string to YYYY-MM-DD.
 */
export function parseMonthYearToInput(val: string): string {
    const match = val.match(/^(\d{1,2})[-/](\d{4})$/);
    if (match) {
        const month = match[1].padStart(2, '0');
        const year = match[2];
        return `${year}-${month}-01`;
    }
    return val;
}
