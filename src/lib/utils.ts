import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Formats a number or string into a comma-separated string (e.g., 400000 -> 400,000)
 */
export function formatNumberWithCommas(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    
    // Remove existing commas and non-numeric chars except dot
    const cleanValue = value.toString().replace(/,/g, "");
    const number = parseFloat(cleanValue);
    
    if (isNaN(number)) return value.toString();
    
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(number);
}

/**
 * Strips everything except digits and decimal point
 */
export function parseNumberFromCommas(value: string): string {
    return value.replace(/[^0-9.]/g, "");
}
